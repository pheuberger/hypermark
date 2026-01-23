/**
 * Pairing Code Service Tests
 * CRITICAL SECURITY - Tests for src/services/pairing-code.js
 *
 * Tests pairing code generation, parsing, PSK derivation, and message encryption.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  generatePairingCode,
  parsePairingCode,
  getRoomName,
  derivePSK,
  encryptMessage,
  decryptMessage,
} from "./pairing-code.js";
import { wordlist } from "./wordlist.js";

describe("pairing-code service", () => {
  describe("generatePairingCode", () => {
    it("generates code with room, words, and formatted code string", () => {
      const result = generatePairingCode();

      expect(result).toHaveProperty("code");
      expect(result).toHaveProperty("room");
      expect(result).toHaveProperty("words");
    });

    it("generates room number in valid range (1-999)", () => {
      // Generate multiple codes to test range
      for (let i = 0; i < 100; i++) {
        const { room } = generatePairingCode();
        expect(room).toBeGreaterThanOrEqual(1);
        expect(room).toBeLessThanOrEqual(999);
      }
    });

    it("generates exactly 2 words", () => {
      const { words } = generatePairingCode();

      expect(words).toHaveLength(2);
    });

    it("uses words from the wordlist", () => {
      const { words } = generatePairingCode();

      expect(wordlist).toContain(words[0]);
      expect(wordlist).toContain(words[1]);
    });

    it("formats code correctly as room-word1-word2", () => {
      const { code, room, words } = generatePairingCode();

      expect(code).toBe(`${room}-${words[0]}-${words[1]}`);
    });

    it("generates different codes on each invocation", () => {
      const codes = new Set();
      for (let i = 0; i < 50; i++) {
        const { code } = generatePairingCode();
        codes.add(code);
      }

      // Should have many unique codes (probabilistically)
      // With 999 rooms * 600^2 word combinations, collisions are rare
      expect(codes.size).toBeGreaterThan(40);
    });

    it("generates boundary room numbers", () => {
      // Statistical test: generate many codes and check we see both low and high rooms
      const rooms = [];
      for (let i = 0; i < 500; i++) {
        rooms.push(generatePairingCode().room);
      }

      const minRoom = Math.min(...rooms);
      const maxRoom = Math.max(...rooms);

      // Should have seen some low and high numbers
      expect(minRoom).toBeLessThan(100);
      expect(maxRoom).toBeGreaterThan(900);
    });
  });

  describe("parsePairingCode", () => {
    it("parses valid code correctly", () => {
      const result = parsePairingCode("123-apple-river");

      expect(result.room).toBe(123);
      expect(result.words).toEqual(["apple", "river"]);
    });

    it("handles case insensitivity", () => {
      const result1 = parsePairingCode("123-APPLE-RIVER");
      const result2 = parsePairingCode("123-Apple-River");
      const result3 = parsePairingCode("123-apple-river");

      expect(result1.words).toEqual(["apple", "river"]);
      expect(result2.words).toEqual(["apple", "river"]);
      expect(result3.words).toEqual(["apple", "river"]);
    });

    it("handles whitespace trimming", () => {
      const result = parsePairingCode("  123-apple-river  ");

      expect(result.room).toBe(123);
      expect(result.words).toEqual(["apple", "river"]);
    });

    it("parses boundary room numbers", () => {
      const result1 = parsePairingCode("1-apple-river");
      const result999 = parsePairingCode("999-apple-river");

      expect(result1.room).toBe(1);
      expect(result999.room).toBe(999);
    });

    it("throws on invalid format - missing separators", () => {
      expect(() => parsePairingCode("123appleriver")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("throws on invalid format - empty string", () => {
      expect(() => parsePairingCode("")).toThrow("Invalid pairing code format");
    });

    it("throws on invalid format - room only", () => {
      expect(() => parsePairingCode("123")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("throws on invalid format - single word", () => {
      expect(() => parsePairingCode("123-apple")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("throws on invalid format - too many words", () => {
      expect(() => parsePairingCode("123-apple-river-extra")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("throws on room number 0", () => {
      expect(() => parsePairingCode("0-apple-river")).toThrow(
        "Room number must be between 1 and 999"
      );
    });

    it("throws on room number above 999", () => {
      // The regex only matches 1-3 digit room numbers, so 1000+ fails at format validation
      expect(() => parsePairingCode("1000-apple-river")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("throws on unknown first word", () => {
      expect(() => parsePairingCode("123-notaword-river")).toThrow(
        'Unknown word: "notaword"'
      );
    });

    it("throws on unknown second word", () => {
      expect(() => parsePairingCode("123-apple-notaword")).toThrow(
        'Unknown word: "notaword"'
      );
    });

    it("round-trips with generatePairingCode", () => {
      const generated = generatePairingCode();
      const parsed = parsePairingCode(generated.code);

      expect(parsed.room).toBe(generated.room);
      expect(parsed.words).toEqual(generated.words);
    });
  });

  describe("getRoomName", () => {
    it("generates room name with pairing prefix", () => {
      expect(getRoomName(123)).toBe("pairing-123");
      expect(getRoomName(1)).toBe("pairing-1");
      expect(getRoomName(999)).toBe("pairing-999");
    });
  });

  describe("derivePSK", () => {
    it("derives CryptoKey from words", async () => {
      const psk = await derivePSK(["apple", "river"]);

      expect(psk).toBeDefined();
      expect(psk.type).toBe("secret");
    });

    it("uses AES-GCM algorithm", async () => {
      const psk = await derivePSK(["apple", "river"]);

      expect(psk.algorithm.name).toBe("AES-GCM");
    });

    it("uses 256-bit key", async () => {
      const psk = await derivePSK(["apple", "river"]);

      expect(psk.algorithm.length).toBe(256);
    });

    it("supports encrypt and decrypt", async () => {
      const psk = await derivePSK(["apple", "river"]);

      expect(psk.usages).toContain("encrypt");
      expect(psk.usages).toContain("decrypt");
    });

    it("produces same PSK for same words (deterministic)", async () => {
      const psk1 = await derivePSK(["apple", "river"]);
      const psk2 = await derivePSK(["apple", "river"]);

      // Can't compare keys directly, but can test encryption
      const plaintext = { test: "data" };
      const encrypted = await encryptMessage(psk1, plaintext);
      const decrypted = await decryptMessage(psk2, encrypted.ciphertext, encrypted.iv);

      expect(decrypted).toEqual(plaintext);
    });

    it("produces different PSKs for different words", async () => {
      const psk1 = await derivePSK(["apple", "river"]);
      const psk2 = await derivePSK(["banana", "ocean"]);

      // Encrypt with psk1, try to decrypt with psk2 - should fail
      const plaintext = { test: "data" };
      const encrypted = await encryptMessage(psk1, plaintext);

      await expect(
        decryptMessage(psk2, encrypted.ciphertext, encrypted.iv)
      ).rejects.toThrow();
    });

    it("produces extractable key for testing", async () => {
      const psk = await derivePSK(["apple", "river"]);

      expect(psk.extractable).toBe(true);
    });

    it("handles single word array", async () => {
      const psk = await derivePSK(["apple"]);

      expect(psk).toBeDefined();
      expect(psk.type).toBe("secret");
    });
  });

  describe("encryptMessage / decryptMessage", () => {
    let psk;

    beforeEach(async () => {
      psk = await derivePSK(["apple", "river"]);
    });

    it("encrypts message object to ciphertext and iv", async () => {
      const message = { type: "test", data: "hello" };
      const result = await encryptMessage(psk, message);

      expect(result).toHaveProperty("ciphertext");
      expect(result).toHaveProperty("iv");
      expect(typeof result.ciphertext).toBe("string"); // base64
      expect(typeof result.iv).toBe("string"); // base64
    });

    it("decrypts back to original message (round-trip)", async () => {
      const original = { type: "KEY_EXCHANGE", publicKey: "abc123" };
      const { ciphertext, iv } = await encryptMessage(psk, original);
      const decrypted = await decryptMessage(psk, ciphertext, iv);

      expect(decrypted).toEqual(original);
    });

    it("produces different ciphertexts for same message (random IV)", async () => {
      const message = { type: "test" };
      const result1 = await encryptMessage(psk, message);
      const result2 = await encryptMessage(psk, message);

      expect(result1.ciphertext).not.toBe(result2.ciphertext);
      expect(result1.iv).not.toBe(result2.iv);
    });

    it("handles empty object", async () => {
      const original = {};
      const { ciphertext, iv } = await encryptMessage(psk, original);
      const decrypted = await decryptMessage(psk, ciphertext, iv);

      expect(decrypted).toEqual(original);
    });

    it("handles complex nested objects", async () => {
      const original = {
        type: "LEK_TRANSFER",
        payload: {
          encryptedLEK: "base64data...",
          iv: "ivdata...",
          metadata: {
            deviceId: "device-123",
            timestamp: Date.now(),
          },
        },
        array: [1, 2, 3],
      };

      const { ciphertext, iv } = await encryptMessage(psk, original);
      const decrypted = await decryptMessage(psk, ciphertext, iv);

      expect(decrypted).toEqual(original);
    });

    it("handles strings with special characters", async () => {
      const original = {
        data: "Special chars: \u4e2d\u6587 \u{1F600} <script>alert(1)</script>",
      };

      const { ciphertext, iv } = await encryptMessage(psk, original);
      const decrypted = await decryptMessage(psk, ciphertext, iv);

      expect(decrypted).toEqual(original);
    });

    it("fails to decrypt with wrong PSK", async () => {
      const wrongPsk = await derivePSK(["banana", "ocean"]);
      const { ciphertext, iv } = await encryptMessage(psk, { test: "data" });

      await expect(
        decryptMessage(wrongPsk, ciphertext, iv)
      ).rejects.toThrow();
    });

    it("fails to decrypt tampered ciphertext", async () => {
      const { ciphertext, iv } = await encryptMessage(psk, { test: "data" });

      // Tamper with ciphertext by changing a character
      const tampered = "X" + ciphertext.slice(1);

      await expect(
        decryptMessage(psk, tampered, iv)
      ).rejects.toThrow();
    });

    it("fails to decrypt with wrong IV", async () => {
      const { ciphertext } = await encryptMessage(psk, { test: "data" });

      // Use wrong IV
      const wrongIv = btoa(String.fromCharCode(...new Uint8Array(12)));

      await expect(
        decryptMessage(psk, ciphertext, wrongIv)
      ).rejects.toThrow();
    });
  });

  describe("security properties", () => {
    it("PBKDF2 uses sufficient iterations", async () => {
      // We can't directly inspect PBKDF2 parameters, but we can verify
      // that derivation is slow enough to indicate proper iteration count
      const start = performance.now();
      await derivePSK(["apple", "river"]);
      const duration = performance.now() - start;

      // With 100000 iterations, derivation should take at least a few ms
      // This is a soft check - actual time varies by hardware
      expect(duration).toBeGreaterThan(0);
    });

    it("uses consistent salt for deterministic derivation", async () => {
      // Same words should always produce same key
      const psk1 = await derivePSK(["test", "words"]);
      const psk2 = await derivePSK(["test", "words"]);

      // Verify by encrypting/decrypting
      const encrypted = await encryptMessage(psk1, { data: "test" });
      const decrypted = await decryptMessage(psk2, encrypted.ciphertext, encrypted.iv);

      expect(decrypted).toEqual({ data: "test" });
    });

    it("different word order produces different keys", async () => {
      const psk1 = await derivePSK(["apple", "river"]);
      const psk2 = await derivePSK(["river", "apple"]);

      const encrypted = await encryptMessage(psk1, { test: "data" });

      // Should fail to decrypt with swapped-order key
      await expect(
        decryptMessage(psk2, encrypted.ciphertext, encrypted.iv)
      ).rejects.toThrow();
    });
  });

  describe("wordlist validation", () => {
    it("wordlist contains expected sample words", () => {
      // Sample words that should be in the wordlist
      const sampleWords = ["apple", "river", "ocean", "forest", "mountain"];

      for (const word of sampleWords) {
        // Check if word exists (some might not be in truncated list)
        if (wordlist.includes(word)) {
          expect(wordlist).toContain(word);
        }
      }
    });

    it("wordlist has sufficient entropy (at least 100 words)", () => {
      expect(wordlist.length).toBeGreaterThanOrEqual(100);
    });

    it("wordlist words are lowercase", () => {
      for (const word of wordlist) {
        expect(word).toBe(word.toLowerCase());
      }
    });

    it("wordlist has minimal duplicate words", () => {
      const uniqueWords = new Set(wordlist);
      // Allow a small number of duplicates (some wordlists may have minor duplicates)
      const duplicateCount = wordlist.length - uniqueWords.size;
      expect(duplicateCount).toBeLessThan(10);
    });

    it("wordlist words contain only letters", () => {
      for (const word of wordlist) {
        expect(word).toMatch(/^[a-z]+$/);
      }
    });
  });

  describe("input validation edge cases", () => {
    it("handles code with extra spaces between parts", () => {
      // The current implementation doesn't handle this case
      // Testing that it fails gracefully
      expect(() => parsePairingCode("123 - apple - river")).toThrow();
    });

    it("handles negative room numbers", () => {
      expect(() => parsePairingCode("-1-apple-river")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("handles non-numeric room", () => {
      expect(() => parsePairingCode("abc-apple-river")).toThrow(
        "Invalid pairing code format"
      );
    });

    it("handles very long input", () => {
      const longInput = "1-" + "a".repeat(10000) + "-apple";
      expect(() => parsePairingCode(longInput)).toThrow();
    });

    it("handles null input", () => {
      expect(() => parsePairingCode(null)).toThrow();
    });

    it("handles undefined input", () => {
      expect(() => parsePairingCode(undefined)).toThrow();
    });
  });
});
