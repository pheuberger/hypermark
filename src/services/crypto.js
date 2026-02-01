/**
 * Cryptographic utilities using Web Crypto API
 * Handles device identity keypairs, LEK generation, ECDH operations
 */

/**
 * Check if Web Crypto API is available
 * @returns {boolean}
 */
export function isWebCryptoAvailable() {
  return !!(window.crypto && window.crypto.subtle)
}

/**
 * Generate device identity keypair (ECDH P-256)
 * This keypair is permanent and used for device authentication
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateDeviceKeypair() {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available')
  }

  try {
    const keypair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      false, // non-extractable (secure storage)
      ['deriveKey', 'deriveBits']
    )

    return keypair
  } catch (error) {
    console.error('Failed to generate device keypair:', error)
    throw new Error('Failed to generate device keypair: ' + error.message)
  }
}

/**
 * Generate ephemeral keypair for pairing
 * These are temporary keys (5 min lifetime) used during pairing
 * @returns {Promise<CryptoKeyPair>}
 */
export async function generateEphemeralKeypair() {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available')
  }

  try {
    const keypair = await crypto.subtle.generateKey(
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true, // extractable (for export during pairing)
      ['deriveKey', 'deriveBits']
    )

    return keypair
  } catch (error) {
    console.error('Failed to generate ephemeral keypair:', error)
    throw new Error('Failed to generate ephemeral keypair: ' + error.message)
  }
}

/**
 * Export public key to base64 string
 * @param {CryptoKey} publicKey - Public key to export
 * @returns {Promise<string>} - Base64 encoded public key
 */
export async function exportPublicKey(publicKey) {
  try {
    const exported = await crypto.subtle.exportKey('spki', publicKey)
    return arrayBufferToBase64(exported)
  } catch (error) {
    console.error('Failed to export public key:', error)
    throw new Error('Failed to export public key: ' + error.message)
  }
}

/**
 * Import public key from base64 string
 * @param {string} base64Key - Base64 encoded public key
 * @returns {Promise<CryptoKey>} - Imported public key
 */
export async function importPublicKey(base64Key) {
  try {
    const keyData = base64ToUint8Array(base64Key)
    const publicKey = await crypto.subtle.importKey(
      'spki',
      keyData,
      {
        name: 'ECDH',
        namedCurve: 'P-256',
      },
      true,
      []
    )
    return publicKey
  } catch (error) {
    console.error('Failed to import public key:', error)
    throw new Error('Failed to import public key: ' + error.message)
  }
}

/**
 * Perform ECDH key agreement to derive shared secret
 * @param {CryptoKey} privateKey - Local private key
 * @param {CryptoKey} publicKey - Peer's public key
 * @returns {Promise<ArrayBuffer>} - Raw shared secret bytes (for HKDF)
 */
export async function deriveSharedSecret(privateKey, publicKey) {
  try {
    // Use deriveBits instead of deriveKey to get raw bytes
    // This avoids creating an intermediate extractable AES key
    const sharedSecretBits = await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: publicKey,
      },
      privateKey,
      256 // 256 bits = 32 bytes
    )

    return sharedSecretBits
  } catch (error) {
    console.error('Failed to derive shared secret:', error)
    throw new Error('Failed to derive shared secret: ' + error.message)
  }
}

/**
 * Derive session key from shared secret using HKDF
 * @param {ArrayBuffer} sharedSecretBits - Raw shared secret bytes from ECDH
 * @param {string} sessionId - Session ID for salt
 * @param {string} info - Context string
 * @returns {Promise<CryptoKey>} - Derived session key (non-extractable AES-GCM)
 */
export async function deriveSessionKey(sharedSecretBits, sessionId, info = 'hypermark-pairing-v1') {
  try {
    // Import raw shared secret as HKDF key material
    const baseKey = await crypto.subtle.importKey(
      'raw',
      sharedSecretBits,
      'HKDF',
      false,
      ['deriveKey']
    )

    // Derive session key using HKDF
    const sessionKey = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new TextEncoder().encode(sessionId),
        info: new TextEncoder().encode(info),
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // non-extractable (secure!)
      ['encrypt', 'decrypt']
    )

    return sessionKey
  } catch (error) {
    console.error('Failed to derive session key:', error)
    throw new Error('Failed to derive session key: ' + error.message)
  }
}

/**
 * Encrypt data using AES-GCM
 * @param {CryptoKey} key - AES key
 * @param {ArrayBuffer} data - Data to encrypt
 * @param {string} additionalData - Additional authenticated data (optional)
 * @returns {Promise<{ciphertext: ArrayBuffer, iv: Uint8Array}>}
 */
export async function encryptData(key, data, additionalData = '') {
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12))

    const options = {
      name: 'AES-GCM',
      iv: iv,
    }

    if (additionalData) {
      options.additionalData = new TextEncoder().encode(additionalData)
    }

    // Ensure data is Uint8Array to avoid cross-realm ArrayBuffer issues
    const dataBytes = data instanceof Uint8Array ? data : new Uint8Array(data)
    const ciphertext = await crypto.subtle.encrypt(options, key, dataBytes)

    return { ciphertext, iv }
  } catch (error) {
    console.error('Failed to encrypt data:', error)
    throw new Error('Failed to encrypt data: ' + error.message)
  }
}

/**
 * Decrypt data using AES-GCM
 * @param {CryptoKey} key - AES key
 * @param {ArrayBuffer} ciphertext - Encrypted data
 * @param {Uint8Array} iv - Initialization vector
 * @param {string} additionalData - Additional authenticated data (optional)
 * @returns {Promise<ArrayBuffer>} - Decrypted data
 */
export async function decryptData(key, ciphertext, iv, additionalData = '') {
  try {
    // Ensure iv is Uint8Array to avoid cross-realm issues
    const ivBytes = iv instanceof Uint8Array ? iv : new Uint8Array(iv)

    const options = {
      name: 'AES-GCM',
      iv: ivBytes,
    }

    if (additionalData) {
      options.additionalData = new TextEncoder().encode(additionalData)
    }

    // Ensure ciphertext is Uint8Array to avoid cross-realm ArrayBuffer issues
    const ciphertextBytes = ciphertext instanceof Uint8Array ? ciphertext : new Uint8Array(ciphertext)
    const plaintext = await crypto.subtle.decrypt(options, key, ciphertextBytes)

    return plaintext
  } catch (error) {
    console.error('Failed to decrypt data:', error)
    throw new Error('Failed to decrypt data: ' + error.message)
  }
}

/**
 * Sign data using HMAC
 * @param {CryptoKey} key - HMAC key (can use AES key for signing)
 * @param {ArrayBuffer} data - Data to sign
 * @returns {Promise<ArrayBuffer>} - Signature
 */
export async function signData(key, data) {
  try {
    // For HMAC, we need to derive an HMAC key from the AES key
    // We'll export and reimport as HMAC key
    const rawKey = await crypto.subtle.exportKey('raw', key)
    const hmacKey = await crypto.subtle.importKey(
      'raw',
      rawKey,
      {
        name: 'HMAC',
        hash: 'SHA-256',
      },
      false,
      ['sign']
    )

    const signature = await crypto.subtle.sign('HMAC', hmacKey, data)
    return signature
  } catch (error) {
    console.error('Failed to sign data:', error)
    throw new Error('Failed to sign data: ' + error.message)
  }
}

// Utility functions

/**
 * Convert ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
export function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * Convert base64 string to Uint8Array
 * Use this instead of base64ToArrayBuffer for crypto.subtle operations
 * to avoid cross-realm ArrayBuffer issues in Node.js test environments
 * @param {string} base64
 * @returns {Uint8Array}
 */
export function base64ToUint8Array(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Convert string to ArrayBuffer
 * @param {string} str
 * @returns {ArrayBuffer}
 */
export function stringToArrayBuffer(str) {
  return new TextEncoder().encode(str).buffer
}

/**
 * Convert ArrayBuffer to string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function arrayBufferToString(buffer) {
  return new TextDecoder().decode(buffer)
}

/**
 * Generate random UUID v4
 * @returns {string}
 */
export function generateUUID() {
  return crypto.randomUUID()
}

/**
 * Generate random bytes
 * @param {number} length - Number of bytes
 * @returns {Uint8Array}
 */
export function generateRandomBytes(length) {
  return crypto.getRandomValues(new Uint8Array(length))
}

/**
 * Generate LEK (Ledger Encryption Key) for encrypting Fireproof data
 * This is a shared symmetric key used by all paired devices
 * @returns {Promise<CryptoKey>} - AES-256-GCM key (non-extractable)
 */
export async function generateLEK() {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available')
  }

  try {
    const lek = await crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256,
      },
      true, // extractable during pairing only (will be re-imported as non-extractable)
      ['encrypt', 'decrypt']
    )

    return lek
  } catch (error) {
    console.error('Failed to generate LEK:', error)
    throw new Error('Failed to generate LEK: ' + error.message)
  }
}

/**
 * Export LEK as raw bytes (for secure transfer during pairing)
 * @param {CryptoKey} lek - LEK to export
 * @returns {Promise<ArrayBuffer>} - Raw key bytes
 */
export async function exportLEK(lek) {
  try {
    const rawKey = await crypto.subtle.exportKey('raw', lek)
    return rawKey
  } catch (error) {
    console.error('Failed to export LEK:', error)
    throw new Error('Failed to export LEK: ' + error.message)
  }
}

/**
 * Import LEK from raw bytes
 * @param {ArrayBuffer} rawKey - Raw key bytes
 * @param {boolean} extractable - Whether key should be extractable (false for security)
 * @returns {Promise<CryptoKey>} - Imported LEK
 */
export async function importLEK(rawKey, extractable = false) {
  try {
    const lek = await crypto.subtle.importKey(
      'raw',
      rawKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      extractable, // typically false for non-extractable storage
      ['encrypt', 'decrypt']
    )

    return lek
  } catch (error) {
    console.error('Failed to import LEK:', error)
    throw new Error('Failed to import LEK: ' + error.message)
  }
}

/**
 * Derive Yjs room password from LEK using HKDF
 * This allows us to avoid exposing the raw LEK to the Yjs network layer
 * The derived password is cryptographically different from the LEK (defense in depth)
 * @param {CryptoKey} lek - LEK to derive password from (must be extractable)
 * @returns {Promise<string>} - Base64-encoded derived password
 */
export async function deriveYjsPassword(lek) {
  try {
    // Export LEK to raw bytes (requires extractable=true)
    const lekRaw = await crypto.subtle.exportKey('raw', lek)

    // Import raw bytes as HKDF key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      lekRaw,
      'HKDF',
      false, // not extractable (only used for this derivation)
      ['deriveBits']
    )

    // Derive password using HKDF with fixed info (domain separator)
    // All devices with same LEK will derive the same password
    const info = new TextEncoder().encode('hypermark-yjs-room-password-v1')
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: new Uint8Array(32), // Zero salt is fine for high-entropy input
        info: info, // Domain separator ensures derived key is different from LEK
      },
      keyMaterial,
      256 // 256 bits output
    )

    // Convert to base64 for use as Yjs room password
    return arrayBufferToBase64(derivedBits)
  } catch (error) {
    console.error('Failed to derive Yjs password:', error)
    throw new Error('Failed to derive Yjs password: ' + error.message)
  }
}

/**
 * Derive deterministic Nostr private key material from LEK using HKDF
 * Creates a 32-byte private key suitable for secp256k1 curve used by Nostr protocol
 * Uses proper domain separation to prevent key reuse vulnerabilities
 * @param {CryptoKey} lek - LEK to derive from (must be extractable for key export)
 * @returns {Promise<Uint8Array>} - 32-byte private key material for secp256k1
 * @throws {Error} - If LEK is unavailable, not extractable, or derivation fails
 */
export async function deriveNostrPrivateKeyMaterial(lek) {
  if (!isWebCryptoAvailable()) {
    throw new Error('Web Crypto API is not available')
  }

  if (!lek) {
    throw new Error('LEK is required for Nostr keypair derivation')
  }

  try {
    // Export LEK to raw bytes (requires extractable=true)
    // This will throw if LEK is not extractable
    const lekRaw = await crypto.subtle.exportKey('raw', lek)

    // Import raw LEK bytes as HKDF key material
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      lekRaw,
      'HKDF',
      false, // not extractable (only used for this derivation)
      ['deriveBits']
    )

    // Derive private key bytes using HKDF with domain-specific parameters
    // Salt and info provide cryptographic domain separation from other uses
    const salt = new TextEncoder().encode('nostr-keypair')
    const info = new TextEncoder().encode('hypermark-v1')

    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt, // Domain separator: "nostr-keypair"
        info: info, // Version/context separator: "hypermark-v1"
      },
      keyMaterial,
      256 // 256 bits = 32 bytes (secp256k1 private key size)
    )

    // Return as Uint8Array for compatibility with secp256k1 libraries
    return new Uint8Array(derivedBits)
  } catch (error) {
    // Provide specific error messages for common failure cases
    if (error.name === 'InvalidAccessError') {
      throw new Error('LEK is not extractable - cannot derive Nostr keypair')
    }

    console.error('Failed to derive Nostr private key material:', error)
    throw new Error('Failed to derive Nostr private key material: ' + error.message)
  }
}
