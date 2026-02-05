/**
 * Crypto Conversion Utility Tests
 * Tests for encoding/decoding utilities in src/services/crypto.js
 *
 * These conversion functions underpin all cryptographic operations.
 * A subtle bug in base64 encoding/decoding or buffer conversion would
 * silently corrupt encrypted data across the entire sync pipeline.
 */

import { describe, it, expect } from "vitest";
import {
  arrayBufferToBase64,
  base64ToArrayBuffer,
  base64ToUint8Array,
  stringToArrayBuffer,
  arrayBufferToString,
  generateRandomBytes,
} from "./crypto.js";

describe("crypto conversion utilities", () => {
  describe("base64ToUint8Array", () => {
    it("converts base64 to Uint8Array", () => {
      // btoa("hello") === "aGVsbG8="
      const result = base64ToUint8Array("aGVsbG8=");

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(5);
      expect(Array.from(result)).toEqual([104, 101, 108, 108, 111]); // "hello"
    });

    it("returns Uint8Array not ArrayBuffer", () => {
      const result = base64ToUint8Array("AAAA");

      // This is critical for crypto.subtle which can fail with bare ArrayBuffer
      // in cross-realm scenarios (e.g., Node test environment)
      expect(result).toBeInstanceOf(Uint8Array);
      expect(result).not.toBeInstanceOf(ArrayBuffer);
    });

    it("handles empty base64 string", () => {
      const result = base64ToUint8Array(btoa(""));

      expect(result).toBeInstanceOf(Uint8Array);
      expect(result.length).toBe(0);
    });

    it("handles binary data round-trip via base64", () => {
      // Create binary data with all byte values 0-255
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }

      const base64 = arrayBufferToBase64(original.buffer);
      const restored = base64ToUint8Array(base64);

      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("handles base64 with padding", () => {
      // "a" -> base64 "YQ==" (2 padding chars)
      const result = base64ToUint8Array("YQ==");
      expect(result.length).toBe(1);
      expect(result[0]).toBe(97); // 'a'
    });

    it("handles base64 without padding", () => {
      // "abc" -> base64 "YWJj" (no padding)
      const result = base64ToUint8Array("YWJj");
      expect(result.length).toBe(3);
      expect(Array.from(result)).toEqual([97, 98, 99]); // "abc"
    });
  });

  describe("arrayBufferToBase64 / base64ToArrayBuffer round-trips", () => {
    it("round-trips zero-filled buffer", () => {
      const original = new Uint8Array(32).buffer;
      const base64 = arrayBufferToBase64(original);
      const restored = base64ToArrayBuffer(base64);

      expect(new Uint8Array(restored)).toEqual(new Uint8Array(original));
    });

    it("round-trips all byte values (0-255)", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }

      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("round-trips random crypto bytes", () => {
      const original = generateRandomBytes(64);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("round-trips AES-256 key size (32 bytes)", () => {
      const original = generateRandomBytes(32);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored.length).toBe(32);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("round-trips IV size (12 bytes)", () => {
      const original = generateRandomBytes(12);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(restored.length).toBe(12);
      expect(Array.from(restored)).toEqual(Array.from(original));
    });

    it("round-trips 1 byte", () => {
      const original = new Uint8Array([0xff]);
      const base64 = arrayBufferToBase64(original.buffer);
      const restored = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(restored)).toEqual([0xff]);
    });

    it("round-trips empty buffer", () => {
      const original = new ArrayBuffer(0);
      const base64 = arrayBufferToBase64(original);
      const restored = base64ToArrayBuffer(base64);

      expect(new Uint8Array(restored).length).toBe(0);
    });

    it("produces valid base64 output", () => {
      const data = generateRandomBytes(48);
      const base64 = arrayBufferToBase64(data.buffer);

      // Valid base64 pattern
      expect(base64).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
    });
  });

  describe("base64ToUint8Array vs base64ToArrayBuffer consistency", () => {
    it("produces identical bytes for same input", () => {
      const base64 = arrayBufferToBase64(generateRandomBytes(32).buffer);

      const fromUint8Array = base64ToUint8Array(base64);
      const fromArrayBuffer = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(fromUint8Array)).toEqual(Array.from(fromArrayBuffer));
    });

    it("both handle all 256 byte values identically", () => {
      const original = new Uint8Array(256);
      for (let i = 0; i < 256; i++) {
        original[i] = i;
      }
      const base64 = arrayBufferToBase64(original.buffer);

      const u8 = base64ToUint8Array(base64);
      const ab = new Uint8Array(base64ToArrayBuffer(base64));

      expect(Array.from(u8)).toEqual(Array.from(ab));
    });
  });

  describe("stringToArrayBuffer / arrayBufferToString round-trips", () => {
    it("round-trips ASCII string", () => {
      const original = "Hello, World!";
      const buffer = stringToArrayBuffer(original);
      const restored = arrayBufferToString(buffer);

      expect(restored).toBe(original);
    });

    it("round-trips empty string", () => {
      const buffer = stringToArrayBuffer("");
      const restored = arrayBufferToString(buffer);

      expect(restored).toBe("");
    });

    it("round-trips unicode characters", () => {
      const original = "Hello \u4e16\u754c \u{1F600}";
      const buffer = stringToArrayBuffer(original);
      const restored = arrayBufferToString(buffer);

      expect(restored).toBe(original);
    });

    it("round-trips JSON strings", () => {
      const obj = { url: "https://example.com", tags: ["test", "demo"] };
      const original = JSON.stringify(obj);
      const buffer = stringToArrayBuffer(original);
      const restored = arrayBufferToString(buffer);

      expect(JSON.parse(restored)).toEqual(obj);
    });

    it("round-trips strings with special characters", () => {
      const original = 'Line1\nLine2\tTabbed\r\nCRLF "quotes" \'single\'';
      const buffer = stringToArrayBuffer(original);
      const restored = arrayBufferToString(buffer);

      expect(restored).toBe(original);
    });

    it("round-trips long strings", () => {
      const original = "x".repeat(100000);
      const buffer = stringToArrayBuffer(original);
      const restored = arrayBufferToString(buffer);

      expect(restored).toBe(original);
      expect(restored.length).toBe(100000);
    });
  });

  describe("cross-function round-trips", () => {
    it("string -> buffer -> base64 -> buffer -> string", () => {
      const original = "Encrypt this message \u{1F512}";

      const buffer = stringToArrayBuffer(original);
      const base64 = arrayBufferToBase64(buffer);
      const restoredBuffer = base64ToArrayBuffer(base64);
      const restored = arrayBufferToString(restoredBuffer);

      expect(restored).toBe(original);
    });

    it("string -> buffer -> base64 -> Uint8Array -> string", () => {
      const original = "Test with Uint8Array path";

      const buffer = stringToArrayBuffer(original);
      const base64 = arrayBufferToBase64(buffer);
      const uint8 = base64ToUint8Array(base64);
      const restored = arrayBufferToString(uint8.buffer);

      expect(restored).toBe(original);
    });

    it("random bytes -> base64 -> Uint8Array preserves all bytes", () => {
      // This is the exact path used in crypto operations:
      // encrypt produces Uint8Array, encode to base64 for transport,
      // decode back to Uint8Array for decrypt
      for (let i = 0; i < 10; i++) {
        const original = generateRandomBytes(32 + i);
        const base64 = arrayBufferToBase64(original.buffer);
        const restored = base64ToUint8Array(base64);

        expect(Array.from(restored)).toEqual(Array.from(original));
      }
    });
  });

  describe("generateRandomBytes", () => {
    it("generates bytes of requested length", () => {
      expect(generateRandomBytes(16).length).toBe(16);
      expect(generateRandomBytes(32).length).toBe(32);
      expect(generateRandomBytes(64).length).toBe(64);
    });

    it("returns Uint8Array", () => {
      const result = generateRandomBytes(8);
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it("generates different values on each call", () => {
      const a = generateRandomBytes(32);
      const b = generateRandomBytes(32);

      // Technically could be equal but probability is 2^-256
      expect(Array.from(a)).not.toEqual(Array.from(b));
    });

    it("generates zero-length array", () => {
      const result = generateRandomBytes(0);
      expect(result.length).toBe(0);
    });
  });
});
