# Security-Critical Code Paths

This document maps all security-critical code paths in the Hypermark Nostr sync implementation. Each path is documented with file locations, line numbers (approximate), data flow, and security considerations.

## Table of Contents

1. [Key Derivation Path](#key-derivation-path)
2. [Event Encryption Path](#event-encryption-path)
3. [Event Decryption Path](#event-decryption-path)
4. [Event Signing Path](#event-signing-path)
5. [Event Verification Path](#event-verification-path)
6. [Pairing Protocol Path](#pairing-protocol-path)
7. [Event Validation Path](#event-validation-path)
8. [Relay Communication Path](#relay-communication-path)

---

## Key Derivation Path

### Overview
Derives Nostr keypair from LEK (Ledger Encryption Key) for signing/verifying events.

### Data Flow Diagram
```
LEK (CryptoKey)
       │
       ▼
┌──────────────────────┐
│ deriveNostrSeed()    │  nostr-crypto.js
│ - Export LEK to raw  │
│ - HKDF-SHA256        │
│ - Salt: "nostr-keypair"
│ - Info: "hypermark-v1"
└──────────┬───────────┘
           │
           ▼
    32-byte Seed (Uint8Array)
           │
           ▼
┌──────────────────────┐
│ generateNostrKeypair()│  nostr-crypto.js
│ - Validate seed      │
│ - secp256k1 pubkey   │
└──────────┬───────────┘
           │
           ▼
NostrKeypair {
  privateKeyBytes,
  privateKeyHex,
  publicKeyBytes,
  publicKeyHex
}
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `deriveNostrSeed()` | `src/services/nostr-crypto.js` | 95-150 |
| `generateNostrKeypair()` | `src/services/nostr-crypto.js` | 278-312 |
| `isValidSecp256k1Seed()` | `src/services/nostr-crypto.js` | 224-254 |
| `deriveNostrKeypairCached()` | `src/services/nostr-crypto.js` | 513-548 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| LEK extractability | `deriveNostrSeed():107-114` | Must be extractable |
| HKDF parameters | `deriveNostrSeed():130-139` | Salt/info domain separation |
| Seed validation | `isValidSecp256k1Seed()` | Non-zero, < curve order |
| Cache integrity | `deriveNostrKeypairCached()` | LEK fingerprint matching |

### Security Properties
- **Deterministic**: Same LEK always produces same keypair
- **Domain-separated**: Different salt/info than other derivations
- **Validated**: Seed checked against secp256k1 constraints

---

## Event Encryption Path

### Overview
Encrypts bookmark data before publishing to Nostr relays.

### Data Flow Diagram
```
Bookmark Data (JSON string)
           │
           ▼
┌──────────────────────┐
│ TextEncoder.encode() │
└──────────┬───────────┘
           │
           ▼
    Plaintext (ArrayBuffer)
           │
           ▼
┌──────────────────────┐
│ encryptData()        │  crypto.js
│ - Generate random IV │
│ - AES-256-GCM        │
└──────────┬───────────┘
           │
           ▼
{ ciphertext: ArrayBuffer, iv: Uint8Array }
           │
           ▼
┌──────────────────────┐
│ arrayBufferToBase64()│  (both parts)
└──────────┬───────────┘
           │
           ▼
"base64(iv):base64(ciphertext)"
           │
           ▼
    Event Content (string)
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `encryptData()` | `src/services/crypto.js` | 183-203 |
| `arrayBufferToBase64()` | `src/services/crypto.js` | 270-277 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| IV generation | `encryptData():185` | crypto.getRandomValues |
| IV length | `encryptData():185` | 12 bytes (96 bits) |
| Key algorithm | `encryptData():196` | AES-GCM |

### Security Properties
- **Random IV**: Each encryption uses unique random IV
- **Authenticated**: GCM provides integrity via auth tag
- **No plaintext leakage**: Original data not visible in output

---

## Event Decryption Path

### Overview
Decrypts received events from Nostr relays.

### Data Flow Diagram
```
Event Content: "base64(iv):base64(ciphertext)"
           │
           ▼
┌──────────────────────┐
│ content.split(':')   │
└──────────┬───────────┘
           │
           ▼
┌──────────────────────┐
│ base64ToArrayBuffer()│  (both parts)
└──────────┬───────────┘
           │
           ▼
{ ciphertext: ArrayBuffer, iv: Uint8Array }
           │
           ▼
┌──────────────────────┐
│ decryptData()        │  crypto.js
│ - AES-256-GCM        │
│ - Verify auth tag    │
└──────────┬───────────┘
           │
           ▼
    Plaintext (ArrayBuffer)
           │
           ▼
┌──────────────────────┐
│ TextDecoder.decode() │
└──────────┬───────────┘
           │
           ▼
Bookmark Data (JSON string)
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `decryptData()` | `src/services/crypto.js` | 213-231 |
| `base64ToArrayBuffer()` | `src/services/crypto.js` | 284-291 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| Auth tag verification | `decryptData():224` | Implicit in GCM |
| Base64 format | Content validation | Format check before decrypt |

### Security Properties
- **Authenticated decryption**: Tampering detected before plaintext returned
- **Fails safely**: Invalid ciphertext throws, no partial decryption

---

## Event Signing Path

### Overview
Signs Nostr events with derived private key.

### Data Flow Diagram
```
Event Fields {pubkey, created_at, kind, tags, content}
           │
           ▼
┌──────────────────────┐
│ computeEventId()     │  nostr-crypto.js
│ - Serialize [0,pubkey,created_at,kind,tags,content]
│ - SHA-256 hash       │
└──────────┬───────────┘
           │
           ▼
    Event ID (32 bytes hex)
           │
           ▼
┌──────────────────────┐
│ signNostrEvent()     │  nostr-crypto.js
│ - Validate private key
│ - secp256k1.schnorr.signAsync
│ - BIP-340 Schnorr    │
└──────────┬───────────┘
           │
           ▼
Complete Signed Event {id, pubkey, created_at, kind, tags, content, sig}
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `computeEventId()` | `src/services/nostr-crypto.js` | 605-624 |
| `signNostrEvent()` | `src/services/nostr-crypto.js` | 636-667 |
| `createSignedNostrEvent()` | `src/services/nostr-crypto.js` | 731-748 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| Key validation | `signNostrEvent():645` | isValidSecp256k1Seed |
| Serialization | `computeEventId():609-616` | NIP-01 canonical format |
| X-only pubkey | `createSignedNostrEvent():737` | Strip prefix from compressed |

### Security Properties
- **Canonical serialization**: Deterministic event ID
- **Key bound**: Signature only valid with matching pubkey
- **Non-malleable**: BIP-340 Schnorr signatures

---

## Event Verification Path

### Overview
Verifies incoming events from relays.

### Data Flow Diagram
```
Incoming Event {id, pubkey, created_at, kind, tags, content, sig}
           │
           ▼
┌──────────────────────┐
│ verifyNostrEventSignature() │  nostr-crypto.js
│ 1. Check required fields    │
│ 2. Recompute event ID       │
│ 3. Compare computed vs provided ID
│ 4. Verify Schnorr signature │
└──────────┬───────────┘
           │
           ▼
    Boolean: true (valid) / false (invalid)
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `verifyNostrEventSignature()` | `src/services/nostr-crypto.js` | 678-715 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| Required fields | `:683-685` | All fields present |
| ID verification | `:688-699` | Recompute and compare |
| Signature verification | `:703-708` | schnorr.verifyAsync |

### Security Properties
- **ID binding**: ID must match hash of event fields
- **Signature binding**: Signature verified against pubkey
- **Fail-safe**: Any error returns false

---

## Pairing Protocol Path

### Overview
Secure key exchange during device pairing.

### Data Flow Diagram
```
Device A (Existing)                    Device B (New)
       │                                    │
       │ generatePairingCode()              │
       ├──────────────────────────────────►│
       │  Room + Words (out-of-band)        │
       │                                    │
       │                           derivePSK()
       │                           PBKDF2-SHA256
       │◄──────────────────────────────────┤
       │  PSK-encrypted signaling           │
       │                                    │
       │ generateEphemeralKeypair()         │ generateEphemeralKeypair()
       │                                    │
       │◄──────────────────────────────────►│
       │  Exchange public keys              │
       │                                    │
       │ deriveSharedSecret()               │ deriveSharedSecret()
       │ ECDH P-256                         │ ECDH P-256
       │                                    │
       │ deriveSessionKey()                 │ deriveSessionKey()
       │ HKDF → AES-256-GCM                 │ HKDF → AES-256-GCM
       │                                    │
       │────────────────────────────────────►│
       │  LEK encrypted with session key    │
       │                                    │
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `generatePairingCode()` | `src/services/pairing-code.js` | ~30-60 |
| `derivePSK()` | `src/services/pairing-code.js` | ~70-100 |
| `generateEphemeralKeypair()` | `src/services/crypto.js` | 46-66 |
| `deriveSharedSecret()` | `src/services/crypto.js` | 114-132 |
| `deriveSessionKey()` | `src/services/crypto.js` | 141-174 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| PSK entropy | `generatePairingCode()` | ~28 bits from room+words |
| PBKDF2 iterations | `derivePSK()` | 100,000 iterations |
| Ephemeral keys | `generateEphemeralKeypair()` | Fresh keys per session |
| Session key | `deriveSessionKey()` | Non-extractable |

### Security Properties
- **Forward secrecy**: Ephemeral keys for each pairing
- **Out-of-band verification**: Pairing code not sent over network
- **Key stretching**: PBKDF2 protects low-entropy pairing code

---

## Event Validation Path

### Overview
Validates event structure and content before processing.

### Data Flow Diagram
```
Incoming Event
       │
       ▼
┌──────────────────────┐
│ validateNostrEvent() │  nostr-sync.js
└──────────┬───────────┘
           │
           ├───► validateEventStructure()
           │     - Required fields
           │     - Field types
           │     - Hex formats
           │
           ├───► validateEventTimestamp()
           │     - Not too future (1 hour)
           │     - Not too old (Jan 2020)
           │
           ├───► validateEventTags()
           │     - Tag count limit (100)
           │     - Tag format (array of strings)
           │
           ├───► validateEventContentSize()
           │     - Content < 100KB
           │
           ├───► verifyNostrEventSignature()
           │     - Schnorr verification
           │
           └───► validateBookmarkEvent() [if kind 30053]
                 - 'd' tag present
                 - 'app' tag = 'hypermark'
                 - Encrypted format
                       │
                       ▼
               ValidationResult {valid, error, message}
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `validateNostrEvent()` | `src/services/nostr-sync.js` | 481-524 |
| `validateEventStructure()` | `src/services/nostr-sync.js` | 163-248 |
| `validateEventTimestamp()` | `src/services/nostr-sync.js` | 260-282 |
| `validateEventTags()` | `src/services/nostr-sync.js` | 295-336 |
| `validateEventContentSize()` | `src/services/nostr-sync.js` | 346-358 |
| `validateBookmarkEvent()` | `src/services/nostr-sync.js` | 371-424 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| Structure | `validateEventStructure()` | All NIP-01 requirements |
| Timestamp bounds | `validateEventTimestamp()` | Future/past limits |
| DoS prevention | `validateEventTags/ContentSize()` | Size limits |
| Signature | `validateNostrEvent():501-510` | Must verify |
| App-specific | `validateBookmarkEvent()` | Hypermark requirements |

### Security Properties
- **Defense in depth**: Multiple validation layers
- **Fail-fast**: First failure stops processing
- **Categorized errors**: Specific error types for debugging

---

## Relay Communication Path

### Overview
WebSocket communication with Nostr relays.

### Data Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────────┐
│                        NostrSyncService                                  │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  Publishing:                                                            │
│  ┌─────────────────┐                                                   │
│  │ publishEvent()  │                                                   │
│  │ 1. Encrypt data │                                                   │
│  │ 2. Sign event   │                                                   │
│  │ 3. Send to all  │──────► ["EVENT", signedEvent]                    │
│  │    connected    │        WSS to each relay                          │
│  │    relays       │                                                   │
│  └─────────────────┘                                                   │
│                                                                         │
│  Receiving:                                                            │
│  ┌─────────────────┐                                                   │
│  │ handleMessage() │◄────── ["EVENT", subId, event]                   │
│  │ 1. Parse JSON   │        from relay                                │
│  │ 2. Validate     │                                                   │
│  │ 3. Verify sig   │                                                   │
│  │ 4. Decrypt      │                                                   │
│  │ 5. Apply to Yjs │                                                   │
│  └─────────────────┘                                                   │
│                                                                         │
│  Connection:                                                            │
│  ┌─────────────────┐                                                   │
│  │ connectToRelay()│                                                   │
│  │ - WSS only      │                                                   │
│  │ - Retry backoff │                                                   │
│  │ - Multi-relay   │                                                   │
│  └─────────────────┘                                                   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

### File Locations

| Function | File | Lines (approx) |
|----------|------|----------------|
| `NostrSyncService` class | `src/services/nostr-sync.js` | ~560-1800 |
| `connectToRelay()` | `src/services/nostr-sync.js` | ~600-700 |
| `publishEvent()` | `src/services/nostr-sync.js` | ~800-900 |
| `handleMessage()` | `src/services/nostr-sync.js` | ~1000-1200 |

### Security Checkpoints

| Checkpoint | Location | Validation |
|------------|----------|------------|
| Transport | `connectToRelay()` | WSS (TLS) only |
| JSON parsing | `handleMessage()` | Try-catch for parse errors |
| Event validation | `handleMessage()` | Full validateNostrEvent |
| Decryption | `handleMessage()` | Only decrypt own events |

### Security Properties
- **TLS transport**: All relay connections use WSS
- **Multi-relay**: Redundancy prevents single relay compromise
- **Retry backoff**: Prevents hammering failed relays
- **Validation before processing**: Never trust relay data

---

## Audit Navigation

### Quick Reference by Security Concern

| Concern | Primary Files | Key Functions |
|---------|---------------|---------------|
| Key material handling | `nostr-crypto.js`, `crypto.js` | `deriveNostrSeed`, `generateLEK` |
| Encryption | `crypto.js` | `encryptData`, `decryptData` |
| Signatures | `nostr-crypto.js` | `signNostrEvent`, `verifyNostrEventSignature` |
| Input validation | `nostr-sync.js` | `validateNostrEvent`, `validate*` functions |
| Pairing | `crypto.js`, `pairing-code.js` | `deriveSessionKey`, `derivePSK` |
| Relay communication | `nostr-sync.js` | `NostrSyncService` class |

### Files to Review (Priority Order)

1. **CRITICAL**: `src/services/nostr-crypto.js` - All cryptographic operations
2. **CRITICAL**: `src/services/crypto.js` - Encryption, key management
3. **HIGH**: `src/services/nostr-sync.js` - Validation, relay communication
4. **HIGH**: `src/services/pairing-code.js` - Pairing protocol
5. **MEDIUM**: `src/services/key-storage.js` - Key persistence
6. **MEDIUM**: `src/hooks/useNostrSync.js` - Service integration

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial code path documentation |
