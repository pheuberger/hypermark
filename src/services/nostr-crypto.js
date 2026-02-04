/**
 * Nostr Cryptographic Utilities
 *
 * Handles Nostr-specific cryptographic operations including:
 * - LEK-based deterministic key derivation using HKDF
 * - secp256k1 keypair generation for Nostr protocol compatibility
 *
 * Security Notes:
 * - Uses HKDF (RFC 5869) for proper key derivation, not simple hashing
 * - Domain separation via salt/info parameters prevents key reuse
 * - Same LEK always produces identical Nostr keys across devices
 * - Derived private keys are kept in memory only, never persisted
 */

import { isWebCryptoAvailable, arrayBufferToBase64 } from "./crypto.js";
import * as secp256k1 from '@noble/secp256k1';
import { bech32 } from 'bech32';

// ============================================================================
// Bech32 Encoding for Nostr (npub/nsec)
// ============================================================================

/**
 * Encode data as bech32
 * @param {string} hrp - Human-readable part (e.g., "npub", "nsec")
 * @param {Uint8Array} data - Data to encode (32 bytes for Nostr keys)
 * @returns {string} - Bech32 encoded string
 */
export function bech32Encode(hrp, data) {
  const words = bech32.toWords(data);
  return bech32.encode(hrp, words);
}

/**
 * Decode a bech32 string
 * @param {string} str - Bech32 encoded string
 * @returns {{ hrp: string, data: Uint8Array }} - Decoded HRP and data
 * @throws {Error} If the string is invalid
 */
export function bech32Decode(str) {
  const { prefix, words } = bech32.decode(str);
  const data = bech32.fromWords(words);
  return { hrp: prefix, data: new Uint8Array(data) };
}

/**
 * Encode a Nostr public key as npub
 * @param {Uint8Array} pubkey - 32-byte x-only public key
 * @returns {string} - npub1... encoded string
 */
export function encodeNpub(pubkey) {
  if (pubkey.length !== 32) {
    throw new Error("Public key must be 32 bytes (x-only format)");
  }
  return bech32Encode("npub", pubkey);
}

/**
 * Encode a Nostr private key as nsec
 * @param {Uint8Array} privkey - 32-byte private key
 * @returns {string} - nsec1... encoded string
 */
export function encodeNsec(privkey) {
  if (privkey.length !== 32) {
    throw new Error("Private key must be 32 bytes");
  }
  return bech32Encode("nsec", privkey);
}

/**
 * Decode an npub string to a public key
 * @param {string} npub - npub1... encoded string
 * @returns {Uint8Array} - 32-byte x-only public key
 */
export function decodeNpub(npub) {
  const { hrp, data } = bech32Decode(npub);
  if (hrp !== "npub") {
    throw new Error(`Expected npub prefix, got ${hrp}`);
  }
  if (data.length !== 32) {
    throw new Error(`Invalid npub data length: ${data.length}`);
  }
  return data;
}

/**
 * Decode an nsec string to a private key
 * @param {string} nsec - nsec1... encoded string
 * @returns {Uint8Array} - 32-byte private key
 */
export function decodeNsec(nsec) {
  const { hrp, data } = bech32Decode(nsec);
  if (hrp !== "nsec") {
    throw new Error(`Expected nsec prefix, got ${hrp}`);
  }
  if (data.length !== 32) {
    throw new Error(`Invalid nsec data length: ${data.length}`);
  }
  return data;
}

// Configure @noble/secp256k1 with Web Crypto SHA-256
// Required for Schnorr signatures in v3.x
// The library needs both sha256 and hmacSha256 configured
if (typeof crypto !== 'undefined' && crypto.subtle) {
  // Configure SHA-256
  secp256k1.hashes.sha256 = (message) => {
    // Sync version - not supported with Web Crypto, will throw
    throw new Error('Use sha256Async instead');
  };

  secp256k1.hashes.sha256Async = async (message) => {
    const hashBuffer = await crypto.subtle.digest('SHA-256', message);
    return new Uint8Array(hashBuffer);
  };

  // Configure HMAC-SHA256
  secp256k1.hashes.hmacSha256 = (key, ...messages) => {
    // Sync version - not supported with Web Crypto, will throw
    throw new Error('Use hmacSha256Async instead');
  };

  secp256k1.hashes.hmacSha256Async = async (key, ...messages) => {
    const cKey = await crypto.subtle.importKey(
      'raw',
      key,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const combined = new Uint8Array(messages.reduce((acc, m) => acc + m.length, 0));
    let offset = 0;
    for (const msg of messages) {
      combined.set(msg, offset);
      offset += msg.length;
    }
    const sig = await crypto.subtle.sign('HMAC', cKey, combined);
    return new Uint8Array(sig);
  };
}

/**
 * SHA-256 hash function using Web Crypto API
 * Used for Nostr event ID computation and Schnorr signatures
 */
async function sha256(message) {
  const msgBuffer = typeof message === 'string'
    ? new TextEncoder().encode(message)
    : message;
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return new Uint8Array(hashBuffer);
}

/**
 * HKDF salt for Nostr keypair derivation
 * This provides domain separation from other LEK-derived keys
 */
const NOSTR_KEYPAIR_SALT = "nostr-keypair";

/**
 * HKDF info parameter for Nostr keypair derivation
 * Version identifier allows future algorithm changes
 */
const NOSTR_KEYPAIR_INFO = "hypermark-v1";

/**
 * Derive a deterministic seed from LEK for Nostr keypair generation
 *
 * Uses HKDF (HMAC-based Key Derivation Function) to securely derive
 * a 32-byte seed suitable for secp256k1 private key generation.
 *
 * The derived seed is deterministic: the same LEK will always produce
 * the same seed, enabling consistent Nostr identity across devices.
 *
 * @param {CryptoKey} lek - Ledger Encryption Key (must be extractable)
 * @returns {Promise<Uint8Array>} - 32-byte seed for secp256k1 key generation
 * @throws {Error} If LEK is unavailable, not extractable, or derivation fails
 */
export async function deriveNostrSeed(lek) {
  if (!isWebCryptoAvailable()) {
    throw new Error("Web Crypto API is not available");
  }

  if (!lek) {
    throw new Error("LEK is required for Nostr key derivation");
  }

  try {
    // Export LEK to raw bytes (requires extractable=true on the LEK)
    let lekRaw;
    try {
      lekRaw = await crypto.subtle.exportKey("raw", lek);
    } catch (exportError) {
      throw new Error(
        "LEK must be extractable for Nostr key derivation. " +
          "Ensure LEK was imported with extractable=true."
      );
    }

    // Import raw LEK bytes as HKDF key material
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      lekRaw,
      "HKDF",
      false, // HKDF key material doesn't need to be extractable
      ["deriveBits"]
    );

    // Derive seed using HKDF with domain-specific salt and info
    // This ensures the derived seed is cryptographically independent from:
    // - The raw LEK (different domain)
    // - The Yjs password (different salt/info)
    // - Any future derivations (versioned info string)
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: "HKDF",
        hash: "SHA-256",
        salt: new TextEncoder().encode(NOSTR_KEYPAIR_SALT),
        info: new TextEncoder().encode(NOSTR_KEYPAIR_INFO),
      },
      keyMaterial,
      256 // 256 bits = 32 bytes, suitable for secp256k1 private key
    );

    return new Uint8Array(derivedBits);
  } catch (error) {
    // Re-throw with context if not already our error
    if (error.message.includes("LEK")) {
      throw error;
    }
    console.error("Failed to derive Nostr seed:", error);
    throw new Error("Failed to derive Nostr seed: " + error.message);
  }
}

/**
 * Derive Nostr seed and return as hex string
 *
 * Convenience function that returns the seed in hex format,
 * which is the standard format for Nostr private keys (nsec).
 *
 * @param {CryptoKey} lek - Ledger Encryption Key (must be extractable)
 * @returns {Promise<string>} - 64-character hex string (32 bytes)
 * @throws {Error} If derivation fails
 */
export async function deriveNostrSeedHex(lek) {
  const seed = await deriveNostrSeed(lek);
  return uint8ArrayToHex(seed);
}

/**
 * Derive Nostr seed and return as base64 string
 *
 * @param {CryptoKey} lek - Ledger Encryption Key (must be extractable)
 * @returns {Promise<string>} - Base64 encoded seed
 * @throws {Error} If derivation fails
 */
export async function deriveNostrSeedBase64(lek) {
  const seed = await deriveNostrSeed(lek);
  return arrayBufferToBase64(seed.buffer);
}

/**
 * Convert Uint8Array to hex string
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function uint8ArrayToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Convert hex string to Uint8Array
 * @param {string} hex
 * @returns {Uint8Array}
 */
export function hexToUint8Array(hex) {
  if (hex.length % 2 !== 0) {
    throw new Error("Hex string must have even length");
  }
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}

/**
 * Validate that a seed is suitable for secp256k1 key generation
 *
 * secp256k1 private keys must be:
 * - Exactly 32 bytes
 * - Greater than 0
 * - Less than the curve order n
 *
 * The curve order n for secp256k1 is:
 * 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
 *
 * With HKDF output from a 256-bit AES key, the probability of generating
 * an invalid key (>= n or == 0) is astronomically low (~2^-128), but we
 * validate anyway for defense in depth.
 *
 * @param {Uint8Array} seed - 32-byte seed to validate
 * @returns {boolean} - True if seed is valid for secp256k1
 */
export function isValidSecp256k1Seed(seed) {
  if (!(seed instanceof Uint8Array) || seed.length !== 32) {
    return false;
  }

  // Check if seed is all zeros (invalid private key)
  if (seed.every((b) => b === 0)) {
    return false;
  }

  // secp256k1 curve order n (big-endian)
  const curveOrder = new Uint8Array([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xfe, 0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
    0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
  ]);

  // Compare seed < curveOrder (big-endian comparison)
  for (let i = 0; i < 32; i++) {
    if (seed[i] < curveOrder[i]) {
      return true; // seed < n, valid
    }
    if (seed[i] > curveOrder[i]) {
      return false; // seed > n, invalid
    }
    // seed[i] === curveOrder[i], continue to next byte
  }

  // seed === curveOrder, invalid (must be strictly less than n)
  return false;
}

/**
 * Nostr Keypair object containing private and public keys in multiple formats
 *
 * @typedef {Object} NostrKeypair
 * @property {Uint8Array} privateKeyBytes - 32-byte private key as bytes
 * @property {string} privateKeyHex - Private key as 64-character hex string
 * @property {Uint8Array} publicKeyBytes - 33-byte compressed public key as bytes
 * @property {string} publicKeyHex - Public key as 66-character hex string
 * @property {string} npub - Nostr public key in bech32 format (npub1...)
 * @property {string} nsec - Nostr private key in bech32 format (nsec1...)
 */

/**
 * Generate secp256k1 keypair from HKDF-derived seed
 *
 * Takes a 32-byte seed derived from LEK and generates a complete
 * Nostr-compatible secp256k1 keypair with keys in multiple formats.
 *
 * @param {Uint8Array} seed - 32-byte seed from deriveNostrSeed()
 * @returns {Promise<NostrKeypair>} - Complete keypair with multiple key formats
 * @throws {Error} If seed is invalid or keypair generation fails
 */
export async function generateNostrKeypair(seed) {
  // Validate seed before proceeding
  if (!isValidSecp256k1Seed(seed)) {
    throw new Error("Invalid seed for secp256k1 keypair generation");
  }

  try {
    // Generate private key from seed
    const privateKeyBytes = seed;

    // Generate public key from private key using secp256k1
    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true); // compressed format

    // Convert to hex format
    const privateKeyHex = uint8ArrayToHex(privateKeyBytes);
    const publicKeyHex = uint8ArrayToHex(publicKeyBytes);

    // Generate bech32 formats for Nostr compatibility
    // npub uses x-only public key (32 bytes, without the prefix byte)
    // nsec uses the raw 32-byte private key
    const xOnlyPubkey = publicKeyBytes.slice(1); // Remove prefix byte (02 or 03)
    const npub = encodeNpub(xOnlyPubkey);
    const nsec = encodeNsec(privateKeyBytes);

    return {
      privateKeyBytes,
      privateKeyHex,
      publicKeyBytes,
      publicKeyHex,
      npub,
      nsec,
    };
  } catch (error) {
    console.error("Failed to generate Nostr keypair:", error);
    throw new Error("Failed to generate Nostr keypair: " + error.message);
  }
}

/**
 * Derive complete Nostr keypair directly from LEK
 *
 * Convenience function that combines seed derivation and keypair generation.
 * This is the main entry point for getting a Nostr keypair from LEK.
 *
 * @param {CryptoKey} lek - Ledger Encryption Key (must be extractable)
 * @returns {Promise<NostrKeypair>} - Complete Nostr keypair
 * @throws {Error} If LEK is unavailable or keypair generation fails
 */
export async function deriveNostrKeypair(lek) {
  try {
    // First derive the seed from LEK using HKDF
    const seed = await deriveNostrSeed(lek);

    // Then generate the keypair from the seed
    const keypair = await generateNostrKeypair(seed);

    return keypair;
  } catch (error) {
    console.error("Failed to derive Nostr keypair from LEK:", error);
    throw error; // Re-throw to preserve error context
  }
}

/**
 * Verify that a Nostr keypair is valid and consistent
 *
 * Validates that:
 * - Private key is valid for secp256k1
 * - Public key is correctly derived from private key
 * - Key formats are consistent
 *
 * @param {NostrKeypair} keypair - Keypair to verify
 * @returns {boolean} - True if keypair is valid and consistent
 */
export function verifyNostrKeypair(keypair) {
  try {
    const { privateKeyBytes, publicKeyBytes, privateKeyHex, publicKeyHex } = keypair;

    // Validate private key
    if (!isValidSecp256k1Seed(privateKeyBytes)) {
      return false;
    }

    // Verify that public key is correctly derived from private key
    const derivedPublicKey = secp256k1.getPublicKey(privateKeyBytes, true);
    if (uint8ArrayToHex(derivedPublicKey) !== publicKeyHex) {
      return false;
    }

    // Verify hex format consistency
    if (uint8ArrayToHex(privateKeyBytes) !== privateKeyHex) {
      return false;
    }

    if (uint8ArrayToHex(publicKeyBytes) !== publicKeyHex) {
      return false;
    }

    return true;
  } catch (error) {
    console.error("Error verifying Nostr keypair:", error);
    return false;
  }
}

/**
 * Get the Nostr public key from a private key
 *
 * Utility function to derive just the public key from a private key.
 *
 * @param {Uint8Array|string} privateKey - Private key as bytes or hex string
 * @returns {string} - Public key as hex string
 * @throws {Error} If private key is invalid
 */
export function getNostrPublicKey(privateKey) {
  try {
    let privateKeyBytes;

    if (typeof privateKey === 'string') {
      privateKeyBytes = hexToUint8Array(privateKey);
    } else {
      privateKeyBytes = privateKey;
    }

    if (!isValidSecp256k1Seed(privateKeyBytes)) {
      throw new Error("Invalid private key");
    }

    const publicKeyBytes = secp256k1.getPublicKey(privateKeyBytes, true);
    return uint8ArrayToHex(publicKeyBytes);
  } catch (error) {
    console.error("Failed to get Nostr public key:", error);
    throw new Error("Failed to get Nostr public key: " + error.message);
  }
}

// In-memory cache for derived Nostr keypairs
// This avoids expensive HKDF derivation and keypair generation on repeated calls
const nostrKeypairCache = new Map();

/**
 * Cache invalidation time in milliseconds (5 minutes)
 * Keypairs are cached for 5 minutes to balance performance and security
 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Cache entry structure
 * @typedef {Object} CacheEntry
 * @property {NostrKeypair} keypair - Cached keypair
 * @property {number} timestamp - When the entry was created (ms since epoch)
 * @property {string} lekFingerprint - Fingerprint of LEK used for derivation
 */

/**
 * Generate a fingerprint for a LEK to detect key rotation
 *
 * Creates a short, deterministic identifier for an LEK that changes
 * when the LEK changes, allowing cache invalidation on key rotation.
 *
 * @param {CryptoKey} lek - LEK to fingerprint
 * @returns {Promise<string>} - Base64 fingerprint (first 16 chars of SHA-256)
 * @throws {Error} If fingerprinting fails
 */
async function generateLEKFingerprint(lek) {
  try {
    // Export LEK to get its raw bytes
    const lekRaw = await crypto.subtle.exportKey("raw", lek);

    // Hash the LEK bytes
    const hashBuffer = await crypto.subtle.digest("SHA-256", lekRaw);

    // Convert to base64 and take first 16 characters as fingerprint
    const fingerprint = arrayBufferToBase64(hashBuffer).substring(0, 16);

    return fingerprint;
  } catch (error) {
    console.error("Failed to generate LEK fingerprint:", error);
    throw new Error("Failed to generate LEK fingerprint: " + error.message);
  }
}

/**
 * Check if a cache entry is still valid
 *
 * Entry is valid if:
 * - It's not expired (within TTL)
 * - The LEK fingerprint matches (no key rotation)
 *
 * @param {CacheEntry} entry - Cache entry to validate
 * @param {string} currentLEKFingerprint - Current LEK fingerprint
 * @returns {boolean} - True if entry is valid
 */
function isCacheEntryValid(entry, currentLEKFingerprint) {
  const now = Date.now();
  const isNotExpired = (now - entry.timestamp) < CACHE_TTL_MS;
  const lekMatches = entry.lekFingerprint === currentLEKFingerprint;

  return isNotExpired && lekMatches;
}

/**
 * Get cache key for a given LEK fingerprint
 *
 * @param {string} lekFingerprint - LEK fingerprint
 * @returns {string} - Cache key
 */
function getCacheKey(lekFingerprint) {
  return `nostr-keypair:${lekFingerprint}`;
}

/**
 * Clear expired entries from the cache
 *
 * This is called periodically to prevent memory leaks from old cache entries.
 */
function clearExpiredCacheEntries() {
  const now = Date.now();

  for (const [key, entry] of nostrKeypairCache.entries()) {
    if ((now - entry.timestamp) >= CACHE_TTL_MS) {
      nostrKeypairCache.delete(key);
    }
  }
}

/**
 * Derive Nostr keypair with caching
 *
 * This is the main entry point for getting Nostr keypairs. It implements
 * intelligent caching to avoid expensive re-derivation while maintaining
 * security through cache TTL and LEK rotation detection.
 *
 * @param {CryptoKey} lek - Ledger Encryption Key (must be extractable)
 * @returns {Promise<NostrKeypair>} - Cached or newly derived keypair
 * @throws {Error} If derivation fails
 */
export async function deriveNostrKeypairCached(lek) {
  try {
    // Generate fingerprint for the current LEK
    const lekFingerprint = await generateLEKFingerprint(lek);
    const cacheKey = getCacheKey(lekFingerprint);

    // Check if we have a valid cached entry
    const cachedEntry = nostrKeypairCache.get(cacheKey);

    if (cachedEntry && isCacheEntryValid(cachedEntry, lekFingerprint)) {
      // Return cached keypair
      return cachedEntry.keypair;
    }

    // Cache miss or invalid - derive new keypair
    const keypair = await deriveNostrKeypair(lek);

    // Cache the new keypair
    nostrKeypairCache.set(cacheKey, {
      keypair,
      timestamp: Date.now(),
      lekFingerprint,
    });

    // Periodically clean up expired entries (every 100 cache operations)
    if (Math.random() < 0.01) { // 1% chance
      clearExpiredCacheEntries();
    }

    return keypair;

  } catch (error) {
    console.error("Failed to derive cached Nostr keypair:", error);
    throw error;
  }
}

/**
 * Clear all cached Nostr keypairs
 *
 * This should be called when:
 * - LEK is rotated/changed
 * - Security policy requires cache clearing
 * - User logs out or device is reset
 *
 * @returns {void}
 */
export function clearNostrKeypairCache() {
  nostrKeypairCache.clear();
}

/**
 * Get current cache statistics
 *
 * Useful for debugging and monitoring cache performance.
 *
 * @returns {Object} - Cache statistics
 */
export function getNostrCacheStats() {
  const now = Date.now();
  let validEntries = 0;
  let expiredEntries = 0;

  for (const entry of nostrKeypairCache.values()) {
    if ((now - entry.timestamp) < CACHE_TTL_MS) {
      validEntries++;
    } else {
      expiredEntries++;
    }
  }

  return {
    totalEntries: nostrKeypairCache.size,
    validEntries,
    expiredEntries,
    ttlMs: CACHE_TTL_MS,
  };
}

// ============================================================================
// Nostr Event Signing and Verification
// ============================================================================

/**
 * Compute the event ID (SHA-256 hash of serialized event)
 *
 * According to NIP-01, the event ID is the SHA-256 hash of the serialized event:
 * [0, pubkey, created_at, kind, tags, content]
 *
 * @param {Object} event - Nostr event object (without id and sig)
 * @returns {Promise<string>} - Event ID as 64-character hex string
 */
export async function computeEventId(event) {
  const { pubkey, created_at, kind, tags, content } = event;

  // Serialize event as per NIP-01
  const serialized = JSON.stringify([
    0,
    pubkey,
    created_at,
    kind,
    tags,
    content,
  ]);

  // Hash using SHA-256
  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return uint8ArrayToHex(new Uint8Array(hashBuffer));
}

/**
 * Sign a Nostr event using secp256k1 Schnorr signature (BIP-340)
 *
 * Nostr uses Schnorr signatures as specified in BIP-340.
 * The message to sign is the 32-byte event ID.
 *
 * @param {Object} event - Event object with pubkey, created_at, kind, tags, content
 * @param {Uint8Array|string} privateKey - Private key as bytes or hex
 * @returns {Promise<Object>} - Complete signed event with id and sig fields
 */
export async function signNostrEvent(event, privateKey) {
  let privateKeyBytes;

  if (typeof privateKey === "string") {
    privateKeyBytes = hexToUint8Array(privateKey);
  } else {
    privateKeyBytes = privateKey;
  }

  if (!isValidSecp256k1Seed(privateKeyBytes)) {
    throw new Error("Invalid private key for signing");
  }

  // Compute event ID
  const eventId = await computeEventId(event);
  const eventIdBytes = hexToUint8Array(eventId);

  // Sign using Schnorr signature (BIP-340)
  // Use async version since Web Crypto is async
  const signature = await secp256k1.schnorr.signAsync(eventIdBytes, privateKeyBytes);

  // Return complete event with id and signature
  return {
    id: eventId,
    pubkey: event.pubkey,
    created_at: event.created_at,
    kind: event.kind,
    tags: event.tags,
    content: event.content,
    sig: uint8ArrayToHex(signature),
  };
}

/**
 * Verify a Nostr event signature
 *
 * Verifies that the event signature is valid for the given event data
 * and that it was signed by the public key specified in the event.
 *
 * @param {Object} event - Complete Nostr event with id, pubkey, sig, etc.
 * @returns {Promise<boolean>} - True if signature is valid
 */
export async function verifyNostrEventSignature(event) {
  try {
    const { id, pubkey, sig, created_at, kind, tags, content } = event;

    // Validate required fields exist
    if (!id || !pubkey || !sig || created_at === undefined || kind === undefined) {
      return false;
    }

    // Recompute the event ID to verify it matches
    const computedId = await computeEventId({
      pubkey,
      created_at,
      kind,
      tags: tags || [],
      content: content || "",
    });

    if (computedId !== id) {
      console.warn("[NostrCrypto] Event ID mismatch:", { computed: computedId, provided: id });
      return false;
    }

    // Verify Schnorr signature
    // Note: pubkey in Nostr events is the 32-byte x-coordinate (x-only pubkey)
    const sigBytes = hexToUint8Array(sig);
    const idBytes = hexToUint8Array(id);
    const pubkeyBytes = hexToUint8Array(pubkey);

    // Use async version since Web Crypto is async
    const isValid = await secp256k1.schnorr.verifyAsync(sigBytes, idBytes, pubkeyBytes);

    return isValid;
  } catch (error) {
    console.error("[NostrCrypto] Signature verification failed:", error);
    return false;
  }
}

/**
 * Create and sign a complete Nostr event
 *
 * Convenience function that creates a complete signed event from
 * event parameters and a keypair.
 *
 * @param {Object} params - Event parameters
 * @param {number} params.kind - Event kind (e.g., 30053 for replaceable bookmark event)
 * @param {string} params.content - Event content (usually encrypted)
 * @param {Array} params.tags - Event tags array
 * @param {number} [params.created_at] - Optional timestamp (defaults to now)
 * @param {NostrKeypair} keypair - Keypair with publicKeyHex and privateKeyBytes
 * @returns {Promise<Object>} - Complete signed event ready for publishing
 */
export async function createSignedNostrEvent(params, keypair) {
  const { kind, content, tags = [], created_at } = params;

  // Extract x-only public key (first 32 bytes of compressed pubkey, skip the prefix)
  // Compressed pubkey is 33 bytes: 1 byte prefix (02 or 03) + 32 bytes x-coordinate
  // Nostr uses x-only pubkey (32 bytes, just the x-coordinate)
  const xOnlyPubkey = uint8ArrayToHex(keypair.publicKeyBytes.slice(1));

  const event = {
    pubkey: xOnlyPubkey,
    created_at: created_at || Math.floor(Date.now() / 1000),
    kind,
    tags,
    content: content || "",
  };

  return signNostrEvent(event, keypair.privateKeyBytes);
}

/**
 * Get x-only public key from compressed public key
 *
 * Nostr uses x-only public keys (32 bytes) while secp256k1 typically
 * produces compressed public keys (33 bytes with prefix).
 *
 * @param {Uint8Array|string} compressedPubkey - 33-byte compressed public key
 * @returns {string} - 32-byte x-only public key as hex
 */
export function getXOnlyPubkey(compressedPubkey) {
  let bytes;
  if (typeof compressedPubkey === "string") {
    bytes = hexToUint8Array(compressedPubkey);
  } else {
    bytes = compressedPubkey;
  }

  if (bytes.length !== 33) {
    throw new Error("Expected 33-byte compressed public key");
  }

  // Skip the first byte (prefix) and return the x-coordinate
  return uint8ArrayToHex(bytes.slice(1));
}
