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
