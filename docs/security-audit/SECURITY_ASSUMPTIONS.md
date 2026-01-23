# Security Assumptions Document

This document enumerates all security assumptions made in the Hypermark Nostr sync implementation. Security auditors should validate these assumptions and assess their appropriateness.

## Table of Contents

1. [Cryptographic Assumptions](#cryptographic-assumptions)
2. [Platform Assumptions](#platform-assumptions)
3. [Protocol Assumptions](#protocol-assumptions)
4. [Trust Model Assumptions](#trust-model-assumptions)
5. [Operational Assumptions](#operational-assumptions)
6. [Threat Model Assumptions](#threat-model-assumptions)
7. [Dependency Assumptions](#dependency-assumptions)
8. [Assumption Validation Checklist](#assumption-validation-checklist)

---

## Cryptographic Assumptions

### CA-01: AES-256-GCM Security
**Assumption:** AES-256-GCM provides 256-bit security for confidentiality and 128-bit security for authentication.

**Basis:** NIST SP 800-38D, widely accepted standard.

**Dependencies:**
- No weaknesses discovered in AES-256
- GCM mode correctly implemented in Web Crypto API
- IV never reused with same key

**Risk if Invalid:** Complete loss of confidentiality and/or integrity.

---

### CA-02: HKDF-SHA256 Security
**Assumption:** HKDF-SHA256 is a secure key derivation function that produces cryptographically independent keys when different salt/info parameters are used.

**Basis:** RFC 5869, proven construction from HMAC.

**Dependencies:**
- SHA-256 pre-image and collision resistance holds
- Salt and info provide sufficient domain separation

**Risk if Invalid:** Key material from one context usable in another.

---

### CA-03: secp256k1 Schnorr Security
**Assumption:** Schnorr signatures over secp256k1 (BIP-340) provide existential unforgeability under chosen message attack (EUF-CMA).

**Basis:** BIP-340 specification, well-studied construction.

**Dependencies:**
- Discrete logarithm problem hard on secp256k1
- @noble/secp256k1 correctly implements BIP-340

**Risk if Invalid:** Signature forgery, identity impersonation.

---

### CA-04: ECDH P-256 Security
**Assumption:** ECDH on P-256 (NIST curve) provides ~128-bit security for key agreement.

**Basis:** NIST FIPS 186-4, well-studied curve.

**Dependencies:**
- Discrete logarithm problem hard on P-256
- Web Crypto API correctly implements ECDH

**Risk if Invalid:** Pairing session key compromise.

---

### CA-05: SHA-256 Security
**Assumption:** SHA-256 provides 256-bit pre-image resistance, 256-bit second pre-image resistance, and 128-bit collision resistance.

**Basis:** NIST FIPS 180-4, extensively analyzed.

**Dependencies:**
- No cryptanalytic breakthroughs discovered

**Risk if Invalid:** Event ID collision, signature forgery.

---

### CA-06: CSPRNG Quality
**Assumption:** `crypto.getRandomValues()` provides cryptographically secure random numbers.

**Basis:** Web Crypto specification, OS-level entropy sources.

**Dependencies:**
- Browser correctly implements CSPRNG
- Sufficient system entropy available

**Risk if Invalid:** Predictable IVs, weak keys.

---

### CA-07: IV Non-Reuse
**Assumption:** 96-bit random IVs have negligible collision probability for expected usage volumes.

**Basis:** Birthday bound calculation.

**Calculation:**
- IV space: 2^96
- Expected encryptions: < 2^32 per key
- Collision probability: < 2^-32

**Risk if Invalid:** Complete loss of confidentiality (GCM catastrophically fails on IV reuse).

---

## Platform Assumptions

### PA-01: Web Crypto API Correctness
**Assumption:** The browser's Web Crypto API correctly implements all specified cryptographic algorithms.

**Basis:** Browser vendors follow specifications, extensive testing.

**Dependencies:**
- Major browser vendors (Chrome, Firefox, Safari)
- Regular security updates applied

**Risk if Invalid:** Cryptographic failures, implementation bugs exploitable.

---

### PA-02: Same-Origin Policy Enforcement
**Assumption:** Browser same-origin policy prevents other origins from accessing Hypermark's IndexedDB data.

**Basis:** Fundamental web security model.

**Dependencies:**
- No browser vulnerabilities bypassing SOP
- User doesn't install malicious extensions with storage access

**Risk if Invalid:** Key theft, data exfiltration.

---

### PA-03: IndexedDB Isolation
**Assumption:** IndexedDB storage is isolated per origin and inaccessible to other websites or applications.

**Basis:** Web platform security model.

**Dependencies:**
- Browser correctly enforces storage isolation
- No cross-origin storage vulnerabilities

**Risk if Invalid:** Key theft from other origins.

---

### PA-04: Memory Protection
**Assumption:** Browser provides basic memory isolation between tabs and origins.

**Basis:** Process isolation in modern browsers.

**Dependencies:**
- Site isolation enabled
- No memory disclosure vulnerabilities

**Risk if Invalid:** Key material readable by other origins.

---

### PA-05: Secure Key Storage
**Assumption:** CryptoKey objects stored in IndexedDB cannot be exported if created with `extractable: false`.

**Basis:** Web Crypto API specification.

**Dependencies:**
- Browser enforces extractability constraints
- No bugs in structured clone algorithm

**Risk if Invalid:** Non-extractable keys become extractable.

---

## Protocol Assumptions

### PR-01: Nostr NIP-01 Compliance
**Assumption:** Events conforming to NIP-01 will be accepted by compliant relays and clients.

**Basis:** Nostr protocol specification.

**Dependencies:**
- Relays implement NIP-01 correctly
- Event structure matches specification

**Risk if Invalid:** Events rejected, sync fails.

---

### PR-02: Kind 30053 Replacement Semantics
**Assumption:** Relays replace parameterized replaceable events (kind 30053) with newer versions for same pubkey+d-tag.

**Basis:** Nostr NIP-33 specification.

**Dependencies:**
- Relays implement NIP-33 correctly
- d-tag correctly identifies bookmark

**Risk if Invalid:** Multiple versions accumulate, storage bloat, sync confusion.

---

### PR-03: Event Ordering by Timestamp
**Assumption:** Newer timestamps (created_at) indicate authoritative state for replaceable events.

**Basis:** Nostr protocol convention.

**Dependencies:**
- Device clocks reasonably synchronized
- No malicious timestamp manipulation

**Risk if Invalid:** Older state overwrites newer.

---

### PR-04: Relay Persistence
**Assumption:** Events published to relays persist for reasonable time (days to months).

**Basis:** Relay operator policies.

**Dependencies:**
- Multiple redundant relays
- Relays don't aggressively prune events

**Risk if Invalid:** Data loss if device offline for extended period.

---

### PR-05: Schnorr Signature Verification
**Assumption:** Relays verify Schnorr signatures before accepting events (preventing spam/forgery at relay level).

**Basis:** NIP-01 recommendation.

**Dependencies:**
- Relay implementation choice
- Some relays may not verify

**Risk if Invalid:** Spam events, but client-side verification still prevents processing.

---

## Trust Model Assumptions

### TM-01: User Device Trust
**Assumption:** User's devices are not compromised by malware.

**Basis:** Out-of-scope for this threat model.

**Rationale:** If device is compromised, all security guarantees fail. Defending against compromised devices requires hardware security modules or secure enclaves, beyond web application scope.

**Risk if Invalid:** Complete compromise of all keys and data.

---

### TM-02: Relay Untrusted for Content
**Assumption:** Relays cannot read encrypted bookmark content.

**Basis:** AES-256-GCM encryption before publishing.

**Dependencies:**
- Encryption correctly applied
- LEK not leaked

**Risk if Invalid:** Privacy loss.

---

### TM-03: Relay Untrusted for Integrity
**Assumption:** Relays cannot forge or tamper with events.

**Basis:** Schnorr signature verification.

**Dependencies:**
- All events signed and verified
- No signature forgery possible

**Risk if Invalid:** Data injection, corruption.

---

### TM-04: Pairing Out-of-Band Trust
**Assumption:** Pairing QR code or verification code is exchanged via a secure out-of-band channel (physical proximity).

**Basis:** Security protocol design.

**Dependencies:**
- User physically verifies code on both devices
- Attacker cannot observe/intercept QR code

**Risk if Invalid:** MITM during pairing, LEK theft.

---

### TM-05: User Verification
**Assumption:** Users will verify pairing codes match on both devices.

**Basis:** Protocol requires human verification step.

**Dependencies:**
- User actually checks codes
- UI clearly shows verification requirement

**Risk if Invalid:** MITM attack succeeds.

---

## Operational Assumptions

### OP-01: Clock Synchronization
**Assumption:** Device clocks are reasonably accurate (within minutes of actual time).

**Basis:** Typical device behavior with NTP.

**Dependencies:**
- Device has network time sync enabled
- Time zone correctly configured

**Risk if Invalid:** Event timestamp validation failures, sync conflicts.

---

### OP-02: Network Availability
**Assumption:** Devices periodically connect to internet to sync.

**Basis:** Application usage pattern.

**Dependencies:**
- User opens app while online
- At least one relay accessible

**Risk if Invalid:** Sync delays, but offline functionality preserved.

---

### OP-03: Browser Updates
**Assumption:** Users maintain reasonably up-to-date browsers with security patches.

**Basis:** Modern browser auto-update behavior.

**Dependencies:**
- Browser auto-update enabled
- No blocking of security updates

**Risk if Invalid:** Exploitable browser vulnerabilities.

---

### OP-04: Single Active Instance
**Assumption:** User typically has one active browser instance per device.

**Basis:** Typical usage pattern.

**Dependencies:**
- IndexedDB locking prevents corruption
- Yjs handles concurrent access

**Risk if Invalid:** Potential data corruption from concurrent access.

---

## Threat Model Assumptions

### TH-01: State-Level Attacks Out of Scope
**Assumption:** Protecting against state-level adversaries with unlimited resources is not a goal.

**Basis:** Product decision, typical consumer application.

**Rationale:** State-level attackers can compromise device, network infrastructure, or cryptographic implementations. Defending against this requires significantly more complex measures.

**Risk if Invalid:** N/A (explicit non-goal).

---

### TH-02: Traffic Analysis Not Defended
**Assumption:** Protecting against traffic analysis and metadata correlation is not a goal.

**Basis:** Product decision.

**Rationale:** Hiding metadata requires Tor, mixnets, or similar. Explicitly accepted limitation.

**Risk if Invalid:** Activity patterns observable.

---

### TH-03: Local Storage Security
**Assumption:** Device local storage (IndexedDB) provides reasonable security via OS/browser protections.

**Basis:** Platform security model.

**Dependencies:**
- Device encryption enabled
- No physical attacker access

**Risk if Invalid:** Data theft from device storage.

---

### TH-04: Side-Channel Resistance
**Assumption:** @noble/secp256k1 provides constant-time operations resistant to timing attacks.

**Basis:** Library documentation, security audits.

**Dependencies:**
- Library correctly implements constant-time
- JavaScript JIT doesn't introduce timing variations

**Risk if Invalid:** Key material extraction via timing.

---

## Dependency Assumptions

### DA-01: @noble/secp256k1 Security
**Assumption:** @noble/secp256k1 library is correctly implemented and free of vulnerabilities.

**Basis:** Library has been audited, actively maintained.

**Version:** ^2.0.0

**Verification:**
- Check npm advisory database
- Review audit reports
- Monitor GitHub security advisories

**Risk if Invalid:** Signature failures, key material leakage.

---

### DA-02: Yjs CRDT Correctness
**Assumption:** Yjs correctly implements CRDT semantics, guaranteeing eventual consistency.

**Basis:** Library well-tested, widely used.

**Dependencies:**
- No bugs in merge algorithm
- Correct state vector tracking

**Risk if Invalid:** Data loss or corruption during sync.

---

### DA-03: No Malicious Dependencies
**Assumption:** All npm dependencies are not malicious and don't contain backdoors.

**Basis:** npm security scanning, dependency review.

**Dependencies:**
- Regular `npm audit` runs
- Dependency lockfile maintained
- Supply chain security practices

**Risk if Invalid:** Complete compromise.

---

## Assumption Validation Checklist

### For Security Auditors

| ID | Assumption | Validate | Method |
|----|------------|----------|--------|
| CA-01 | AES-256-GCM | Browser implementation | Test vectors, known-answer tests |
| CA-02 | HKDF-SHA256 | Domain separation | Derive keys with different params, verify independence |
| CA-03 | secp256k1 Schnorr | Library correctness | BIP-340 test vectors |
| CA-04 | ECDH P-256 | Browser implementation | Test vectors |
| CA-05 | SHA-256 | Browser implementation | Test vectors |
| CA-06 | CSPRNG | Randomness quality | Statistical tests on output |
| CA-07 | IV Non-Reuse | Implementation | Code review, collision testing |
| PA-01 | Web Crypto | Cross-browser | Test on multiple browsers |
| PA-02 | Same-Origin | Browser security | Attempt cross-origin access |
| PA-03 | IndexedDB Isolation | Browser security | Attempt cross-origin storage access |
| PR-01 | NIP-01 | Protocol compliance | Test with multiple relays |
| PR-02 | Kind 30053 | Relay behavior | Verify replacement semantics |
| TM-03 | Signature Verification | Implementation | Tamper events, verify rejection |
| TM-04 | Pairing Security | Protocol analysis | Attempt MITM without code |
| DA-01 | noble/secp256k1 | Library audit | Review audit reports |

### Validation Results Template

```
## Assumption: [ID]

**Validation Method:** [Description]

**Test Procedure:**
1. [Step 1]
2. [Step 2]
3. [Step 3]

**Expected Result:** [What should happen]

**Actual Result:** [ ] PASS  [ ] FAIL  [ ] PARTIAL

**Notes:**
[Any observations or concerns]

**Auditor:** [Name]
**Date:** [Date]
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Security Audit Prep | Initial assumptions document |
