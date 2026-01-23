/**
 * Key Storage Service Tests
 * CRITICAL SECURITY - Tests for src/services/key-storage.js
 *
 * Uses fake-indexeddb for realistic IndexedDB testing.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  storeKey,
  retrieveKey,
  hasKey,
  deleteKey,
  listKeys,
  clearAllKeys,
  KEY_NAMES,
  storeDeviceKeypair,
  retrieveDeviceKeypair,
  storeLEK,
  retrieveLEK,
  checkDeviceInitialization,
} from "./key-storage.js";

// Helper to generate test keys
async function generateTestKeypair() {
  return await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    false, // non-extractable like device keypair
    ["deriveKey", "deriveBits"]
  );
}

async function generateTestLEK() {
  return await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true, // extractable for testing
    ["encrypt", "decrypt"]
  );
}

describe("key-storage service", () => {
  beforeEach(async () => {
    // Clear all keys before each test
    await clearAllKeys();
  });

  afterEach(async () => {
    // Clean up after each test
    await clearAllKeys();
  });

  describe("storeKey / retrieveKey", () => {
    it("stores and retrieves a symmetric key", async () => {
      const key = await generateTestLEK();
      await storeKey("test-key", key);

      const retrieved = await retrieveKey("test-key");

      expect(retrieved).toBeDefined();
      expect(retrieved.type).toBe("secret");
      expect(retrieved.algorithm.name).toBe("AES-GCM");
    });

    it("stores and retrieves a keypair", async () => {
      const keypair = await generateTestKeypair();
      await storeKey("test-keypair", keypair);

      const retrieved = await retrieveKey("test-keypair");

      expect(retrieved).toBeDefined();
      expect(retrieved.privateKey).toBeDefined();
      expect(retrieved.publicKey).toBeDefined();
    });

    it("returns null for non-existent key", async () => {
      const retrieved = await retrieveKey("non-existent");

      expect(retrieved).toBeNull();
    });

    it("overwrites existing key with same name", async () => {
      const key1 = await generateTestLEK();
      const key2 = await generateTestLEK();

      await storeKey("overwrite-test", key1);
      await storeKey("overwrite-test", key2);

      const keys = await listKeys();
      const count = keys.filter((k) => k === "overwrite-test").length;

      expect(count).toBe(1);
    });

    it("stores multiple keys independently", async () => {
      const key1 = await generateTestLEK();
      const key2 = await generateTestLEK();

      await storeKey("key-1", key1);
      await storeKey("key-2", key2);

      const retrieved1 = await retrieveKey("key-1");
      const retrieved2 = await retrieveKey("key-2");

      expect(retrieved1).toBeDefined();
      expect(retrieved2).toBeDefined();

      const keys = await listKeys();
      expect(keys).toContain("key-1");
      expect(keys).toContain("key-2");
    });

    it("preserves key usages through storage", async () => {
      const key = await generateTestLEK();
      await storeKey("usage-test", key);

      const retrieved = await retrieveKey("usage-test");

      expect(retrieved.usages).toContain("encrypt");
      expect(retrieved.usages).toContain("decrypt");
    });

    it("preserves key algorithm through storage", async () => {
      const key = await generateTestLEK();
      await storeKey("algo-test", key);

      const retrieved = await retrieveKey("algo-test");

      expect(retrieved.algorithm.name).toBe("AES-GCM");
      expect(retrieved.algorithm.length).toBe(256);
    });

    it("preserves extractable flag through storage", async () => {
      const extractableKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
      );

      await storeKey("extractable-test", extractableKey);
      const retrieved = await retrieveKey("extractable-test");

      expect(retrieved.extractable).toBe(true);
    });

    it("preserves non-extractable flag through storage", async () => {
      const nonExtractableKey = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"]
      );

      await storeKey("non-extractable-test", nonExtractableKey);
      const retrieved = await retrieveKey("non-extractable-test");

      expect(retrieved.extractable).toBe(false);
    });
  });

  describe("hasKey", () => {
    it("returns true when key exists", async () => {
      const key = await generateTestLEK();
      await storeKey("exists-test", key);

      const exists = await hasKey("exists-test");

      expect(exists).toBe(true);
    });

    it("returns false when key does not exist", async () => {
      const exists = await hasKey("does-not-exist");

      expect(exists).toBe(false);
    });

    it("returns false after key is deleted", async () => {
      const key = await generateTestLEK();
      await storeKey("delete-check", key);
      await deleteKey("delete-check");

      const exists = await hasKey("delete-check");

      expect(exists).toBe(false);
    });
  });

  describe("deleteKey", () => {
    it("deletes existing key", async () => {
      const key = await generateTestLEK();
      await storeKey("delete-test", key);

      await deleteKey("delete-test");
      const retrieved = await retrieveKey("delete-test");

      expect(retrieved).toBeNull();
    });

    it("does not throw when deleting non-existent key", async () => {
      await expect(deleteKey("non-existent")).resolves.not.toThrow();
    });

    it("only deletes specified key", async () => {
      const key1 = await generateTestLEK();
      const key2 = await generateTestLEK();

      await storeKey("keep-me", key1);
      await storeKey("delete-me", key2);

      await deleteKey("delete-me");

      expect(await hasKey("keep-me")).toBe(true);
      expect(await hasKey("delete-me")).toBe(false);
    });
  });

  describe("listKeys", () => {
    it("returns empty array when no keys stored", async () => {
      const keys = await listKeys();

      expect(keys).toEqual([]);
    });

    it("returns all stored key names", async () => {
      const key = await generateTestLEK();
      await storeKey("key-a", key);
      await storeKey("key-b", key);
      await storeKey("key-c", key);

      const keys = await listKeys();

      expect(keys).toContain("key-a");
      expect(keys).toContain("key-b");
      expect(keys).toContain("key-c");
      expect(keys.length).toBe(3);
    });

    it("updates after key addition", async () => {
      const key = await generateTestLEK();

      expect((await listKeys()).length).toBe(0);

      await storeKey("new-key", key);

      expect((await listKeys()).length).toBe(1);
    });

    it("updates after key deletion", async () => {
      const key = await generateTestLEK();
      await storeKey("temp-key", key);

      expect((await listKeys()).length).toBe(1);

      await deleteKey("temp-key");

      expect((await listKeys()).length).toBe(0);
    });
  });

  describe("clearAllKeys", () => {
    it("removes all stored keys", async () => {
      const key = await generateTestLEK();
      await storeKey("key-1", key);
      await storeKey("key-2", key);
      await storeKey("key-3", key);

      await clearAllKeys();

      const keys = await listKeys();
      expect(keys).toEqual([]);
    });

    it("succeeds when no keys exist", async () => {
      await expect(clearAllKeys()).resolves.not.toThrow();
    });
  });

  describe("KEY_NAMES", () => {
    it("defines DEVICE_KEYPAIR constant", () => {
      expect(KEY_NAMES.DEVICE_KEYPAIR).toBe("device-keypair");
    });

    it("defines LEK constant", () => {
      expect(KEY_NAMES.LEK).toBe("lek");
    });
  });

  describe("convenience functions", () => {
    describe("storeDeviceKeypair / retrieveDeviceKeypair", () => {
      it("stores device keypair", async () => {
        const keypair = await generateTestKeypair();
        await storeDeviceKeypair(keypair);

        const exists = await hasKey(KEY_NAMES.DEVICE_KEYPAIR);
        expect(exists).toBe(true);
      });

      it("retrieves device keypair", async () => {
        const keypair = await generateTestKeypair();
        await storeDeviceKeypair(keypair);

        const retrieved = await retrieveDeviceKeypair();

        expect(retrieved).toBeDefined();
        expect(retrieved.privateKey).toBeDefined();
        expect(retrieved.publicKey).toBeDefined();
      });

      it("returns null when no device keypair stored", async () => {
        const retrieved = await retrieveDeviceKeypair();

        expect(retrieved).toBeNull();
      });

      it("preserves keypair algorithm", async () => {
        const keypair = await generateTestKeypair();
        await storeDeviceKeypair(keypair);

        const retrieved = await retrieveDeviceKeypair();

        expect(retrieved.privateKey.algorithm.name).toBe("ECDH");
        expect(retrieved.privateKey.algorithm.namedCurve).toBe("P-256");
      });
    });

    describe("storeLEK / retrieveLEK", () => {
      it("stores LEK", async () => {
        const lek = await generateTestLEK();
        await storeLEK(lek);

        const exists = await hasKey(KEY_NAMES.LEK);
        expect(exists).toBe(true);
      });

      it("retrieves LEK", async () => {
        const lek = await generateTestLEK();
        await storeLEK(lek);

        const retrieved = await retrieveLEK();

        expect(retrieved).toBeDefined();
        expect(retrieved.type).toBe("secret");
        expect(retrieved.algorithm.name).toBe("AES-GCM");
      });

      it("returns null when no LEK stored", async () => {
        const retrieved = await retrieveLEK();

        expect(retrieved).toBeNull();
      });

      it("preserves LEK algorithm", async () => {
        const lek = await generateTestLEK();
        await storeLEK(lek);

        const retrieved = await retrieveLEK();

        expect(retrieved.algorithm.name).toBe("AES-GCM");
        expect(retrieved.algorithm.length).toBe(256);
      });
    });

    describe("checkDeviceInitialization", () => {
      it("returns false for both when nothing stored", async () => {
        const status = await checkDeviceInitialization();

        expect(status.hasKeypair).toBe(false);
        expect(status.hasLEK).toBe(false);
      });

      it("detects only keypair stored", async () => {
        const keypair = await generateTestKeypair();
        await storeDeviceKeypair(keypair);

        const status = await checkDeviceInitialization();

        expect(status.hasKeypair).toBe(true);
        expect(status.hasLEK).toBe(false);
      });

      it("detects only LEK stored", async () => {
        const lek = await generateTestLEK();
        await storeLEK(lek);

        const status = await checkDeviceInitialization();

        expect(status.hasKeypair).toBe(false);
        expect(status.hasLEK).toBe(true);
      });

      it("detects fully initialized device", async () => {
        const keypair = await generateTestKeypair();
        const lek = await generateTestLEK();

        await storeDeviceKeypair(keypair);
        await storeLEK(lek);

        const status = await checkDeviceInitialization();

        expect(status.hasKeypair).toBe(true);
        expect(status.hasLEK).toBe(true);
      });
    });
  });

  describe("key functionality preservation", () => {
    it("stored LEK can encrypt and decrypt", async () => {
      const lek = await generateTestLEK();
      await storeLEK(lek);

      const retrieved = await retrieveLEK();

      // Test encryption
      const plaintext = new TextEncoder().encode("secret data");
      const iv = crypto.getRandomValues(new Uint8Array(12));

      const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        retrieved,
        plaintext
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        retrieved,
        ciphertext
      );

      expect(new TextDecoder().decode(decrypted)).toBe("secret data");
    });

    it("stored keypair can derive shared secret", async () => {
      const keypair1 = await generateTestKeypair();
      const keypair2 = await crypto.subtle.generateKey(
        { name: "ECDH", namedCurve: "P-256" },
        true, // Need extractable public key
        ["deriveKey", "deriveBits"]
      );

      await storeDeviceKeypair(keypair1);
      const retrieved = await retrieveDeviceKeypair();

      // Derive shared secret using stored keypair's private key
      const sharedSecret = await crypto.subtle.deriveBits(
        { name: "ECDH", public: keypair2.publicKey },
        retrieved.privateKey,
        256
      );

      expect(sharedSecret.byteLength).toBe(32);
    });
  });

  describe("persistence simulation", () => {
    it("keys persist across multiple retrieve calls", async () => {
      const lek = await generateTestLEK();
      await storeLEK(lek);

      // Multiple retrieves
      const r1 = await retrieveLEK();
      const r2 = await retrieveLEK();
      const r3 = await retrieveLEK();

      expect(r1).toBeDefined();
      expect(r2).toBeDefined();
      expect(r3).toBeDefined();
    });

    it("clearAllKeys fully resets storage", async () => {
      const keypair = await generateTestKeypair();
      const lek = await generateTestLEK();

      await storeDeviceKeypair(keypair);
      await storeLEK(lek);

      await clearAllKeys();

      const status = await checkDeviceInitialization();
      expect(status.hasKeypair).toBe(false);
      expect(status.hasLEK).toBe(false);
    });
  });

  describe("concurrent operations", () => {
    it("handles multiple simultaneous stores", async () => {
      const keys = await Promise.all([
        generateTestLEK(),
        generateTestLEK(),
        generateTestLEK(),
      ]);

      // Store all concurrently
      await Promise.all([
        storeKey("concurrent-1", keys[0]),
        storeKey("concurrent-2", keys[1]),
        storeKey("concurrent-3", keys[2]),
      ]);

      const keyList = await listKeys();
      expect(keyList).toContain("concurrent-1");
      expect(keyList).toContain("concurrent-2");
      expect(keyList).toContain("concurrent-3");
    });

    it("handles concurrent read and write", async () => {
      const key = await generateTestLEK();
      await storeKey("concurrent-rw", key);

      // Read and write concurrently
      const [retrieved, _] = await Promise.all([
        retrieveKey("concurrent-rw"),
        storeKey("concurrent-rw-2", key),
      ]);

      expect(retrieved).toBeDefined();
      expect(await hasKey("concurrent-rw-2")).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("handles key names with special characters", async () => {
      const key = await generateTestLEK();
      const specialName = "key-with-special_chars.123";

      await storeKey(specialName, key);
      const retrieved = await retrieveKey(specialName);

      expect(retrieved).toBeDefined();
    });

    it("handles empty key name", async () => {
      const key = await generateTestLEK();

      await storeKey("", key);
      const retrieved = await retrieveKey("");

      expect(retrieved).toBeDefined();
    });
  });
});
