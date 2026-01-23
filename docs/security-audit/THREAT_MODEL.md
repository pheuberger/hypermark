# Hypermark Nostr Sync Threat Model

This document provides a comprehensive threat model for the Hypermark Nostr sync implementation. It serves as preparation material for security auditors.

## Table of Contents

1. [System Overview](#system-overview)
2. [Assets](#assets)
3. [Trust Boundaries](#trust-boundaries)
4. [Threat Actors](#threat-actors)
5. [Attack Surface](#attack-surface)
6. [Threat Scenarios](#threat-scenarios)
7. [Mitigations](#mitigations)
8. [Risk Assessment](#risk-assessment)

---

## System Overview

Hypermark is a privacy-preserving bookmark manager that synchronizes bookmarks across devices using:
- **WebRTC P2P**: Real-time sync when devices are online simultaneously
- **Nostr Protocol**: Asynchronous sync via encrypted events on decentralized relays

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              User Devices                                │
│  ┌───────────────────┐                     ┌───────────────────┐       │
│  │   Device A        │                     │   Device B        │       │
│  │   ┌───────────┐   │                     │   ┌───────────┐   │       │
│  │   │ LEK       │   │◄───── Pairing ─────►│   │ LEK       │   │       │
│  │   └───────────┘   │     (QR Code)       │   └───────────┘   │       │
│  │        │          │                     │        │          │       │
│  │        ▼          │                     │        ▼          │       │
│  │   ┌───────────┐   │                     │   ┌───────────┐   │       │
│  │   │ Nostr     │   │                     │   │ Nostr     │   │       │
│  │   │ Keypair   │   │                     │   │ Keypair   │   │       │
│  │   └───────────┘   │                     │   └───────────┘   │       │
│  └────────┬──────────┘                     └────────┬──────────┘       │
│           │                                         │                   │
│           └────────────────┬────────────────────────┘                   │
│                            │                                            │
└────────────────────────────┼────────────────────────────────────────────┘
                             │
              ┌──────────────┼──────────────┐
              │              │              │
              ▼              ▼              ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Nostr Relay Network                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ relay.damus  │  │ nos.lol      │  │ relay.nostr  │  ...            │
│  │ .io          │  │              │  │ .band        │                  │
│  └──────────────┘  └──────────────┘  └──────────────┘                  │
│                                                                         │
│  Storage: Encrypted events only (no plaintext user data)               │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Assets

### High-Value Assets

| Asset | Description | Confidentiality | Integrity | Availability |
|-------|-------------|-----------------|-----------|--------------|
| **LEK (Ledger Encryption Key)** | AES-256 key shared across paired devices. Root of trust for all encryption. | CRITICAL | CRITICAL | HIGH |
| **Nostr Private Key** | Derived from LEK via HKDF. Used for signing events. | CRITICAL | CRITICAL | HIGH |
| **Bookmark Data** | URLs, titles, descriptions, tags stored by users. | HIGH | MEDIUM | MEDIUM |
| **Device Identity Keypair** | ECDH P-256 keypair for device pairing. | HIGH | HIGH | MEDIUM |

### Medium-Value Assets

| Asset | Description | Confidentiality | Integrity | Availability |
|-------|-------------|-----------------|-----------|--------------|
| **Yjs CRDT State** | Conflict-resolution data for bookmark merging. | MEDIUM | HIGH | MEDIUM |
| **Nostr Public Key** | Public identifier on Nostr network. | LOW | HIGH | MEDIUM |
| **Event Metadata** | Timestamps, event IDs, d-tags. | LOW | MEDIUM | LOW |

---

## Trust Boundaries

### Boundary 1: Device Local Storage
**Inside:** LEK, device keypair, plaintext bookmarks, Yjs document
**Outside:** Browser extensions, other tabs, other applications
**Protection:** Browser same-origin policy, IndexedDB isolation

### Boundary 2: Network Transport
**Inside:** Encrypted event content
**Outside:** Network observers, ISPs, relay operators
**Protection:** AES-256-GCM encryption, WSS/TLS transport

### Boundary 3: Nostr Relay Infrastructure
**Inside:** Encrypted events, signatures, public metadata
**Outside:** Relay operators, other Nostr users
**Protection:** Event content encryption, signature verification

### Boundary 4: Pairing Channel
**Inside:** LEK transfer, device public keys
**Outside:** Signaling server, network observers
**Protection:** ECDH key exchange, out-of-band verification code

---

## Threat Actors

### TA1: Passive Network Observer
- **Capability:** Intercept network traffic (WiFi, ISP level)
- **Motivation:** Mass surveillance, data collection
- **Resources:** Low to medium
- **Likelihood:** HIGH in public networks

### TA2: Malicious Relay Operator
- **Capability:** Log all events, modify relay responses, deny service
- **Motivation:** User tracking, censorship, data harvesting
- **Resources:** Medium
- **Likelihood:** MEDIUM (some relays may be adversarial)

### TA3: Active Network Attacker (MITM)
- **Capability:** Intercept and modify traffic in real-time
- **Motivation:** Targeted attack, credential theft
- **Resources:** Medium to high
- **Likelihood:** LOW for most users, MEDIUM during pairing

### TA4: Compromised Device
- **Capability:** Full access to device storage and memory
- **Motivation:** Data theft, account takeover
- **Resources:** Varies (malware to physical access)
- **Likelihood:** LOW (out of scope for this threat model)

### TA5: Malicious Nostr User
- **Capability:** Publish arbitrary Nostr events
- **Motivation:** DoS, spam, exploitation
- **Resources:** Low
- **Likelihood:** HIGH (open protocol)

---

## Attack Surface

### AS1: Nostr Event Reception
- **Entry Point:** WebSocket messages from relays
- **Data Flow:** Relay → WebSocket → Event Handler → Validation → Decryption → Yjs
- **Critical Functions:**
  - `validateNostrEvent()` - Event structure and signature validation
  - `verifyNostrEventSignature()` - Schnorr signature verification
  - `decryptData()` - AES-GCM decryption

### AS2: Key Derivation
- **Entry Point:** LEK from IndexedDB
- **Data Flow:** LEK → HKDF → Nostr Seed → secp256k1 Keypair
- **Critical Functions:**
  - `deriveNostrSeed()` - HKDF derivation
  - `generateNostrKeypair()` - secp256k1 key generation
  - `isValidSecp256k1Seed()` - Seed validation

### AS3: Device Pairing
- **Entry Point:** QR code scan, manual code entry
- **Data Flow:** QR Code → Parse → WebRTC → ECDH → LEK Transfer
- **Critical Functions:**
  - `generatePairingCode()` - Pairing code generation
  - `derivePSK()` - Pre-shared key derivation
  - `deriveSharedSecret()` - ECDH key agreement

### AS4: Event Publishing
- **Entry Point:** Bookmark changes
- **Data Flow:** Yjs Change → Encrypt → Sign → Publish to Relays
- **Critical Functions:**
  - `encryptData()` - AES-GCM encryption
  - `createSignedNostrEvent()` - Event signing
  - `publishEvent()` - Relay communication

---

## Threat Scenarios

### T1: Replay Attack (Event Reuse)
**Attack:** Attacker replays old valid events to revert bookmark state.
**Vector:** Capture and replay legitimate events.
**Impact:** Data integrity compromise, potential data loss.
**Mitigation:**
- Timestamp validation (events must be within 1 hour of current time)
- Minimum timestamp enforcement (after Jan 1, 2020)
- Parameterized replaceable events (latest timestamp wins)

### T2: Signature Forgery
**Attack:** Attacker creates events with forged signatures.
**Vector:** Cryptographic weakness or implementation flaw.
**Impact:** Arbitrary data injection, identity impersonation.
**Mitigation:**
- BIP-340 Schnorr signatures using @noble/secp256k1
- Event ID verification (SHA-256 of canonical event)
- Signature verification before any processing

### T3: Key Derivation Weakness
**Attack:** Attacker derives Nostr keypair from compromised LEK or weak derivation.
**Vector:** Weak HKDF parameters, insufficient entropy.
**Impact:** Full account compromise, ability to sign and decrypt.
**Mitigation:**
- HKDF-SHA256 with domain-separated salt and info
- 256-bit output (full secp256k1 key space)
- secp256k1 curve order validation

### T4: Malformed Event DoS
**Attack:** Attacker sends malformed events to crash or slow down client.
**Vector:** Oversized content, excessive tags, invalid structures.
**Impact:** Client crash, resource exhaustion, denial of service.
**Mitigation:**
- Content size limit: 100KB max
- Tag count limit: 100 tags max
- Strict structure validation before processing
- Type checking on all fields

### T5: Encryption Oracle
**Attack:** Attacker uses client as encryption/decryption oracle.
**Vector:** Trick client into encrypting/decrypting attacker-controlled data.
**Impact:** Key material leakage, plaintext recovery.
**Mitigation:**
- Only decrypt events from own pubkey
- Verify app tag is "hypermark"
- Validate encrypted content format before decryption

### T6: MITM During Pairing
**Attack:** Attacker intercepts pairing to steal LEK.
**Vector:** Compromised signaling server or network MITM.
**Impact:** Full account compromise.
**Mitigation:**
- Out-of-band verification code
- ECDH key exchange with ephemeral keys
- 5-minute token expiry
- Human verification of matching codes

### T7: Malicious Relay Event Injection
**Attack:** Relay injects events claiming to be from user's pubkey.
**Vector:** Compromised or malicious relay.
**Impact:** Data corruption, denial of service.
**Mitigation:**
- All events validated against user's pubkey
- Signature verification mandatory
- Multiple relay redundancy

### T8: Timing Attack on Key Operations
**Attack:** Measure timing of crypto operations to extract key material.
**Vector:** Side-channel timing analysis.
**Impact:** Key material leakage.
**Mitigation:**
- Use @noble/secp256k1 (constant-time operations)
- Web Crypto API for AES-GCM (native, timing-safe)
- No branching on secret values

### T9: Cache Poisoning
**Attack:** Poison keypair cache with incorrect data.
**Vector:** Memory corruption, race conditions.
**Impact:** Use of wrong keys, decryption failures.
**Mitigation:**
- Cache entries validated by LEK fingerprint
- 5-minute TTL prevents long-term poisoning
- Cache cleared on LEK rotation

### T10: Event ID Collision
**Attack:** Create event with same ID as legitimate event.
**Vector:** SHA-256 collision (computationally infeasible) or protocol confusion.
**Impact:** Event replacement, data loss.
**Mitigation:**
- Event ID computed from all event fields
- Signature verification binds ID to pubkey
- SHA-256 pre-image resistance

---

## Mitigations

### Cryptographic Mitigations

| Mitigation | Implementation | Location |
|------------|----------------|----------|
| AES-256-GCM encryption | Web Crypto API | `crypto.js:encryptData()` |
| HKDF key derivation | Web Crypto API | `nostr-crypto.js:deriveNostrSeed()` |
| Schnorr signatures | @noble/secp256k1 | `nostr-crypto.js:signNostrEvent()` |
| ECDH key exchange | Web Crypto API P-256 | `crypto.js:deriveSharedSecret()` |
| Random IV generation | `crypto.getRandomValues()` | `crypto.js:encryptData()` |

### Input Validation Mitigations

| Mitigation | Implementation | Location |
|------------|----------------|----------|
| Event structure validation | NIP-01 compliance check | `nostr-sync.js:validateEventStructure()` |
| Timestamp bounds checking | Future drift + min timestamp | `nostr-sync.js:validateEventTimestamp()` |
| Content size limiting | 100KB max | `nostr-sync.js:validateEventContentSize()` |
| Tag count limiting | 100 tags max | `nostr-sync.js:validateEventTags()` |
| Signature verification | Schnorr verify | `nostr-sync.js:validateNostrEvent()` |

### Protocol Mitigations

| Mitigation | Implementation | Location |
|------------|----------------|----------|
| Multiple relay redundancy | 5 default relays | `nostr-sync.js:DEFAULT_RELAYS` |
| Connection retry with backoff | Exponential + jitter | `nostr-sync.js:RETRY_CONFIG` |
| Debounced publishing | 1.5s batch window | `nostr-sync.js:NostrSyncService` |
| Parameterized replaceable events | Kind 30053 | Event publishing |

---

## Risk Assessment

### Risk Matrix

| Threat | Likelihood | Impact | Risk Level | Status |
|--------|------------|--------|------------|--------|
| T1: Replay Attack | MEDIUM | MEDIUM | MEDIUM | Mitigated |
| T2: Signature Forgery | LOW | CRITICAL | MEDIUM | Mitigated |
| T3: Key Derivation Weakness | LOW | CRITICAL | MEDIUM | Mitigated |
| T4: Malformed Event DoS | HIGH | LOW | MEDIUM | Mitigated |
| T5: Encryption Oracle | LOW | HIGH | MEDIUM | Mitigated |
| T6: MITM During Pairing | MEDIUM | CRITICAL | HIGH | Mitigated |
| T7: Relay Event Injection | MEDIUM | MEDIUM | MEDIUM | Mitigated |
| T8: Timing Attack | LOW | HIGH | LOW | Mitigated |
| T9: Cache Poisoning | LOW | MEDIUM | LOW | Mitigated |
| T10: Event ID Collision | VERY LOW | HIGH | LOW | Mitigated |

### Residual Risks

1. **Metadata Leakage**: Relay operators can observe event timing, sizes, and pubkeys. Accepted for MVP.
2. **Device Compromise**: Out of scope - if device is compromised, all bets are off.
3. **Quantum Computing**: secp256k1 and AES-256 will need migration in ~10+ years.

---

## Audit Recommendations

### Priority 1: Critical Path Review
1. Review HKDF key derivation implementation
2. Verify Schnorr signature implementation
3. Audit AES-GCM encryption/decryption
4. Review event validation logic

### Priority 2: Integration Points
1. Audit LEK storage and retrieval
2. Review pairing protocol implementation
3. Verify relay communication security
4. Check Yjs integration for data leakage

### Priority 3: Edge Cases
1. Test malformed event handling
2. Verify behavior under network failures
3. Check cache invalidation correctness
4. Review error handling for crypto failures

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial threat model |
