/**
 * Security Audit Test Suite
 *
 * Comprehensive security tests for the Hypermark Nostr sync implementation.
 * These tests validate cryptographic operations, input validation, and
 * security boundaries as documented in the security audit preparation materials.
 *
 * Test Categories:
 * - Key Derivation Security (KD-*)
 * - Encryption Security (EN-*)
 * - Event Validation Security (EV-*)
 * - Replay Attack Protection (RA-*)
 * - Signature Security (SG-*)
 * - Privacy Preservation (PP-*)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  deriveNostrSeed,
  deriveNostrKeypair,
  deriveNostrKeypairCached,
  generateNostrKeypair,
  isValidSecp256k1Seed,
  signNostrEvent,
  verifyNostrEventSignature,
  computeEventId,
  createSignedNostrEvent,
  getXOnlyPubkey,
  uint8ArrayToHex,
  hexToUint8Array,
  clearNostrKeypairCache,
} from './nostr-crypto.js'
import {
  generateLEK,
  encryptData,
  decryptData,
  arrayBufferToBase64,
  base64ToArrayBuffer,
  importLEK,
  exportLEK,
  deriveYjsPassword,
} from './crypto.js'
import {
  validateEventStructure,
  validateEventTimestamp,
  validateEventTags,
  validateEventContentSize,
  validateBookmarkEvent,
  validateNostrEvent,
  VALIDATION_ERRORS,
  NOSTR_KINDS,
} from './nostr-sync.js'

// =============================================================================
// Key Derivation Security Tests (KD-*)
// =============================================================================

describe('Key Derivation Security', () => {
  let lek

  beforeEach(async () => {
    lek = await generateLEK()
    clearNostrKeypairCache()
  })

  describe('KD-01: HKDF Domain Separation', () => {
    it('should produce different keys for Nostr seed vs Yjs password', async () => {
      const nostrSeed = await deriveNostrSeed(lek)
      const yjsPassword = await deriveYjsPassword(lek)

      // Convert to comparable formats
      const nostrHex = uint8ArrayToHex(nostrSeed)
      const yjsBase64 = yjsPassword

      // They should be different
      expect(nostrHex).not.toBe(arrayBufferToBase64(nostrSeed.buffer))
      expect(yjsBase64).not.toBe(arrayBufferToBase64(nostrSeed.buffer))
    })

    it('should produce different seeds for different LEKs', async () => {
      const lek2 = await generateLEK()

      const seed1 = await deriveNostrSeed(lek)
      const seed2 = await deriveNostrSeed(lek2)

      expect(uint8ArrayToHex(seed1)).not.toBe(uint8ArrayToHex(seed2))
    })
  })

  describe('KD-02: Deterministic Derivation', () => {
    it('should produce identical keypairs from same LEK', async () => {
      const results = []

      for (let i = 0; i < 10; i++) {
        clearNostrKeypairCache() // Clear cache to force fresh derivation
        const keypair = await deriveNostrKeypair(lek)
        results.push(keypair.privateKeyHex)
      }

      // All results should be identical
      const first = results[0]
      expect(results.every(r => r === first)).toBe(true)
    })
  })

  describe('KD-03: secp256k1 Curve Order Validation', () => {
    it('should reject zero seed', () => {
      const zeroSeed = new Uint8Array(32).fill(0)
      expect(isValidSecp256k1Seed(zeroSeed)).toBe(false)
    })

    it('should reject seed equal to curve order', () => {
      // secp256k1 curve order n
      const curveOrder = new Uint8Array([
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
        0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
        0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41,
      ])
      expect(isValidSecp256k1Seed(curveOrder)).toBe(false)
    })

    it('should reject seed greater than curve order', () => {
      // All 0xFF (greater than curve order)
      const tooLarge = new Uint8Array(32).fill(0xff)
      expect(isValidSecp256k1Seed(tooLarge)).toBe(false)
    })

    it('should accept valid seed (less than curve order)', () => {
      // Small valid seed
      const validSeed = new Uint8Array(32)
      validSeed[31] = 1 // Just the value 1, which is valid
      expect(isValidSecp256k1Seed(validSeed)).toBe(true)
    })

    it('should reject wrong-length seeds', () => {
      expect(isValidSecp256k1Seed(new Uint8Array(31))).toBe(false)
      expect(isValidSecp256k1Seed(new Uint8Array(33))).toBe(false)
      expect(isValidSecp256k1Seed(new Uint8Array(0))).toBe(false)
    })
  })

  describe('KD-04: LEK Non-Extractability Check', () => {
    it('should fail with non-extractable LEK', async () => {
      // Create non-extractable LEK
      const rawKey = await exportLEK(lek)
      const nonExtractableLek = await importLEK(rawKey, false)

      await expect(deriveNostrSeed(nonExtractableLek)).rejects.toThrow()
    })
  })

  describe('KD-05: Cache Invalidation on LEK Change', () => {
    it('should return different keypair for different LEK', async () => {
      const keypair1 = await deriveNostrKeypairCached(lek)

      const lek2 = await generateLEK()
      const keypair2 = await deriveNostrKeypairCached(lek2)

      expect(keypair1.privateKeyHex).not.toBe(keypair2.privateKeyHex)
    })

    it('should return cached keypair for same LEK', async () => {
      const keypair1 = await deriveNostrKeypairCached(lek)
      const keypair2 = await deriveNostrKeypairCached(lek)

      expect(keypair1.privateKeyHex).toBe(keypair2.privateKeyHex)
    })
  })
})

// =============================================================================
// Encryption Security Tests (EN-*)
// =============================================================================

describe('Encryption Security', () => {
  let lek

  beforeEach(async () => {
    lek = await generateLEK()
  })

  describe('EN-01: IV Uniqueness', () => {
    it('should generate unique IVs for each encryption', async () => {
      const plaintext = new TextEncoder().encode('test data')
      const ivSet = new Set()

      for (let i = 0; i < 100; i++) {
        const { iv } = await encryptData(lek, plaintext)
        const ivHex = uint8ArrayToHex(iv)

        expect(ivSet.has(ivHex)).toBe(false)
        ivSet.add(ivHex)
      }

      expect(ivSet.size).toBe(100)
    })
  })

  describe('EN-02: Ciphertext Integrity', () => {
    it('should detect ciphertext tampering', async () => {
      const plaintext = new TextEncoder().encode('secret data')
      const { ciphertext, iv } = await encryptData(lek, plaintext)

      // Tamper with ciphertext
      const tampered = new Uint8Array(ciphertext)
      tampered[0] ^= 0xff // Flip bits

      await expect(decryptData(lek, tampered.buffer, iv)).rejects.toThrow()
    })
  })

  describe('EN-03: IV Tampering Detection', () => {
    it('should detect IV modification', async () => {
      const plaintext = new TextEncoder().encode('secret data')
      const { ciphertext, iv } = await encryptData(lek, plaintext)

      // Tamper with IV
      const tamperedIv = new Uint8Array(iv)
      tamperedIv[0] ^= 0xff

      await expect(decryptData(lek, ciphertext, tamperedIv)).rejects.toThrow()
    })
  })

  describe('EN-04: Key Mismatch Detection', () => {
    it('should fail decryption with wrong key', async () => {
      const lek2 = await generateLEK()
      const plaintext = new TextEncoder().encode('secret data')
      const { ciphertext, iv } = await encryptData(lek, plaintext)

      await expect(decryptData(lek2, ciphertext, iv)).rejects.toThrow()
    })
  })

  describe('EN-05: Empty Content Handling', () => {
    it('should encrypt and decrypt empty content', async () => {
      const empty = new ArrayBuffer(0)
      const { ciphertext, iv } = await encryptData(lek, empty)
      const decrypted = await decryptData(lek, ciphertext, iv)

      expect(decrypted.byteLength).toBe(0)
    })
  })

  describe('EN-06: Large Content Handling', () => {
    it('should handle content near size limit', async () => {
      const largeData = new Uint8Array(99 * 1024) // 99KB
      // Fill in chunks to avoid 65536 byte limit of getRandomValues
      const chunkSize = 65536;
      for (let i = 0; i < largeData.length; i += chunkSize) {
        const chunk = new Uint8Array(largeData.buffer, i, Math.min(chunkSize, largeData.length - i));
        crypto.getRandomValues(chunk);
      }
      const { ciphertext, iv } = await encryptData(lek, largeData.buffer)
      const decrypted = await decryptData(lek, ciphertext, iv)

      expect(new Uint8Array(decrypted)).toEqual(largeData)
    })
  })
})

// =============================================================================
// Event Validation Security Tests (EV-*)
// =============================================================================

describe('Event Validation Security', () => {
  const validEvent = {
    id: 'a'.repeat(64),
    pubkey: 'b'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: 30053,
    tags: [['d', 'test-bookmark'], ['app', 'hypermark']],
    content: 'dGVzdA==:Y2lwaGVy',
    sig: 'c'.repeat(128),
  }

  describe('EV-01: Missing Required Fields', () => {
    const requiredFields = ['id', 'pubkey', 'created_at', 'kind', 'tags', 'content', 'sig']

    for (const field of requiredFields) {
      it(`should reject event missing ${field}`, () => {
        const event = { ...validEvent }
        delete event[field]

        const result = validateEventStructure(event)
        expect(result.valid).toBe(false)
        expect(result.error).toBe(VALIDATION_ERRORS.MISSING_REQUIRED_FIELD)
      })
    }
  })

  describe('EV-02: Invalid Field Types', () => {
    it('should reject non-string id', () => {
      const event = { ...validEvent, id: 12345 }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject non-number created_at', () => {
      const event = { ...validEvent, created_at: 'not-a-number' }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject float kind', () => {
      const event = { ...validEvent, kind: 30053.5 }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject non-array tags', () => {
      const event = { ...validEvent, tags: 'not-an-array' }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject null content', () => {
      const event = { ...validEvent, content: null }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })
  })

  describe('EV-03: Invalid Hex Strings', () => {
    it('should reject short id', () => {
      const event = { ...validEvent, id: 'a'.repeat(63) }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject long id', () => {
      const event = { ...validEvent, id: 'a'.repeat(65) }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject invalid hex characters', () => {
      const event = { ...validEvent, id: 'g'.repeat(64) }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })

    it('should reject uppercase hex', () => {
      const event = { ...validEvent, id: 'A'.repeat(64) }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })
  })

  describe('EV-04: Negative Kind Values', () => {
    it('should reject negative kind', () => {
      const event = { ...validEvent, kind: -1 }
      const result = validateEventStructure(event)
      expect(result.valid).toBe(false)
    })
  })

  describe('EV-05: Bookmark Event Tag Validation', () => {
    it('should reject bookmark without d tag', () => {
      const event = { ...validEvent, tags: [['app', 'hypermark']] }
      const result = validateBookmarkEvent(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.MISSING_REQUIRED_TAG)
    })

    it('should reject bookmark without app tag', () => {
      const event = { ...validEvent, tags: [['d', 'test-id']] }
      const result = validateBookmarkEvent(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.MISSING_REQUIRED_TAG)
    })

    it('should reject bookmark with wrong app tag value', () => {
      const event = { ...validEvent, tags: [['d', 'test-id'], ['app', 'wrong-app']] }
      const result = validateBookmarkEvent(event)
      expect(result.valid).toBe(false)
    })
  })

  describe('EV-06: Encrypted Content Format', () => {
    it('should reject content without colon separator', () => {
      const event = { ...validEvent, content: 'nocolon' }
      const result = validateBookmarkEvent(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.INVALID_ENCRYPTED_FORMAT)
    })

    it('should reject content with multiple colons', () => {
      const event = { ...validEvent, content: 'part1:part2:part3' }
      const result = validateBookmarkEvent(event)
      expect(result.valid).toBe(false)
    })
  })
})

// =============================================================================
// Replay Attack Protection Tests (RA-*)
// =============================================================================

describe('Replay Attack Protection', () => {
  describe('RA-01: Future Timestamp Rejection', () => {
    it('should reject event too far in future', () => {
      const futureTime = Math.floor(Date.now() / 1000) + 3700 // >1 hour
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: futureTime,
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTimestamp(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.INVALID_TIMESTAMP)
    })
  })

  describe('RA-02: Ancient Timestamp Rejection', () => {
    it('should reject event before minimum timestamp', () => {
      const ancientTime = 1577836799 // Just before Jan 1, 2020
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: ancientTime,
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTimestamp(event)
      expect(result.valid).toBe(false)
    })

    it('should reject zero timestamp', () => {
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: 0,
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTimestamp(event)
      expect(result.valid).toBe(false)
    })
  })

  describe('RA-03: Acceptable Timestamp Range', () => {
    it('should accept current timestamp', () => {
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTimestamp(event)
      expect(result.valid).toBe(true)
    })

    it('should accept timestamp from 1 day ago', () => {
      const oneDayAgo = Math.floor(Date.now() / 1000) - 86400
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: oneDayAgo,
        kind: 30053,
        tags: [],
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTimestamp(event)
      expect(result.valid).toBe(true)
    })
  })
})

// =============================================================================
// Signature Security Tests (SG-*)
// =============================================================================

describe('Signature Security', () => {
  let lek, keypair

  beforeEach(async () => {
    lek = await generateLEK()
    keypair = await deriveNostrKeypair(lek)
  })

  describe('SG-01: Schnorr Signature Verification', () => {
    it('should verify valid signature', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test content',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(true)
    })

    it('should reject modified content', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'original',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Tamper with content
      event.content = 'tampered'

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(false)
    })

    it('should reject modified timestamp', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Tamper with timestamp
      event.created_at += 1

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(false)
    })
  })

  describe('SG-02: X-Only Pubkey Handling', () => {
    it('should correctly extract x-only pubkey', () => {
      // Compressed pubkey is 33 bytes (prefix + x-coordinate)
      const xOnlyPubkey = getXOnlyPubkey(keypair.publicKeyBytes)

      // Should be 64 hex chars (32 bytes)
      expect(xOnlyPubkey.length).toBe(64)

      // Should be valid hex
      expect(/^[0-9a-f]{64}$/.test(xOnlyPubkey)).toBe(true)
    })
  })

  describe('SG-03: Signature Non-Malleability', () => {
    it('should reject modified signature', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Modify one byte of signature
      const sigBytes = hexToUint8Array(event.sig)
      sigBytes[0] ^= 0xff
      event.sig = uint8ArrayToHex(sigBytes)

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(false)
    })
  })

  describe('SG-04: Event ID Binding', () => {
    it('should reject signature from different event', async () => {
      const event1 = await createSignedNostrEvent({
        kind: 30053,
        content: 'event 1',
        tags: [['d', 'test-1'], ['app', 'hypermark']],
      }, keypair)

      const event2 = await createSignedNostrEvent({
        kind: 30053,
        content: 'event 2',
        tags: [['d', 'test-2'], ['app', 'hypermark']],
      }, keypair)

      // Use event1's signature on event2
      event2.sig = event1.sig

      const isValid = await verifyNostrEventSignature(event2)
      expect(isValid).toBe(false)
    })
  })
})

// =============================================================================
// Privacy Preservation Tests (PP-*)
// =============================================================================

describe('Privacy Preservation', () => {
  let lek, keypair

  beforeEach(async () => {
    lek = await generateLEK()
    keypair = await deriveNostrKeypair(lek)
  })

  describe('PP-01: No Plaintext in Events', () => {
    it('should not contain plaintext URL in encrypted content', async () => {
      const secretUrl = 'https://secret-website.example.com/private-page'
      const bookmarkData = JSON.stringify({ url: secretUrl, title: 'Secret' })

      // Encrypt the data
      const plaintext = new TextEncoder().encode(bookmarkData)
      const { ciphertext, iv } = await encryptData(lek, plaintext)

      // Format as event content
      const content = `${arrayBufferToBase64(iv.buffer)}:${arrayBufferToBase64(ciphertext)}`

      // Verify URL is not in content
      expect(content.includes(secretUrl)).toBe(false)
      expect(content.includes('secret')).toBe(false)
    })
  })

  describe('PP-02: Encrypted Content Structure', () => {
    it('should produce correct encrypted format', async () => {
      const plaintext = new TextEncoder().encode('test data')
      const { ciphertext, iv } = await encryptData(lek, plaintext)

      // IV should be 12 bytes
      expect(iv.length).toBe(12)

      // Ciphertext should be longer than plaintext (includes auth tag)
      expect(ciphertext.byteLength).toBeGreaterThan(plaintext.length)

      // Format check
      const content = `${arrayBufferToBase64(iv.buffer)}:${arrayBufferToBase64(ciphertext)}`
      expect(content.split(':').length).toBe(2)
    })
  })

  describe('PP-03: No LEK in Events', () => {
    it('should not contain LEK material in signed events', async () => {
      const lekRaw = await exportLEK(lek)
      const lekHex = uint8ArrayToHex(new Uint8Array(lekRaw))

      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test content',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Check no field contains LEK
      const eventJson = JSON.stringify(event)
      expect(eventJson.includes(lekHex)).toBe(false)
    })
  })

  describe('PP-04: No Private Key in Events', () => {
    it('should not contain private key in events', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      const eventJson = JSON.stringify(event)
      expect(eventJson.includes(keypair.privateKeyHex)).toBe(false)
    })
  })
})

// =============================================================================
// Input Validation Tests (IV-*)
// =============================================================================

describe('Input Validation', () => {
  describe('Hex Conversion', () => {
    it('should handle valid hex strings', () => {
      const original = new Uint8Array([0, 127, 255, 16, 32])
      const hex = uint8ArrayToHex(original)
      const converted = hexToUint8Array(hex)

      expect(converted).toEqual(original)
    })

    it('should throw on odd-length hex', () => {
      expect(() => hexToUint8Array('abc')).toThrow()
    })
  })

  describe('Content Size Limits', () => {
    it('should reject content over 100KB', () => {
      const largeContent = 'x'.repeat(101 * 1024)
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [],
        content: largeContent,
        sig: 'c'.repeat(128),
      }

      const result = validateEventContentSize(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.CONTENT_TOO_LARGE)
    })
  })

  describe('Tag Count Limits', () => {
    it('should reject events with too many tags', () => {
      const manyTags = Array(101).fill(['t', 'tag'])
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'b'.repeat(64),
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: manyTags,
        content: '',
        sig: 'c'.repeat(128),
      }

      const result = validateEventTags(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.INVALID_TAGS)
    })
  })
})

// =============================================================================
// Malicious Relay Defense Tests (MR-*)
// =============================================================================

describe('Malicious Relay Defense', () => {
  let lek, keypair

  beforeEach(async () => {
    lek = await generateLEK()
    keypair = await deriveNostrKeypair(lek)
  })

  describe('MR-01: Signature Verification Enforcement', () => {
    it('should reject event with invalid signature', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Replace signature with random invalid signature
      event.sig = 'd'.repeat(128)

      const result = await validateNostrEvent(event)
      expect(result.valid).toBe(false)
      expect(result.error).toBe(VALIDATION_ERRORS.INVALID_SIGNATURE)
    })
  })

  describe('MR-02: Foreign Pubkey Events', () => {
    it('should fail signature verification for mismatched pubkey', async () => {
      // Create event claiming to be from different pubkey
      const event = {
        id: 'a'.repeat(64),
        pubkey: 'e'.repeat(64), // Different pubkey
        created_at: Math.floor(Date.now() / 1000),
        kind: 30053,
        tags: [['d', 'test-id'], ['app', 'hypermark']],
        content: 'test:test',
        sig: 'f'.repeat(128), // Invalid signature
      }

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(false)
    })
  })

  describe('MR-03: Event ID Verification', () => {
    it('should reject event with wrong ID', async () => {
      const event = await createSignedNostrEvent({
        kind: 30053,
        content: 'test',
        tags: [['d', 'test-id'], ['app', 'hypermark']],
      }, keypair)

      // Change ID to wrong value
      event.id = 'a'.repeat(64)

      const isValid = await verifyNostrEventSignature(event)
      expect(isValid).toBe(false)
    })
  })
})
