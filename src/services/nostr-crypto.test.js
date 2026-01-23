/**
 * Nostr Cryptographic Service Tests
 * Tests for src/services/nostr-crypto.js
 *
 * These tests verify HKDF-based key derivation for Nostr keypair generation.
 * Uses real crypto.subtle operations for security validation.
 */

import { describe, it, expect, beforeAll } from "vitest";
import { webcrypto } from "node:crypto";

// Set up window.crypto before importing modules
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (!globalThis.window.crypto) {
  globalThis.window.crypto = webcrypto;
}

import {
  deriveNostrSeed,
  deriveNostrSeedHex,
  deriveNostrSeedBase64,
  generateNostrKeypair,
  deriveNostrKeypair,
  deriveNostrKeypairCached,
  verifyNostrKeypair,
  getNostrPublicKey,
  clearNostrKeypairCache,
  getNostrCacheStats,
  uint8ArrayToHex,
  hexToUint8Array,
  isValidSecp256k1Seed,
} from "./nostr-crypto.js";

import { generateLEK, importLEK, exportLEK } from "./crypto.js";

describe("nostr-crypto", () => {
  let testLEK;

  beforeAll(async () => {
    // Generate a test LEK for use across tests
    testLEK = await generateLEK();
  });

  describe("deriveNostrSeed", () => {
    it("derives a 32-byte seed from LEK", async () => {
      const seed = await deriveNostrSeed(testLEK);

      expect(seed).toBeInstanceOf(Uint8Array);
      expect(seed.length).toBe(32);
    });

    it("produces deterministic output for same LEK", async () => {
      const seed1 = await deriveNostrSeed(testLEK);
      const seed2 = await deriveNostrSeed(testLEK);

      expect(uint8ArrayToHex(seed1)).toBe(uint8ArrayToHex(seed2));
    });

    it("produces different seeds for different LEKs", async () => {
      const otherLEK = await generateLEK();

      const seed1 = await deriveNostrSeed(testLEK);
      const seed2 = await deriveNostrSeed(otherLEK);

      expect(uint8ArrayToHex(seed1)).not.toBe(uint8ArrayToHex(seed2));
    });

    it("produces consistent seed across import/export cycle", async () => {
      // Export and reimport the LEK
      const exported = await exportLEK(testLEK);
      const reimported = await importLEK(exported, true); // extractable for derivation

      const originalSeed = await deriveNostrSeed(testLEK);
      const reimportedSeed = await deriveNostrSeed(reimported);

      expect(uint8ArrayToHex(originalSeed)).toBe(uint8ArrayToHex(reimportedSeed));
    });

    it("throws error when LEK is null", async () => {
      await expect(deriveNostrSeed(null)).rejects.toThrow(
        "LEK is required for Nostr key derivation"
      );
    });

    it("throws error when LEK is undefined", async () => {
      await expect(deriveNostrSeed(undefined)).rejects.toThrow(
        "LEK is required for Nostr key derivation"
      );
    });

    it("throws error when LEK is not extractable", async () => {
      // Import LEK as non-extractable
      const exported = await exportLEK(testLEK);
      const nonExtractableLEK = await importLEK(exported, false);

      await expect(deriveNostrSeed(nonExtractableLEK)).rejects.toThrow(
        "LEK must be extractable"
      );
    });

    it("produces valid secp256k1 seed", async () => {
      const seed = await deriveNostrSeed(testLEK);
      expect(isValidSecp256k1Seed(seed)).toBe(true);
    });

    it("produces non-zero seed", async () => {
      const seed = await deriveNostrSeed(testLEK);
      const isAllZeros = seed.every((b) => b === 0);
      expect(isAllZeros).toBe(false);
    });
  });

  describe("deriveNostrSeedHex", () => {
    it("returns 64-character hex string", async () => {
      const hex = await deriveNostrSeedHex(testLEK);

      expect(typeof hex).toBe("string");
      expect(hex.length).toBe(64);
      expect(/^[0-9a-f]+$/.test(hex)).toBe(true);
    });

    it("matches deriveNostrSeed output", async () => {
      const seed = await deriveNostrSeed(testLEK);
      const hex = await deriveNostrSeedHex(testLEK);

      expect(hex).toBe(uint8ArrayToHex(seed));
    });
  });

  describe("deriveNostrSeedBase64", () => {
    it("returns valid base64 string", async () => {
      const base64 = await deriveNostrSeedBase64(testLEK);

      expect(typeof base64).toBe("string");
      // Base64 for 32 bytes = ceil(32 * 4/3) = 44 characters (with padding)
      expect(base64.length).toBe(44);
      expect(/^[A-Za-z0-9+/]+=*$/.test(base64)).toBe(true);
    });
  });

  describe("uint8ArrayToHex", () => {
    it("converts empty array", () => {
      expect(uint8ArrayToHex(new Uint8Array([]))).toBe("");
    });

    it("converts single byte", () => {
      expect(uint8ArrayToHex(new Uint8Array([0]))).toBe("00");
      expect(uint8ArrayToHex(new Uint8Array([255]))).toBe("ff");
      expect(uint8ArrayToHex(new Uint8Array([16]))).toBe("10");
    });

    it("converts multiple bytes", () => {
      expect(uint8ArrayToHex(new Uint8Array([1, 2, 3]))).toBe("010203");
      expect(uint8ArrayToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]))).toBe(
        "deadbeef"
      );
    });

    it("pads single-digit hex values", () => {
      expect(uint8ArrayToHex(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe(
        "00010203040506070809"
      );
    });
  });

  describe("hexToUint8Array", () => {
    it("converts empty string", () => {
      expect(hexToUint8Array("")).toEqual(new Uint8Array([]));
    });

    it("converts single byte", () => {
      expect(hexToUint8Array("00")).toEqual(new Uint8Array([0]));
      expect(hexToUint8Array("ff")).toEqual(new Uint8Array([255]));
      expect(hexToUint8Array("FF")).toEqual(new Uint8Array([255]));
    });

    it("converts multiple bytes", () => {
      expect(hexToUint8Array("010203")).toEqual(new Uint8Array([1, 2, 3]));
      expect(hexToUint8Array("deadbeef")).toEqual(
        new Uint8Array([0xde, 0xad, 0xbe, 0xef])
      );
    });

    it("throws on odd-length string", () => {
      expect(() => hexToUint8Array("abc")).toThrow("even length");
    });

    it("round-trips with uint8ArrayToHex", () => {
      const original = new Uint8Array([0, 127, 255, 16, 32, 64, 128]);
      const hex = uint8ArrayToHex(original);
      const recovered = hexToUint8Array(hex);

      expect(recovered).toEqual(original);
    });
  });

  describe("isValidSecp256k1Seed", () => {
    it("rejects non-Uint8Array", () => {
      expect(isValidSecp256k1Seed(null)).toBe(false);
      expect(isValidSecp256k1Seed(undefined)).toBe(false);
      expect(isValidSecp256k1Seed("string")).toBe(false);
      expect(isValidSecp256k1Seed([])).toBe(false);
      expect(isValidSecp256k1Seed({})).toBe(false);
    });

    it("rejects wrong length", () => {
      expect(isValidSecp256k1Seed(new Uint8Array(31))).toBe(false);
      expect(isValidSecp256k1Seed(new Uint8Array(33))).toBe(false);
      expect(isValidSecp256k1Seed(new Uint8Array(0))).toBe(false);
    });

    it("rejects all zeros", () => {
      expect(isValidSecp256k1Seed(new Uint8Array(32))).toBe(false);
    });

    it("accepts valid 32-byte seed", () => {
      const validSeed = new Uint8Array(32);
      validSeed[31] = 1; // Just needs to be non-zero and < n
      expect(isValidSecp256k1Seed(validSeed)).toBe(true);
    });

    it("accepts seed with value 1", () => {
      const seed = new Uint8Array(32);
      seed[31] = 1;
      expect(isValidSecp256k1Seed(seed)).toBe(true);
    });

    it("accepts typical random seed", () => {
      // A typical random 32-byte value should be valid
      const seed = new Uint8Array([
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78,
        0x9a, 0xbc, 0xde, 0xf0, 0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
        0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0,
      ]);
      expect(isValidSecp256k1Seed(seed)).toBe(true);
    });

    it("rejects seed equal to curve order", () => {
      // secp256k1 curve order n
      const curveOrder = new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xfe, 0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
        0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
      ]);
      expect(isValidSecp256k1Seed(curveOrder)).toBe(false);
    });

    it("rejects seed greater than curve order", () => {
      // Value greater than curve order (all 0xff)
      const tooLarge = new Uint8Array(32).fill(0xff);
      expect(isValidSecp256k1Seed(tooLarge)).toBe(false);
    });

    it("accepts seed one less than curve order", () => {
      // n - 1 should be valid
      const justUnder = new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xfe, 0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
        0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x40, // last byte is 0x40, not 0x41
      ]);
      expect(isValidSecp256k1Seed(justUnder)).toBe(true);
    });
  });

  describe("domain separation", () => {
    it("produces different seed than Yjs password derivation", async () => {
      // Import deriveYjsPassword to compare
      const { deriveYjsPassword } = await import("./crypto.js");

      const nostrSeed = await deriveNostrSeedBase64(testLEK);
      const yjsPassword = await deriveYjsPassword(testLEK);

      expect(nostrSeed).not.toBe(yjsPassword);
    });
  });

  describe("cross-device consistency simulation", () => {
    it("same raw key produces same seed on reimport", async () => {
      // Simulate what happens when LEK is synced to another device
      const rawKey = await exportLEK(testLEK);

      // "Device 1" derives seed
      const device1LEK = await importLEK(rawKey, true);
      const device1Seed = await deriveNostrSeedHex(device1LEK);

      // "Device 2" receives same raw key and derives seed
      const device2LEK = await importLEK(rawKey, true);
      const device2Seed = await deriveNostrSeedHex(device2LEK);

      expect(device1Seed).toBe(device2Seed);
    });
  });

  describe("generateNostrKeypair", () => {
    it("generates valid keypair from seed", async () => {
      const seed = await deriveNostrSeed(testLEK);
      const keypair = await generateNostrKeypair(seed);

      expect(keypair).toHaveProperty('privateKeyBytes');
      expect(keypair).toHaveProperty('privateKeyHex');
      expect(keypair).toHaveProperty('publicKeyBytes');
      expect(keypair).toHaveProperty('publicKeyHex');
      expect(keypair).toHaveProperty('npub');
      expect(keypair).toHaveProperty('nsec');

      // Validate key formats
      expect(keypair.privateKeyBytes).toHaveLength(32);
      expect(keypair.privateKeyHex).toHaveLength(64);
      expect(keypair.publicKeyBytes).toHaveLength(33); // Compressed
      expect(keypair.publicKeyHex).toHaveLength(66);
    });

    it("produces deterministic keypairs", async () => {
      const seed = await deriveNostrSeed(testLEK);
      const keypair1 = await generateNostrKeypair(seed);
      const keypair2 = await generateNostrKeypair(seed);

      expect(keypair1.privateKeyHex).toBe(keypair2.privateKeyHex);
      expect(keypair1.publicKeyHex).toBe(keypair2.publicKeyHex);
    });

    it("rejects invalid seed", async () => {
      const invalidSeed = new Uint8Array(32).fill(0);
      await expect(generateNostrKeypair(invalidSeed)).rejects.toThrow('Invalid seed');
    });
  });

  describe("deriveNostrKeypair", () => {
    it("derives keypair directly from LEK", async () => {
      const keypair = await deriveNostrKeypair(testLEK);

      expect(verifyNostrKeypair(keypair)).toBe(true);
      expect(keypair.privateKeyBytes).toHaveLength(32);
      expect(keypair.publicKeyBytes).toHaveLength(33);
    });

    it("produces consistent results", async () => {
      const keypair1 = await deriveNostrKeypair(testLEK);
      const keypair2 = await deriveNostrKeypair(testLEK);

      expect(keypair1.privateKeyHex).toBe(keypair2.privateKeyHex);
      expect(keypair1.publicKeyHex).toBe(keypair2.publicKeyHex);
    });
  });

  describe("verifyNostrKeypair", () => {
    it("verifies valid keypair", async () => {
      const keypair = await deriveNostrKeypair(testLEK);
      expect(verifyNostrKeypair(keypair)).toBe(true);
    });

    it("rejects corrupted keypair", async () => {
      const keypair = await deriveNostrKeypair(testLEK);
      const corrupted = {
        ...keypair,
        publicKeyHex: '03' + '0'.repeat(64),
      };

      expect(verifyNostrKeypair(corrupted)).toBe(false);
    });
  });

  describe("getNostrPublicKey", () => {
    it("derives public key from private key bytes", async () => {
      const keypair = await deriveNostrKeypair(testLEK);
      const publicKey = getNostrPublicKey(keypair.privateKeyBytes);

      expect(publicKey).toBe(keypair.publicKeyHex);
    });

    it("derives public key from private key hex", async () => {
      const keypair = await deriveNostrKeypair(testLEK);
      const publicKey = getNostrPublicKey(keypair.privateKeyHex);

      expect(publicKey).toBe(keypair.publicKeyHex);
    });

    it("rejects invalid private key", () => {
      const invalidKey = new Uint8Array(32).fill(0);
      expect(() => getNostrPublicKey(invalidKey)).toThrow('Invalid private key');
    });
  });

  describe("keypair caching", () => {
    beforeEach(() => {
      clearNostrKeypairCache();
    });

    it("caches derived keypairs", async () => {
      const keypair1 = await deriveNostrKeypairCached(testLEK);
      const keypair2 = await deriveNostrKeypairCached(testLEK);

      // Should be same reference (cached)
      expect(keypair1).toBe(keypair2);
    });

    it("cache miss for different LEKs", async () => {
      const lek2 = await generateLEK();

      const keypair1 = await deriveNostrKeypairCached(testLEK);
      const keypair2 = await deriveNostrKeypairCached(lek2);

      expect(keypair1).not.toBe(keypair2);
      expect(keypair1.publicKeyHex).not.toBe(keypair2.publicKeyHex);
    });

    it("cache clear invalidates cache", async () => {
      const keypair1 = await deriveNostrKeypairCached(testLEK);

      clearNostrKeypairCache();

      const keypair2 = await deriveNostrKeypairCached(testLEK);

      // Different references but same content
      expect(keypair1).not.toBe(keypair2);
      expect(keypair1.publicKeyHex).toBe(keypair2.publicKeyHex);
    });

    it("provides cache statistics", async () => {
      const initialStats = getNostrCacheStats();
      expect(initialStats.totalEntries).toBe(0);

      await deriveNostrKeypairCached(testLEK);

      const stats = getNostrCacheStats();
      expect(stats.totalEntries).toBe(1);
      expect(stats.validEntries).toBe(1);
    });
  });
});
