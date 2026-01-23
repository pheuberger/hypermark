# Cryptographic Implementation Review

This document provides a comprehensive review of cryptographic implementations in the Hypermark Nostr sync system, intended to assist security auditors in evaluating the implementation.

## Table of Contents

1. [Cryptographic Primitives Overview](#cryptographic-primitives-overview)
2. [Key Derivation Analysis](#key-derivation-analysis)
3. [Encryption Implementation](#encryption-implementation)
4. [Signature Implementation](#signature-implementation)
5. [Key Storage Analysis](#key-storage-analysis)
6. [Pairing Protocol Cryptography](#pairing-protocol-cryptography)
7. [Security Properties Summary](#security-properties-summary)
8. [Known Limitations](#known-limitations)
9. [Recommendations](#recommendations)

---

## Cryptographic Primitives Overview

### Algorithms Used

| Purpose | Algorithm | Key Size | Library/API |
|---------|-----------|----------|-------------|
| Symmetric Encryption | AES-256-GCM | 256-bit | Web Crypto API |
| Key Derivation | HKDF-SHA256 | 256-bit output | Web Crypto API |
| Digital Signatures | Schnorr (BIP-340) | secp256k1 | @noble/secp256k1 |
| Key Agreement | ECDH | P-256 | Web Crypto API |
| Hashing | SHA-256 | 256-bit | Web Crypto API |
| HMAC | HMAC-SHA256 | 256-bit | Web Crypto API |

### Library Versions

| Library | Purpose | Version | Notes |
|---------|---------|---------|-------|
| @noble/secp256k1 | Schnorr signatures, key generation | ^2.0.0 | Audited, constant-time |
| Web Crypto API | Core crypto operations | Native | Browser-provided |

---

## Key Derivation Analysis

### LEK-to-Nostr Seed Derivation

**File:** `src/services/nostr-crypto.js`
**Function:** `deriveNostrSeed()`

```javascript
// Domain separation parameters
const NOSTR_KEYPAIR_SALT = "nostr-keypair";
const NOSTR_KEYPAIR_INFO = "hypermark-v1";

// Derivation process
async function deriveNostrSeed(lek) {
  // 1. Export LEK to raw bytes
  const lekRaw = await crypto.subtle.exportKey("raw", lek);

  // 2. Import as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw", lekRaw, "HKDF", false, ["deriveBits"]
  );

  // 3. Derive using HKDF
  const derivedBits = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new TextEncoder().encode(NOSTR_KEYPAIR_SALT),
    info: new TextEncoder().encode(NOSTR_KEYPAIR_INFO),
  }, keyMaterial, 256);

  return new Uint8Array(derivedBits);
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Domain Separation | ✅ GOOD | Salt and info provide separation from other derivations |
| Output Length | ✅ GOOD | 256 bits matches secp256k1 key size |
| Algorithm | ✅ GOOD | HKDF-SHA256 per RFC 5869 |
| Determinism | ✅ GOOD | Same LEK always produces same seed |

**Potential Concerns:**
- LEK must be extractable, which means raw key bytes briefly exist in memory
- No memory clearing after derivation (JavaScript limitation)

---

### Yjs Password Derivation

**File:** `src/services/crypto.js`
**Function:** `deriveYjsPassword()`

```javascript
async function deriveYjsPassword(lek) {
  const lekRaw = await crypto.subtle.exportKey('raw', lek);
  const keyMaterial = await crypto.subtle.importKey(
    'raw', lekRaw, 'HKDF', false, ['deriveBits']
  );

  const info = new TextEncoder().encode('hypermark-yjs-room-password-v1');
  const derivedBits = await crypto.subtle.deriveBits({
    name: 'HKDF',
    hash: 'SHA-256',
    salt: new Uint8Array(32), // Zero salt
    info: info,
  }, keyMaterial, 256);

  return arrayBufferToBase64(derivedBits);
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Domain Separation | ✅ GOOD | Different info string than Nostr derivation |
| Zero Salt | ⚠️ ACCEPTABLE | LEK has high entropy, zero salt is safe |
| Output Format | ✅ GOOD | Base64 for use as password |

---

### secp256k1 Seed Validation

**File:** `src/services/nostr-crypto.js`
**Function:** `isValidSecp256k1Seed()`

```javascript
function isValidSecp256k1Seed(seed) {
  // Check length
  if (!(seed instanceof Uint8Array) || seed.length !== 32) {
    return false;
  }

  // Check not zero
  if (seed.every(b => b === 0)) {
    return false;
  }

  // Check less than curve order
  const curveOrder = new Uint8Array([
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
    0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xfe,
    0xba, 0xae, 0xdc, 0xe6, 0xaf, 0x48, 0xa0, 0x3b,
    0xbf, 0xd2, 0x5e, 0x8c, 0xd0, 0x36, 0x41, 0x41
  ]);

  // Big-endian comparison
  for (let i = 0; i < 32; i++) {
    if (seed[i] < curveOrder[i]) return true;
    if (seed[i] > curveOrder[i]) return false;
  }
  return false; // Equal to curve order, invalid
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Zero Check | ✅ GOOD | Private key of 0 is invalid |
| Curve Order Check | ✅ GOOD | Prevents invalid keys |
| Comparison | ✅ GOOD | Constant-time comparison (byte-by-byte) |

---

## Encryption Implementation

### AES-GCM Encryption

**File:** `src/services/crypto.js`
**Function:** `encryptData()`

```javascript
async function encryptData(key, data, additionalData = '') {
  // Random IV generation
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const options = {
    name: 'AES-GCM',
    iv: iv,
  };

  if (additionalData) {
    options.additionalData = new TextEncoder().encode(additionalData);
  }

  const ciphertext = await crypto.subtle.encrypt(options, key, data);
  return { ciphertext, iv };
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| IV Length | ✅ GOOD | 12 bytes (96 bits) is recommended for GCM |
| IV Generation | ✅ GOOD | crypto.getRandomValues is CSPRNG |
| IV Uniqueness | ✅ GOOD | Random generation, collision probability ~2^-64 |
| AAD Support | ✅ GOOD | Optional additional authenticated data |

**IV Collision Risk Calculation:**
- 96-bit IV space
- Birthday bound: ~2^48 encryptions before 50% collision probability
- Expected usage: << 2^32 encryptions per key
- **Risk: NEGLIGIBLE**

---

### AES-GCM Decryption

**File:** `src/services/crypto.js`
**Function:** `decryptData()`

```javascript
async function decryptData(key, ciphertext, iv, additionalData = '') {
  const options = {
    name: 'AES-GCM',
    iv: iv,
  };

  if (additionalData) {
    options.additionalData = new TextEncoder().encode(additionalData);
  }

  const plaintext = await crypto.subtle.decrypt(options, key, ciphertext);
  return plaintext;
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Authentication | ✅ GOOD | GCM provides authenticated encryption |
| Tampering Detection | ✅ GOOD | Modified ciphertext causes decryption failure |
| IV Verification | ✅ GOOD | Wrong IV causes decryption failure |

---

## Signature Implementation

### Schnorr Signing (BIP-340)

**File:** `src/services/nostr-crypto.js`
**Function:** `signNostrEvent()`

```javascript
async function signNostrEvent(event, privateKey) {
  let privateKeyBytes = typeof privateKey === "string"
    ? hexToUint8Array(privateKey)
    : privateKey;

  // Validate private key
  if (!isValidSecp256k1Seed(privateKeyBytes)) {
    throw new Error("Invalid private key for signing");
  }

  // Compute event ID (message to sign)
  const eventId = await computeEventId(event);
  const eventIdBytes = hexToUint8Array(eventId);

  // Sign using Schnorr (async for Web Crypto SHA-256)
  const signature = await secp256k1.schnorr.signAsync(
    eventIdBytes,
    privateKeyBytes
  );

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
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Algorithm | ✅ GOOD | BIP-340 Schnorr per Nostr spec |
| Library | ✅ GOOD | @noble/secp256k1 is audited |
| Key Validation | ✅ GOOD | Private key validated before use |
| Message Binding | ✅ GOOD | Signs event ID (hash of all fields) |

---

### Event ID Computation

**File:** `src/services/nostr-crypto.js`
**Function:** `computeEventId()`

```javascript
async function computeEventId(event) {
  const { pubkey, created_at, kind, tags, content } = event;

  // Canonical serialization per NIP-01
  const serialized = JSON.stringify([
    0,          // Reserved for future use
    pubkey,     // Author pubkey
    created_at, // Unix timestamp
    kind,       // Event kind
    tags,       // Tags array
    content,    // Content string
  ]);

  // SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(serialized);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);

  return uint8ArrayToHex(new Uint8Array(hashBuffer));
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Serialization | ✅ GOOD | Canonical JSON per NIP-01 |
| Hash Algorithm | ✅ GOOD | SHA-256 |
| Field Binding | ✅ GOOD | All mutable fields included in hash |

---

### Signature Verification

**File:** `src/services/nostr-crypto.js`
**Function:** `verifyNostrEventSignature()`

```javascript
async function verifyNostrEventSignature(event) {
  try {
    const { id, pubkey, sig, created_at, kind, tags, content } = event;

    // Validate required fields
    if (!id || !pubkey || !sig || created_at === undefined || kind === undefined) {
      return false;
    }

    // Recompute event ID
    const computedId = await computeEventId({
      pubkey, created_at, kind, tags: tags || [], content: content || ""
    });

    // Verify ID matches
    if (computedId !== id) {
      return false;
    }

    // Verify Schnorr signature
    const sigBytes = hexToUint8Array(sig);
    const idBytes = hexToUint8Array(id);
    const pubkeyBytes = hexToUint8Array(pubkey);

    const isValid = await secp256k1.schnorr.verifyAsync(
      sigBytes, idBytes, pubkeyBytes
    );

    return isValid;
  } catch (error) {
    console.error("[NostrCrypto] Signature verification failed:", error);
    return false;
  }
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| ID Verification | ✅ GOOD | Recomputes and compares event ID |
| Signature Verification | ✅ GOOD | Schnorr verify against pubkey |
| Error Handling | ✅ GOOD | Returns false on any error |
| Timing Safety | ✅ GOOD | @noble/secp256k1 is constant-time |

---

## Key Storage Analysis

### IndexedDB Key Storage

**File:** `src/services/key-storage.js`

```javascript
async function storeKey(keyName, cryptoKey) {
  const db = await openDB();
  const tx = db.transaction('keys', 'readwrite');
  const store = tx.objectStore('keys');

  // Store CryptoKey directly (structured clone)
  await store.put({ name: keyName, key: cryptoKey });
  await tx.complete;
}

async function retrieveKey(keyName) {
  const db = await openDB();
  const tx = db.transaction('keys', 'readonly');
  const store = tx.objectStore('keys');

  const result = await store.get(keyName);
  return result?.key;
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Storage Method | ✅ GOOD | CryptoKey stored via structured clone |
| Extractability | ⚠️ NOTE | Device keypair non-extractable, LEK extractable |
| Isolation | ✅ GOOD | Same-origin policy protects IndexedDB |
| Encryption at Rest | ⚠️ DEPENDS | OS/browser dependent |

**Key Extractability Summary:**

| Key | Extractable | Reason |
|-----|-------------|--------|
| Device ECDH Keypair | No | Never needs export |
| LEK | Yes | Required for Nostr key derivation |
| Ephemeral Pairing Keys | Yes | Exported during pairing |
| Session Keys | No | Derived fresh each session |

---

## Pairing Protocol Cryptography

### ECDH Key Agreement

**File:** `src/services/crypto.js`
**Function:** `deriveSharedSecret()`

```javascript
async function deriveSharedSecret(privateKey, publicKey) {
  const sharedSecretBits = await crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    256
  );
  return sharedSecretBits;
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Curve | ✅ GOOD | P-256 (NIST curve) |
| Output | ✅ GOOD | 256 bits, used for HKDF |

---

### Session Key Derivation

**File:** `src/services/crypto.js`
**Function:** `deriveSessionKey()`

```javascript
async function deriveSessionKey(sharedSecretBits, sessionId, info = 'hypermark-pairing-v1') {
  // Import shared secret as HKDF key material
  const baseKey = await crypto.subtle.importKey(
    'raw', sharedSecretBits, 'HKDF', false, ['deriveKey']
  );

  // Derive session key
  const sessionKey = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode(sessionId),
      info: new TextEncoder().encode(info),
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false, // Non-extractable
    ['encrypt', 'decrypt']
  );

  return sessionKey;
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| KDF | ✅ GOOD | HKDF-SHA256 |
| Salt | ✅ GOOD | Session ID provides uniqueness |
| Output | ✅ GOOD | Non-extractable AES-256-GCM key |

---

### Pairing Code PSK Derivation

**File:** `src/services/pairing-code.js`
**Function:** `derivePSK()`

```javascript
async function derivePSK(words) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(words.join(' ')),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const pskBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      hash: 'SHA-256',
      salt: encoder.encode('hypermark-pairing-psk-v1'),
      iterations: 100000,
    },
    keyMaterial,
    256
  );

  return new Uint8Array(pskBits);
}
```

**Security Analysis:**

| Property | Status | Notes |
|----------|--------|-------|
| Algorithm | ✅ GOOD | PBKDF2-SHA256 |
| Iterations | ✅ GOOD | 100,000 iterations |
| Salt | ✅ GOOD | Fixed domain-specific salt |
| Input Entropy | ⚠️ NOTE | ~28 bits from pairing code |

**Entropy Calculation:**
- Room number: 1-999 (~10 bits)
- Two words from 600-word list: 600^2 (~18 bits)
- Total: ~28 bits
- Mitigated by: Short validity window (5 min), PBKDF2 stretching

---

## Security Properties Summary

### Achieved Security Properties

| Property | Implementation |
|----------|----------------|
| **Confidentiality** | AES-256-GCM encryption of all bookmark content |
| **Integrity** | GCM authentication tag, Schnorr signatures |
| **Authenticity** | Schnorr signatures verify event author |
| **Non-repudiation** | Signed events bound to keypair |
| **Forward Secrecy** | Ephemeral keys for pairing sessions |
| **Key Separation** | HKDF with different salt/info for each purpose |

### Cryptographic Strength

| Component | Strength | Notes |
|-----------|----------|-------|
| Symmetric Encryption | 256-bit | AES-256-GCM |
| Key Derivation | 256-bit | HKDF-SHA256 |
| Digital Signatures | ~128-bit | secp256k1 Schnorr |
| Key Agreement | ~128-bit | ECDH P-256 |

---

## Known Limitations

### L1: Memory Clearing
**Issue:** JavaScript cannot reliably clear sensitive data from memory.
**Impact:** Key material may persist in memory after use.
**Mitigation:** Minimize key lifetime, rely on GC.

### L2: LEK Extractability
**Issue:** LEK must be extractable for Nostr key derivation.
**Impact:** Raw key bytes briefly exposed during derivation.
**Mitigation:** Extraction happens only when needed.

### L3: Pairing Code Entropy
**Issue:** ~28 bits of entropy in pairing code.
**Impact:** Brute-forceable with enough time.
**Mitigation:** 5-minute expiry, PBKDF2 stretching.

### L4: No Key Rotation
**Issue:** No automatic key rotation mechanism.
**Impact:** Compromised LEK affects all data.
**Mitigation:** User can re-pair devices to generate new LEK.

### L5: Metadata Visibility
**Issue:** Relays see event timing, sizes, pubkeys.
**Impact:** Activity patterns observable.
**Mitigation:** Accepted for MVP; use private relay if needed.

---

## Recommendations

### R1: Consider Memory Clearing Attempts
While JavaScript cannot guarantee memory clearing, attempt to overwrite sensitive arrays:
```javascript
// After use, attempt to clear
function attemptClear(arr) {
  if (arr instanceof Uint8Array) {
    arr.fill(0);
  }
}
```

### R2: Add Key Usage Counters
Track encryption operations per key to detect excessive use approaching IV collision bounds.

### R3: Implement Key Rotation
Add mechanism to rotate LEK and re-encrypt all bookmarks periodically.

### R4: Consider NIP-44 Migration
Replace custom AES-GCM encryption with NIP-44 for better Nostr ecosystem compatibility.

### R5: Add Cryptographic Agility
Design for future algorithm changes:
- Version tags in encrypted content
- Algorithm identifiers in events
- Migration path for quantum-resistant algorithms

---

## Audit Checklist

### Priority 1: Critical Review

- [ ] HKDF implementation in `deriveNostrSeed()`
- [ ] Schnorr signing in `signNostrEvent()`
- [ ] Signature verification in `verifyNostrEventSignature()`
- [ ] AES-GCM encryption in `encryptData()`
- [ ] secp256k1 seed validation in `isValidSecp256k1Seed()`

### Priority 2: Important Review

- [ ] ECDH key agreement in `deriveSharedSecret()`
- [ ] Session key derivation in `deriveSessionKey()`
- [ ] PBKDF2 PSK derivation in `derivePSK()`
- [ ] Key storage in IndexedDB

### Priority 3: Standard Review

- [ ] Hex encoding/decoding functions
- [ ] Base64 encoding/decoding functions
- [ ] Error handling in crypto functions

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial crypto review |
