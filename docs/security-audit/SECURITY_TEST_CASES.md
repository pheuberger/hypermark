# Security Test Cases

This document defines security test cases for the Hypermark Nostr sync implementation. These tests should be executed as part of security audit validation.

## Table of Contents

1. [Key Derivation Security Tests](#key-derivation-security-tests)
2. [Encryption Implementation Tests](#encryption-implementation-tests)
3. [Event Validation Security Tests](#event-validation-security-tests)
4. [Replay Attack Protection Tests](#replay-attack-protection-tests)
5. [Malicious Relay Defense Tests](#malicious-relay-defense-tests)
6. [Privacy Preservation Tests](#privacy-preservation-tests)
7. [Signature Security Tests](#signature-security-tests)
8. [Input Validation Tests](#input-validation-tests)

---

## Key Derivation Security Tests

### KD-01: HKDF Domain Separation
**Objective:** Verify that different HKDF contexts produce different keys.
**Steps:**
1. Derive Nostr seed from LEK with salt="nostr-keypair", info="hypermark-v1"
2. Derive another key from same LEK with different salt/info
3. Verify the derived values are completely different
**Expected Result:** Different salt/info must produce cryptographically independent keys.
**Code Location:** `src/services/nostr-crypto.js:deriveNostrSeed()`

### KD-02: Deterministic Derivation
**Objective:** Verify same LEK always produces identical Nostr keypair.
**Steps:**
1. Generate LEK
2. Derive Nostr keypair 100 times
3. Verify all derivations produce identical results
**Expected Result:** 100% consistency across all derivations.
**Code Location:** `src/services/nostr-crypto.js:deriveNostrKeypair()`

### KD-03: secp256k1 Curve Order Validation
**Objective:** Verify seed validation rejects invalid curve values.
**Steps:**
1. Test with seed = 0 (all zeros)
2. Test with seed = curve order n
3. Test with seed = curve order n + 1
4. Test with seed = 2^256 - 1 (all ones)
**Expected Result:** All invalid seeds must be rejected.
**Code Location:** `src/services/nostr-crypto.js:isValidSecp256k1Seed()`

### KD-04: LEK Non-Extractability Check
**Objective:** Verify non-extractable LEKs cannot be exported.
**Steps:**
1. Import LEK with extractable=false
2. Attempt to call deriveNostrSeed()
3. Verify meaningful error is thrown
**Expected Result:** Clear error message about extractability requirement.
**Code Location:** `src/services/nostr-crypto.js:deriveNostrSeed()`

### KD-05: Cache Invalidation on LEK Change
**Objective:** Verify cached keypairs are invalidated when LEK changes.
**Steps:**
1. Derive keypair with LEK A (gets cached)
2. Derive keypair with LEK B
3. Verify LEK B produces different keypair
4. Verify cache correctly stores LEK B keypair
**Expected Result:** LEK change must invalidate cache and produce new keypair.
**Code Location:** `src/services/nostr-crypto.js:deriveNostrKeypairCached()`

---

## Encryption Implementation Tests

### EN-01: IV Uniqueness
**Objective:** Verify each encryption uses a unique IV.
**Steps:**
1. Encrypt same plaintext 1000 times with same key
2. Collect all IVs
3. Verify all IVs are unique
**Expected Result:** No IV reuse (collision probability < 2^-64).
**Code Location:** `src/services/crypto.js:encryptData()`

### EN-02: Ciphertext Integrity
**Objective:** Verify AES-GCM detects tampering.
**Steps:**
1. Encrypt data
2. Flip one bit in ciphertext
3. Attempt decryption
**Expected Result:** Decryption must fail with authentication error.
**Code Location:** `src/services/crypto.js:decryptData()`

### EN-03: IV Tampering Detection
**Objective:** Verify IV modification causes decryption failure.
**Steps:**
1. Encrypt data
2. Modify IV by one byte
3. Attempt decryption
**Expected Result:** Decryption must fail.
**Code Location:** `src/services/crypto.js:decryptData()`

### EN-04: Key Mismatch Detection
**Objective:** Verify wrong key cannot decrypt.
**Steps:**
1. Encrypt with key A
2. Attempt decrypt with key B
**Expected Result:** Decryption must fail with authentication error.
**Code Location:** `src/services/crypto.js:decryptData()`

### EN-05: Empty Content Handling
**Objective:** Verify empty content encrypts/decrypts correctly.
**Steps:**
1. Encrypt empty string
2. Decrypt result
3. Verify result is empty string
**Expected Result:** Round-trip preserves empty content.
**Code Location:** `src/services/crypto.js`

### EN-06: Large Content Handling
**Objective:** Verify large content (near 100KB limit) handles correctly.
**Steps:**
1. Generate 99KB of random data
2. Encrypt and decrypt
3. Verify round-trip integrity
**Expected Result:** Large content processed without issues.
**Code Location:** `src/services/crypto.js`

---

## Event Validation Security Tests

### EV-01: Missing Required Fields
**Objective:** Verify events with missing fields are rejected.
**Steps:**
1. Create event missing 'id' field
2. Create event missing 'pubkey' field
3. Create event missing 'sig' field
4. Create event missing 'created_at' field
5. Create event missing 'kind' field
6. Create event missing 'tags' field
7. Create event missing 'content' field
**Expected Result:** Each must be rejected with specific field error.
**Code Location:** `src/services/nostr-sync.js:validateEventStructure()`

### EV-02: Invalid Field Types
**Objective:** Verify events with wrong field types are rejected.
**Steps:**
1. Event with id as number
2. Event with pubkey as array
3. Event with created_at as string
4. Event with kind as float
5. Event with tags as object
6. Event with content as null
7. Event with sig as number
**Expected Result:** Each must be rejected with type error.
**Code Location:** `src/services/nostr-sync.js:validateEventStructure()`

### EV-03: Invalid Hex Strings
**Objective:** Verify invalid hex strings are rejected.
**Steps:**
1. Event with 63-char id (too short)
2. Event with 65-char id (too long)
3. Event with id containing 'g' (invalid hex)
4. Event with uppercase hex id
5. Same tests for pubkey and sig
**Expected Result:** All invalid hex formats rejected.
**Code Location:** `src/services/nostr-sync.js:validateEventStructure()`

### EV-04: Negative Kind Values
**Objective:** Verify negative kind values are rejected.
**Steps:**
1. Event with kind = -1
2. Event with kind = -999
**Expected Result:** Negative kinds must be rejected.
**Code Location:** `src/services/nostr-sync.js:validateEventStructure()`

### EV-05: Bookmark Event Tag Validation
**Objective:** Verify bookmark events require correct tags.
**Steps:**
1. Event kind 30053 missing 'd' tag
2. Event kind 30053 with empty 'd' tag value
3. Event kind 30053 missing 'app' tag
4. Event kind 30053 with wrong 'app' tag value
**Expected Result:** All must be rejected with missing tag error.
**Code Location:** `src/services/nostr-sync.js:validateBookmarkEvent()`

### EV-06: Encrypted Content Format
**Objective:** Verify bookmark event content format validation.
**Steps:**
1. Event with content not containing ':'
2. Event with content having 3 parts (two ':')
3. Event with non-base64 IV
4. Event with non-base64 ciphertext
**Expected Result:** All must be rejected with format error.
**Code Location:** `src/services/nostr-sync.js:validateBookmarkEvent()`

---

## Replay Attack Protection Tests

### RA-01: Future Timestamp Rejection
**Objective:** Verify events too far in future are rejected.
**Steps:**
1. Create event with created_at = now + 3601 seconds
2. Attempt validation
**Expected Result:** Event rejected with timestamp error (>1 hour drift).
**Code Location:** `src/services/nostr-sync.js:validateEventTimestamp()`

### RA-02: Ancient Timestamp Rejection
**Objective:** Verify very old events are rejected.
**Steps:**
1. Create event with created_at = 1577836799 (before min)
2. Create event with created_at = 0
3. Create event with negative timestamp
**Expected Result:** All must be rejected as too old.
**Code Location:** `src/services/nostr-sync.js:validateEventTimestamp()`

### RA-03: Acceptable Timestamp Range
**Objective:** Verify valid timestamps are accepted.
**Steps:**
1. Event with created_at = now
2. Event with created_at = now - 1 day
3. Event with created_at = now + 59 minutes
**Expected Result:** All valid timestamps accepted.
**Code Location:** `src/services/nostr-sync.js:validateEventTimestamp()`

### RA-04: Replaceable Event Ordering
**Objective:** Verify newer events replace older ones.
**Steps:**
1. Receive event A with created_at = T
2. Receive event B with created_at = T + 10 (same d-tag)
3. Verify B replaces A
4. Receive event C with created_at = T + 5 (older than B)
5. Verify C does not replace B
**Expected Result:** Latest timestamp wins for same d-tag.
**Code Location:** `src/services/nostr-sync.js:NostrSyncService`

---

## Malicious Relay Defense Tests

### MR-01: Signature Verification Enforcement
**Objective:** Verify all events have signatures verified.
**Steps:**
1. Create event with valid structure but invalid signature
2. Attempt to process event
**Expected Result:** Event rejected before any decryption/processing.
**Code Location:** `src/services/nostr-sync.js:validateNostrEvent()`

### MR-02: Foreign Pubkey Rejection
**Objective:** Verify events from unknown pubkeys are handled.
**Steps:**
1. Create valid signed event from different pubkey
2. Attempt to process as own event
**Expected Result:** Event not processed as user's bookmark.
**Code Location:** `src/services/nostr-sync.js:NostrSyncService`

### MR-03: Event ID Verification
**Objective:** Verify event ID matches event content hash.
**Steps:**
1. Create event with mismatched id (id doesn't match hash of content)
2. Attempt validation
**Expected Result:** Event rejected during signature verification.
**Code Location:** `src/services/nostr-crypto.js:verifyNostrEventSignature()`

### MR-04: Relay Response Injection
**Objective:** Verify relay cannot inject malicious responses.
**Steps:**
1. Mock relay sending EVENT message with tampered event
2. Verify signature check catches tampering
**Expected Result:** Tampered events never processed.
**Code Location:** `src/services/nostr-sync.js`

### MR-05: Content Size DoS Prevention
**Objective:** Verify oversized events are rejected early.
**Steps:**
1. Create event with 101KB content
2. Create event with 1MB content
3. Create event with 10MB content
**Expected Result:** All rejected before decryption attempt.
**Code Location:** `src/services/nostr-sync.js:validateEventContentSize()`

### MR-06: Tag Count DoS Prevention
**Objective:** Verify excessive tags are rejected.
**Steps:**
1. Create event with 101 tags
2. Create event with 1000 tags
**Expected Result:** All rejected with tag count error.
**Code Location:** `src/services/nostr-sync.js:validateEventTags()`

---

## Privacy Preservation Tests

### PP-01: No Plaintext in Events
**Objective:** Verify bookmark data is encrypted before publishing.
**Steps:**
1. Create bookmark with URL "https://secret.example.com"
2. Capture published Nostr event
3. Search event content for "secret.example.com"
**Expected Result:** No plaintext bookmark data in event.
**Code Location:** `src/services/nostr-sync.js:NostrSyncService.publishBookmark()`

### PP-02: Encrypted Content Structure
**Objective:** Verify content is properly encrypted format.
**Steps:**
1. Capture published event
2. Verify content matches format: base64(iv):base64(ciphertext)
3. Verify IV is 12 bytes when decoded
**Expected Result:** Proper AES-GCM encrypted format.
**Code Location:** `src/services/nostr-sync.js`

### PP-03: No LEK in Published Events
**Objective:** Verify LEK material never appears in events.
**Steps:**
1. Export LEK as hex
2. Publish events
3. Search all event fields for LEK hex
**Expected Result:** LEK never appears in any event field.
**Code Location:** All publishing code

### PP-04: No Private Key in Events
**Objective:** Verify Nostr private key never in events.
**Steps:**
1. Derive Nostr keypair
2. Export private key as hex
3. Search all published events for private key
**Expected Result:** Private key never appears anywhere.
**Code Location:** All publishing code

---

## Signature Security Tests

### SG-01: Schnorr Signature Verification
**Objective:** Verify BIP-340 Schnorr signatures are correctly verified.
**Steps:**
1. Create and sign event with valid keypair
2. Verify signature succeeds
3. Modify any event field
4. Verify signature fails
**Expected Result:** Signature verification is robust.
**Code Location:** `src/services/nostr-crypto.js:verifyNostrEventSignature()`

### SG-02: X-Only Pubkey Handling
**Objective:** Verify x-only pubkey format is handled correctly.
**Steps:**
1. Generate secp256k1 keypair
2. Extract x-only pubkey (32 bytes, no prefix)
3. Use for signing and verification
**Expected Result:** X-only format works correctly.
**Code Location:** `src/services/nostr-crypto.js:getXOnlyPubkey()`

### SG-03: Signature Non-Malleability
**Objective:** Verify signatures cannot be modified while remaining valid.
**Steps:**
1. Create signed event
2. Attempt to modify signature bytes
3. Verify modified signature is invalid
**Expected Result:** Any signature modification invalidates it.
**Code Location:** `src/services/nostr-crypto.js`

### SG-04: Event ID Binding
**Objective:** Verify signature binds to event ID (hash of content).
**Steps:**
1. Create two events with same content but different IDs
2. Copy signature from event 1 to event 2
3. Verify event 2 signature fails
**Expected Result:** Signature only valid for specific event ID.
**Code Location:** `src/services/nostr-crypto.js:signNostrEvent()`

---

## Input Validation Tests

### IV-01: Unicode Content Handling
**Objective:** Verify Unicode content is handled correctly.
**Steps:**
1. Create bookmark with emoji in title: "📚 Reading List"
2. Create bookmark with CJK characters: "书签管理"
3. Create bookmark with RTL text
4. Encrypt, publish, fetch, decrypt
**Expected Result:** All Unicode preserved through round-trip.
**Code Location:** `src/services/crypto.js`, `src/services/nostr-sync.js`

### IV-02: Special Characters in URLs
**Objective:** Verify special URL characters handled correctly.
**Steps:**
1. URL with query params: "https://example.com?a=1&b=2"
2. URL with fragment: "https://example.com#section"
3. URL with unicode: "https://example.com/文章"
4. URL with encoded spaces: "https://example.com/my%20file"
**Expected Result:** All URLs preserved exactly.
**Code Location:** Bookmark creation and sync

### IV-03: Null Byte Handling
**Objective:** Verify null bytes don't cause issues.
**Steps:**
1. Attempt bookmark with title containing \x00
2. Verify proper handling (rejection or sanitization)
**Expected Result:** No crashes or security issues.
**Code Location:** Input handling

### IV-04: JSON Injection in Tags
**Objective:** Verify JSON special characters in tags don't break parsing.
**Steps:**
1. Bookmark tag: `{"malicious": true}`
2. Bookmark tag: `", "injected": "`
3. Verify tags are properly escaped in events
**Expected Result:** Tags stored/retrieved as literal strings.
**Code Location:** Event creation and parsing

---

## Test Execution Checklist

| Test ID | Category | Priority | Automated | Manual | Status |
|---------|----------|----------|-----------|--------|--------|
| KD-01 | Key Derivation | HIGH | Yes | - | - |
| KD-02 | Key Derivation | HIGH | Yes | - | - |
| KD-03 | Key Derivation | HIGH | Yes | - | - |
| KD-04 | Key Derivation | MEDIUM | Yes | - | - |
| KD-05 | Key Derivation | MEDIUM | Yes | - | - |
| EN-01 | Encryption | HIGH | Yes | - | - |
| EN-02 | Encryption | HIGH | Yes | - | - |
| EN-03 | Encryption | HIGH | Yes | - | - |
| EN-04 | Encryption | HIGH | Yes | - | - |
| EN-05 | Encryption | LOW | Yes | - | - |
| EN-06 | Encryption | MEDIUM | Yes | - | - |
| EV-01 | Validation | HIGH | Yes | - | - |
| EV-02 | Validation | HIGH | Yes | - | - |
| EV-03 | Validation | HIGH | Yes | - | - |
| EV-04 | Validation | MEDIUM | Yes | - | - |
| EV-05 | Validation | HIGH | Yes | - | - |
| EV-06 | Validation | HIGH | Yes | - | - |
| RA-01 | Replay | HIGH | Yes | - | - |
| RA-02 | Replay | HIGH | Yes | - | - |
| RA-03 | Replay | MEDIUM | Yes | - | - |
| RA-04 | Replay | HIGH | Yes | - | - |
| MR-01 | Relay Defense | CRITICAL | Yes | - | - |
| MR-02 | Relay Defense | HIGH | Yes | - | - |
| MR-03 | Relay Defense | HIGH | Yes | - | - |
| MR-04 | Relay Defense | HIGH | - | Yes | - |
| MR-05 | Relay Defense | MEDIUM | Yes | - | - |
| MR-06 | Relay Defense | MEDIUM | Yes | - | - |
| PP-01 | Privacy | CRITICAL | Yes | - | - |
| PP-02 | Privacy | HIGH | Yes | - | - |
| PP-03 | Privacy | CRITICAL | Yes | - | - |
| PP-04 | Privacy | CRITICAL | Yes | - | - |
| SG-01 | Signature | CRITICAL | Yes | - | - |
| SG-02 | Signature | HIGH | Yes | - | - |
| SG-03 | Signature | HIGH | Yes | - | - |
| SG-04 | Signature | HIGH | Yes | - | - |
| IV-01 | Input | MEDIUM | Yes | - | - |
| IV-02 | Input | MEDIUM | Yes | - | - |
| IV-03 | Input | LOW | Yes | - | - |
| IV-04 | Input | MEDIUM | Yes | - | - |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial test cases |
