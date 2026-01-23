# Security Audit Preparation Materials

This directory contains comprehensive security audit preparation materials for the Hypermark Nostr sync implementation.

## Quick Links

| Document | Description |
|----------|-------------|
| [Threat Model](./THREAT_MODEL.md) | Comprehensive threat model with attack scenarios |
| [Security Test Cases](./SECURITY_TEST_CASES.md) | Manual and automated test cases |
| [Pentest Scenarios](./PENTEST_SCENARIOS.md) | Penetration testing scenarios |
| [Crypto Review](./CRYPTO_REVIEW.md) | Cryptographic implementation analysis |
| [Security Assumptions](./SECURITY_ASSUMPTIONS.md) | Documented security assumptions |
| [Critical Code Paths](./CRITICAL_CODE_PATHS.md) | Security-critical code path mapping |

## Implementation Overview

Hypermark implements end-to-end encrypted bookmark synchronization using:
- **Nostr Protocol**: Decentralized relay network for async sync
- **WebRTC P2P**: Real-time sync when devices online together
- **Yjs CRDT**: Conflict-free replication data types

## Security Architecture Summary

### Encryption
- **Symmetric**: AES-256-GCM for bookmark content encryption
- **Key Derivation**: HKDF-SHA256 for all key derivation
- **Signatures**: BIP-340 Schnorr over secp256k1

### Key Hierarchy
```
LEK (Ledger Encryption Key)
├── Nostr Keypair (HKDF: salt="nostr-keypair", info="hypermark-v1")
├── Yjs Password (HKDF: salt=zeros, info="hypermark-yjs-room-password-v1")
└── Bookmark Encryption (direct AES-GCM)
```

### Trust Model
- **Defending Against**: Passive eavesdropping, malicious relays, MITM during pairing
- **Not Defending Against**: Device compromise, state-level attacks, traffic analysis

## Key Files for Review

| Priority | File | Description |
|----------|------|-------------|
| CRITICAL | `src/services/nostr-crypto.js` | Key derivation, signing, verification |
| CRITICAL | `src/services/crypto.js` | AES-GCM encryption, ECDH |
| HIGH | `src/services/nostr-sync.js` | Event validation, relay communication |
| HIGH | `src/services/pairing-code.js` | Pairing protocol |
| MEDIUM | `src/services/key-storage.js` | Key persistence |

## Running Security Tests

```bash
# Run all security audit tests
npm test src/services/security-audit.test.js

# Run with coverage
npm test -- --coverage src/services/security-audit.test.js
```

## Audit Checklist

### Pre-Audit Verification
- [ ] All documentation in this directory reviewed
- [ ] Source code access confirmed
- [ ] Test environment setup complete
- [ ] Local Nostr relay available for testing

### Priority 1: Cryptographic Implementation
- [ ] HKDF key derivation (`nostr-crypto.js:deriveNostrSeed`)
- [ ] Schnorr signatures (`nostr-crypto.js:signNostrEvent`)
- [ ] Signature verification (`nostr-crypto.js:verifyNostrEventSignature`)
- [ ] AES-GCM encryption (`crypto.js:encryptData`)
- [ ] secp256k1 seed validation (`nostr-crypto.js:isValidSecp256k1Seed`)

### Priority 2: Input Validation
- [ ] Event structure validation (`nostr-sync.js:validateEventStructure`)
- [ ] Timestamp validation (`nostr-sync.js:validateEventTimestamp`)
- [ ] Content size limits (`nostr-sync.js:validateEventContentSize`)
- [ ] Tag validation (`nostr-sync.js:validateEventTags`)

### Priority 3: Protocol Security
- [ ] Pairing protocol review
- [ ] Relay communication security
- [ ] Key storage security
- [ ] Cache invalidation logic

## Contact

For questions about this security audit preparation, please contact the development team.

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial security audit materials |
