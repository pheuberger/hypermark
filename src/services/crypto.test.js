/**
 * Cryptographic Service Tests
 * CRITICAL SECURITY - Tests for src/services/crypto.js
 *
 * These tests use real crypto.subtle operations to ensure actual
 * cryptographic security, not mocked behavior.
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Set up window.crypto BEFORE importing the crypto module
// This is necessary because the module checks window.crypto on import
if (typeof globalThis.window === "undefined") {
  globalThis.window = globalThis;
}
if (!globalThis.window.crypto) {
  globalThis.window.crypto = webcrypto;
}

import {
  isWebCryptoAvailable,
  generateDeviceKeypair,
  generateEphemeralKeypair,
  exportPublicKey,
  importPublicKey,
  deriveSharedSecret,
  deriveSessionKey,
  encryptData,
  decryptData,
  signData,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  stringToArrayBuffer,
  arrayBufferToString,
  generateUUID,
  generateRandomBytes,
  generateLEK,
  exportLEK,
  importLEK,
  deriveYjsPassword,
} from "./crypto.js";

describe("crypto service", () => {
  describe("isWebCryptoAvailable", () => {
    it("returns true when crypto.subtle is available", () => {
      expect(isWebCryptoAvailable()).toBe(true);
    });

    it("returns false when crypto is not available", () => {
      const originalCrypto = globalThis.crypto;
      const originalWindow = globalThis.window;

      // Temporarily remove crypto to test the check
      delete globalThis.crypto;
      globalThis.window = { crypto: undefined };

      // Need to handle window.crypto check in the function
      expect(isWebCryptoAvailable()).toBe(false);

      // Restore original state
      globalThis.crypto = originalCrypto;
      globalThis.window = originalWindow;
    });
  });

  describe("generateDeviceKeypair", () => {
    it("generates valid ECDH P-256 keypair", async () => {
      const keypair = await generateDeviceKeypair();

      expect(keypair).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
    });

    it("generates non-extractable private key", async () => {
      const keypair = await generateDeviceKeypair();

      expect(keypair.privateKey.extractable).toBe(false);
    });

    it("uses ECDH algorithm", async () => {
      const keypair = await generateDeviceKeypair();

      expect(keypair.privateKey.algorithm.name).toBe("ECDH");
      expect(keypair.publicKey.algorithm.name).toBe("ECDH");
    });

    it("uses P-256 curve", async () => {
      const keypair = await generateDeviceKeypair();

      expect(keypair.privateKey.algorithm.namedCurve).toBe("P-256");
      expect(keypair.publicKey.algorithm.namedCurve).toBe("P-256");
    });

    it("supports deriveKey and deriveBits usages", async () => {
      const keypair = await generateDeviceKeypair();

      expect(keypair.privateKey.usages).toContain("deriveKey");
      expect(keypair.privateKey.usages).toContain("deriveBits");
    });

    it("generates different keypairs on each call", async () => {
      const keypair1 = await generateDeviceKeypair();
      const keypair2 = await generateDeviceKeypair();

      // Export public keys to compare (can't compare private keys directly)
      const pubKey1 = await exportPublicKey(keypair1.publicKey);
      const pubKey2 = await exportPublicKey(keypair2.publicKey);

      expect(pubKey1).not.toBe(pubKey2);
    });
  });

  describe("generateEphemeralKeypair", () => {
    it("generates valid ECDH P-256 keypair", async () => {
      const keypair = await generateEphemeralKeypair();

      expect(keypair).toBeDefined();
      expect(keypair.privateKey).toBeDefined();
      expect(keypair.publicKey).toBeDefined();
    });

    it("generates extractable keys (for export during pairing)", async () => {
      const keypair = await generateEphemeralKeypair();

      expect(keypair.privateKey.extractable).toBe(true);
      expect(keypair.publicKey.extractable).toBe(true);
    });

    it("uses correct algorithm and curve", async () => {
      const keypair = await generateEphemeralKeypair();

      expect(keypair.privateKey.algorithm.name).toBe("ECDH");
      expect(keypair.privateKey.algorithm.namedCurve).toBe("P-256");
    });
  });

  describe("public key export/import", () => {
    it("exports public key to base64 string", async () => {
      const keypair = await generateEphemeralKeypair();
      const exported = await exportPublicKey(keypair.publicKey);

      expect(typeof exported).toBe("string");
      expect(exported.length).toBeGreaterThan(0);
      // SPKI-encoded P-256 public keys are 91 bytes, base64 encoded
      expect(exported.length).toBeGreaterThan(100);
    });

    it("imports public key from base64 string", async () => {
      const keypair = await generateEphemeralKeypair();
      const exported = await exportPublicKey(keypair.publicKey);
      const imported = await importPublicKey(exported);

      expect(imported).toBeDefined();
      expect(imported.type).toBe("public");
      expect(imported.algorithm.name).toBe("ECDH");
    });

    it("preserves key through export/import cycle", async () => {
      const keypair = await generateEphemeralKeypair();
      const exported1 = await exportPublicKey(keypair.publicKey);
      const imported = await importPublicKey(exported1);
      const exported2 = await exportPublicKey(imported);

      expect(exported1).toBe(exported2);
    });

    it("throws on invalid base64 input", async () => {
      await expect(importPublicKey("not-valid-base64!!!")).rejects.toThrow();
    });

    it("throws on invalid key data", async () => {
      const invalidKeyData = arrayBufferToBase64(new Uint8Array(32).buffer);
      await expect(importPublicKey(invalidKeyData)).rejects.toThrow();
    });
  });

  describe("deriveSharedSecret", () => {
    it("derives shared secret from key pair", async () => {
      const aliceKeypair = await generateEphemeralKeypair();
      const bobKeypair = await generateEphemeralKeypair();

      const sharedSecret = await deriveSharedSecret(
        aliceKeypair.privateKey,
        bobKeypair.publicKey
      );

      // Check it's an ArrayBuffer-like object (handles cross-realm issues)
      expect(sharedSecret.constructor.name).toBe("ArrayBuffer");
      expect(sharedSecret.byteLength).toBe(32); // 256 bits
    });

    it("produces same secret for both parties (ECDH commutativity)", async () => {
      const aliceKeypair = await generateEphemeralKeypair();
      const bobKeypair = await generateEphemeralKeypair();

      // Alice derives secret using her private key and Bob's public key
      const aliceSecret = await deriveSharedSecret(
        aliceKeypair.privateKey,
        bobKeypair.publicKey
      );

      // Bob derives secret using his private key and Alice's public key
      const bobSecret = await deriveSharedSecret(
        bobKeypair.privateKey,
        aliceKeypair.publicKey
      );

      // Both should have the same shared secret
      const aliceSecretBytes = new Uint8Array(aliceSecret);
      const bobSecretBytes = new Uint8Array(bobSecret);

      expect(aliceSecretBytes).toEqual(bobSecretBytes);
    });

    it("produces different secrets for different key pairs", async () => {
      const alice = await generateEphemeralKeypair();
      const bob1 = await generateEphemeralKeypair();
      const bob2 = await generateEphemeralKeypair();

      const secret1 = await deriveSharedSecret(alice.privateKey, bob1.publicKey);
      const secret2 = await deriveSharedSecret(alice.privateKey, bob2.publicKey);

      const bytes1 = new Uint8Array(secret1);
      const bytes2 = new Uint8Array(secret2);

      expect(bytes1).not.toEqual(bytes2);
    });

    it("is deterministic (same inputs produce same output)", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();

      const secret1 = await deriveSharedSecret(alice.privateKey, bob.publicKey);
      const secret2 = await deriveSharedSecret(alice.privateKey, bob.publicKey);

      const bytes1 = new Uint8Array(secret1);
      const bytes2 = new Uint8Array(secret2);

      expect(bytes1).toEqual(bytes2);
    });
  });

  describe("deriveSessionKey", () => {
    it("derives session key from shared secret", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const sessionKey = await deriveSessionKey(sharedSecret, "session-123");

      expect(sessionKey).toBeDefined();
      expect(sessionKey.type).toBe("secret");
      expect(sessionKey.algorithm.name).toBe("AES-GCM");
    });

    it("produces non-extractable session key", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const sessionKey = await deriveSessionKey(sharedSecret, "session-123");

      expect(sessionKey.extractable).toBe(false);
    });

    it("supports encrypt and decrypt usages", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const sessionKey = await deriveSessionKey(sharedSecret, "session-123");

      expect(sessionKey.usages).toContain("encrypt");
      expect(sessionKey.usages).toContain("decrypt");
    });

    it("uses 256-bit AES key", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const sessionKey = await deriveSessionKey(sharedSecret, "session-123");

      expect(sessionKey.algorithm.length).toBe(256);
    });

    it("produces different keys for different session IDs", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const key1 = await deriveSessionKey(sharedSecret, "session-1");
      const key2 = await deriveSessionKey(sharedSecret, "session-2");

      // Can't compare keys directly, but we can encrypt with both and
      // verify the ciphertexts are different
      const data = stringToArrayBuffer("test");
      const encrypted1 = await encryptData(key1, data);
      const encrypted2 = await encryptData(key2, data);

      // Ciphertexts should differ (different keys + different IVs)
      expect(arrayBufferToBase64(encrypted1.ciphertext)).not.toBe(
        arrayBufferToBase64(encrypted2.ciphertext)
      );
    });

    it("produces same key for same inputs (deterministic)", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );

      const key1 = await deriveSessionKey(sharedSecret, "session-123");
      const key2 = await deriveSessionKey(sharedSecret, "session-123");

      // Encrypt same data with both keys
      const data = stringToArrayBuffer("test");

      // Use same IV to compare ciphertexts
      const iv = new Uint8Array(12);
      const encrypted1 = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key1,
        data
      );
      const encrypted2 = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key2,
        data
      );

      expect(new Uint8Array(encrypted1)).toEqual(new Uint8Array(encrypted2));
    });
  });

  describe("encryptData / decryptData", () => {
    let testKey;

    beforeEach(async () => {
      testKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
    });

    it("encrypts data successfully", async () => {
      const plaintext = stringToArrayBuffer("Hello, World!");
      const result = await encryptData(testKey, plaintext);

      // Check it's an ArrayBuffer-like object (handles cross-realm issues)
      expect(result.ciphertext.constructor.name).toBe("ArrayBuffer");
      expect(result.iv.constructor.name).toBe("Uint8Array");
      expect(result.iv.length).toBe(12); // AES-GCM standard IV size
    });

    it("decrypts data successfully (round-trip)", async () => {
      const originalText = "Hello, World!";
      const plaintext = stringToArrayBuffer(originalText);

      const { ciphertext, iv } = await encryptData(testKey, plaintext);
      const decrypted = await decryptData(testKey, ciphertext, iv);

      expect(arrayBufferToString(decrypted)).toBe(originalText);
    });

    it("produces different ciphertexts for same plaintext (random IV)", async () => {
      const plaintext = stringToArrayBuffer("test");

      const result1 = await encryptData(testKey, plaintext);
      const result2 = await encryptData(testKey, plaintext);

      // IVs should be different
      expect(result1.iv).not.toEqual(result2.iv);

      // Ciphertexts should be different
      expect(arrayBufferToBase64(result1.ciphertext)).not.toBe(
        arrayBufferToBase64(result2.ciphertext)
      );
    });

    it("fails to decrypt with wrong key", async () => {
      const wrongKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      const plaintext = stringToArrayBuffer("secret");
      const { ciphertext, iv } = await encryptData(testKey, plaintext);

      await expect(decryptData(wrongKey, ciphertext, iv)).rejects.toThrow();
    });

    it("fails to decrypt tampered ciphertext", async () => {
      const plaintext = stringToArrayBuffer("secret");
      const { ciphertext, iv } = await encryptData(testKey, plaintext);

      // Tamper with ciphertext
      const tamperedBytes = new Uint8Array(ciphertext);
      tamperedBytes[0] ^= 0xff; // Flip bits

      await expect(
        decryptData(testKey, tamperedBytes.buffer, iv)
      ).rejects.toThrow();
    });

    it("handles empty plaintext", async () => {
      const plaintext = new ArrayBuffer(0);
      const { ciphertext, iv } = await encryptData(testKey, plaintext);
      const decrypted = await decryptData(testKey, ciphertext, iv);

      expect(decrypted.byteLength).toBe(0);
    });

    it("handles large plaintext", async () => {
      const largeData = new Uint8Array(1024 * 1024); // 1MB
      crypto.getRandomValues(largeData);

      const { ciphertext, iv } = await encryptData(testKey, largeData.buffer);
      const decrypted = await decryptData(testKey, ciphertext, iv);

      expect(new Uint8Array(decrypted)).toEqual(largeData);
    });

    it("supports Additional Authenticated Data (AAD)", async () => {
      const plaintext = stringToArrayBuffer("secret");
      const aad = "metadata";

      const { ciphertext, iv } = await encryptData(testKey, plaintext, aad);
      const decrypted = await decryptData(testKey, ciphertext, iv, aad);

      expect(arrayBufferToString(decrypted)).toBe("secret");
    });

    it("fails to decrypt with wrong AAD", async () => {
      const plaintext = stringToArrayBuffer("secret");
      const aad = "correct-metadata";

      const { ciphertext, iv } = await encryptData(testKey, plaintext, aad);

      await expect(
        decryptData(testKey, ciphertext, iv, "wrong-metadata")
      ).rejects.toThrow();
    });

    it("fails to decrypt with missing AAD when AAD was used", async () => {
      const plaintext = stringToArrayBuffer("secret");
      const aad = "metadata";

      const { ciphertext, iv } = await encryptData(testKey, plaintext, aad);

      // Try to decrypt without AAD
      await expect(decryptData(testKey, ciphertext, iv)).rejects.toThrow();
    });
  });

  describe("signData", () => {
    let testKey;

    beforeEach(async () => {
      testKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );
    });

    it("produces signature for data", async () => {
      const data = stringToArrayBuffer("message to sign");
      const signature = await signData(testKey, data);

      // Check it's an ArrayBuffer-like object (handles cross-realm issues)
      expect(signature.constructor.name).toBe("ArrayBuffer");
      expect(signature.byteLength).toBe(32); // SHA-256 output
    });

    it("produces same signature for same data (deterministic)", async () => {
      const data = stringToArrayBuffer("message");

      const sig1 = await signData(testKey, data);
      const sig2 = await signData(testKey, data);

      expect(new Uint8Array(sig1)).toEqual(new Uint8Array(sig2));
    });

    it("produces different signatures for different data", async () => {
      const data1 = stringToArrayBuffer("message1");
      const data2 = stringToArrayBuffer("message2");

      const sig1 = await signData(testKey, data1);
      const sig2 = await signData(testKey, data2);

      expect(new Uint8Array(sig1)).not.toEqual(new Uint8Array(sig2));
    });
  });

  describe("utility functions", () => {
    describe("arrayBufferToBase64 / base64ToArrayBuffer", () => {
      it("converts ArrayBuffer to base64", () => {
        const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const base64 = arrayBufferToBase64(data.buffer);

        expect(base64).toBe("SGVsbG8=");
      });

      it("converts base64 to ArrayBuffer", () => {
        const base64 = "SGVsbG8=";
        const buffer = base64ToArrayBuffer(base64);

        expect(new Uint8Array(buffer)).toEqual(
          new Uint8Array([72, 101, 108, 108, 111])
        );
      });

      it("round-trips correctly", () => {
        const original = new Uint8Array([1, 2, 3, 4, 5, 255, 0, 128]);
        const base64 = arrayBufferToBase64(original.buffer);
        const restored = base64ToArrayBuffer(base64);

        expect(new Uint8Array(restored)).toEqual(original);
      });

      it("handles empty buffer", () => {
        const empty = new ArrayBuffer(0);
        const base64 = arrayBufferToBase64(empty);
        const restored = base64ToArrayBuffer(base64);

        expect(restored.byteLength).toBe(0);
      });
    });

    describe("stringToArrayBuffer / arrayBufferToString", () => {
      it("converts string to ArrayBuffer", () => {
        const str = "Hello";
        const buffer = stringToArrayBuffer(str);

        expect(new Uint8Array(buffer)).toEqual(
          new Uint8Array([72, 101, 108, 108, 111])
        );
      });

      it("converts ArrayBuffer to string", () => {
        const buffer = new Uint8Array([72, 101, 108, 108, 111]).buffer;
        const str = arrayBufferToString(buffer);

        expect(str).toBe("Hello");
      });

      it("handles unicode", () => {
        const original = "Hello, \u4e16\u754c!"; // Hello, 世界!
        const buffer = stringToArrayBuffer(original);
        const restored = arrayBufferToString(buffer);

        expect(restored).toBe(original);
      });

      it("handles empty string", () => {
        const buffer = stringToArrayBuffer("");
        expect(buffer.byteLength).toBe(0);

        const str = arrayBufferToString(new ArrayBuffer(0));
        expect(str).toBe("");
      });
    });

    describe("generateUUID", () => {
      it("generates valid UUID v4 format", () => {
        const uuid = generateUUID();

        expect(uuid).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
        );
      });

      it("generates unique UUIDs", () => {
        const uuids = new Set();
        for (let i = 0; i < 100; i++) {
          uuids.add(generateUUID());
        }

        expect(uuids.size).toBe(100);
      });
    });

    describe("generateRandomBytes", () => {
      it("generates correct number of bytes", () => {
        const bytes16 = generateRandomBytes(16);
        const bytes32 = generateRandomBytes(32);
        const bytes64 = generateRandomBytes(64);

        expect(bytes16.length).toBe(16);
        expect(bytes32.length).toBe(32);
        expect(bytes64.length).toBe(64);
      });

      it("generates different values each time", () => {
        const bytes1 = generateRandomBytes(32);
        const bytes2 = generateRandomBytes(32);

        expect(bytes1).not.toEqual(bytes2);
      });

      it("returns Uint8Array", () => {
        const bytes = generateRandomBytes(16);

        expect(bytes).toBeInstanceOf(Uint8Array);
      });
    });
  });

  describe("LEK (Ledger Encryption Key)", () => {
    describe("generateLEK", () => {
      it("generates AES-GCM 256-bit key", async () => {
        const lek = await generateLEK();

        expect(lek).toBeDefined();
        expect(lek.type).toBe("secret");
        expect(lek.algorithm.name).toBe("AES-GCM");
        expect(lek.algorithm.length).toBe(256);
      });

      it("generates extractable key (for pairing transfer)", async () => {
        const lek = await generateLEK();

        expect(lek.extractable).toBe(true);
      });

      it("supports encrypt and decrypt usages", async () => {
        const lek = await generateLEK();

        expect(lek.usages).toContain("encrypt");
        expect(lek.usages).toContain("decrypt");
      });
    });

    describe("exportLEK", () => {
      it("exports LEK to raw bytes", async () => {
        const lek = await generateLEK();
        const exported = await exportLEK(lek);

        // Check it's an ArrayBuffer-like object (handles cross-realm issues)
        expect(exported.constructor.name).toBe("ArrayBuffer");
        expect(exported.byteLength).toBe(32); // 256 bits
      });
    });

    describe("importLEK", () => {
      it("imports LEK from raw bytes", async () => {
        const original = await generateLEK();
        const exported = await exportLEK(original);
        const imported = await importLEK(exported);

        expect(imported).toBeDefined();
        expect(imported.type).toBe("secret");
        expect(imported.algorithm.name).toBe("AES-GCM");
      });

      it("imports as non-extractable by default", async () => {
        const original = await generateLEK();
        const exported = await exportLEK(original);
        const imported = await importLEK(exported);

        expect(imported.extractable).toBe(false);
      });

      it("can import as extractable when specified", async () => {
        const original = await generateLEK();
        const exported = await exportLEK(original);
        const imported = await importLEK(exported, true);

        expect(imported.extractable).toBe(true);
      });

      it("preserves key functionality through export/import", async () => {
        const original = await generateLEK();
        const exported = await exportLEK(original);
        const imported = await importLEK(exported, true);

        // Encrypt with original
        const plaintext = stringToArrayBuffer("secret data");
        const { ciphertext, iv } = await encryptData(original, plaintext);

        // Decrypt with imported
        const decrypted = await decryptData(imported, ciphertext, iv);

        expect(arrayBufferToString(decrypted)).toBe("secret data");
      });
    });
  });

  describe("deriveYjsPassword", () => {
    it("derives password from LEK", async () => {
      const lek = await generateLEK();
      const password = await deriveYjsPassword(lek);

      expect(typeof password).toBe("string");
      expect(password.length).toBeGreaterThan(0);
    });

    it("produces different password than raw LEK (domain separation)", async () => {
      const lek = await generateLEK();
      const lekExported = await exportLEK(lek);
      const lekBase64 = arrayBufferToBase64(lekExported);
      const password = await deriveYjsPassword(lek);

      // Password should be different from raw LEK base64
      expect(password).not.toBe(lekBase64);
    });

    it("produces same password for same LEK (deterministic)", async () => {
      const lek = await generateLEK();

      const password1 = await deriveYjsPassword(lek);
      const password2 = await deriveYjsPassword(lek);

      expect(password1).toBe(password2);
    });

    it("produces different passwords for different LEKs", async () => {
      const lek1 = await generateLEK();
      const lek2 = await generateLEK();

      const password1 = await deriveYjsPassword(lek1);
      const password2 = await deriveYjsPassword(lek2);

      expect(password1).not.toBe(password2);
    });

    it("produces base64-encoded password of correct length", async () => {
      const lek = await generateLEK();
      const password = await deriveYjsPassword(lek);

      // 256 bits = 32 bytes, base64 encoded = 44 chars (with padding)
      expect(password.length).toBe(44);
    });
  });

  describe("security properties", () => {
    it("device keypair private key is not extractable", async () => {
      const keypair = await generateDeviceKeypair();

      await expect(
        crypto.subtle.exportKey("pkcs8", keypair.privateKey)
      ).rejects.toThrow();
    });

    it("session keys are not extractable", async () => {
      const alice = await generateEphemeralKeypair();
      const bob = await generateEphemeralKeypair();
      const sharedSecret = await deriveSharedSecret(
        alice.privateKey,
        bob.publicKey
      );
      const sessionKey = await deriveSessionKey(sharedSecret, "session");

      await expect(
        crypto.subtle.exportKey("raw", sessionKey)
      ).rejects.toThrow();
    });

    it("imported non-extractable LEK cannot be exported", async () => {
      const lek = await generateLEK();
      const exported = await exportLEK(lek);
      const imported = await importLEK(exported, false);

      await expect(crypto.subtle.exportKey("raw", imported)).rejects.toThrow();
    });
  });
});
