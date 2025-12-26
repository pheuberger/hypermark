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
    const keyData = base64ToArrayBuffer(base64Key)
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
 * @returns {Promise<CryptoKey>} - Derived AES key
 */
export async function deriveSharedSecret(privateKey, publicKey) {
  try {
    const sharedSecret = await crypto.subtle.deriveKey(
      {
        name: 'ECDH',
        public: publicKey,
      },
      privateKey,
      {
        name: 'AES-GCM',
        length: 256,
      },
      false, // non-extractable
      ['encrypt', 'decrypt']
    )

    return sharedSecret
  } catch (error) {
    console.error('Failed to derive shared secret:', error)
    throw new Error('Failed to derive shared secret: ' + error.message)
  }
}

/**
 * Derive session key from shared secret using HKDF
 * @param {CryptoKey} sharedSecret - Shared secret from ECDH
 * @param {string} sessionId - Session ID for salt
 * @param {string} info - Context string
 * @returns {Promise<CryptoKey>} - Derived session key
 */
export async function deriveSessionKey(sharedSecret, sessionId, info = 'hypermark-pairing-v1') {
  try {
    // First, we need to get the raw shared secret to use as key material
    // Since sharedSecret is non-extractable, we'll use deriveBits instead
    const sharedSecretBits = await crypto.subtle.deriveBits(
      {
        name: 'ECDH',
        public: sharedSecret.publicKey || sharedSecret,
      },
      sharedSecret.privateKey || sharedSecret,
      256
    )

    // Import as raw key for HKDF
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
      false, // non-extractable
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

    const ciphertext = await crypto.subtle.encrypt(options, key, data)

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
    const options = {
      name: 'AES-GCM',
      iv: iv,
    }

    if (additionalData) {
      options.additionalData = new TextEncoder().encode(additionalData)
    }

    const plaintext = await crypto.subtle.decrypt(options, key, ciphertext)

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
