# Nostr Sync Implementation Roadmap

This document provides a comprehensive implementation roadmap for the Hypermark Nostr sync feature, sequencing all implementation beads into logical development phases with clear milestones and deliverables.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Phase Overview](#phase-overview)
3. [Phase 1: Outbound Sync](#phase-1-outbound-sync)
4. [Phase 2: Inbound Sync](#phase-2-inbound-sync)
5. [Phase 3: Polish and Production Readiness](#phase-3-polish-and-production-readiness)
6. [Testing Strategy](#testing-strategy)
7. [Integration Points](#integration-points)
8. [Rollout Strategy](#rollout-strategy)
9. [Risk Mitigation](#risk-mitigation)
10. [Rollback Plans](#rollback-plans)
11. [Success Criteria](#success-criteria)
12. [User Communication Plan](#user-communication-plan)

---

## Executive Summary

The Nostr sync implementation adds asynchronous bookmark synchronization to Hypermark's existing WebRTC-based real-time sync. This hybrid approach ensures bookmarks stay synchronized whether devices are online simultaneously or not.

### Key Objectives

- **Zero-setup experience**: Sync works automatically after device pairing
- **End-to-end encryption**: Only paired devices can read bookmark data
- **Conflict-free merging**: Simultaneous edits are merged without data loss
- **Graceful degradation**: App remains fully functional when sync is unavailable

### Implementation Status

All implementation beads are complete. This roadmap documents the phased approach used and serves as a guide for production deployment.

| Phase | Status | Description |
|-------|--------|-------------|
| Phase 1 | Complete | Outbound sync (publish to Nostr) |
| Phase 2 | Complete | Inbound sync (receive from Nostr) |
| Phase 3 | Complete | Polish and production readiness |

---

## Phase Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Implementation Timeline                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: OUTBOUND SYNC                                                     │
│  ═══════════════════════                                                    │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │ Key Derivation    │→ │ Event Schema      │→ │ Publishing        │       │
│  │ (lf6.1.*)         │  │ (lf6.3.*)         │  │ (lf6.2.*, lf6.4)  │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
│  PHASE 2: INBOUND SYNC                                                      │
│  ═══════════════════════                                                    │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │ Subscriptions     │→ │ CRDT Merge        │→ │ Initial Sync      │       │
│  │ (lf6.5, lf6.6)    │  │ (lf6.7, lf6.8)    │  │ (lf6.9)           │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
│  PHASE 3: POLISH & PRODUCTION                                               │
│  ═══════════════════════════════                                            │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │ UI Components     │→ │ Testing & Docs    │→ │ Security Audit    │       │
│  │ (lf6.10-12)       │  │ (lf6.14-18)       │  │ (lf6.19)          │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Outbound Sync

**Objective**: Enable publishing bookmark state changes to Nostr relays.

### Milestone 1.1: Nostr Keypair Derivation

**Beads**: `lf6.1`, `lf6.1.1`, `lf6.1.2`, `lf6.1.3`

| Task | Description | Deliverable |
|------|-------------|-------------|
| HKDF Key Derivation | Derive deterministic seed from LEK | `deriveNostrSeed()` function |
| secp256k1 Keypair Generation | Generate Nostr keypair from seed | `generateSecp256k1Keypair()` function |
| Keypair Caching | Cache derived keypair in memory | In-memory cache with LEK reference |

**Dependencies**: Existing LEK infrastructure from pairing system

**Success Criteria**:
- Same LEK always produces same Nostr keypair
- Keypair generation completes in <10ms
- No private key material persisted to storage

### Milestone 1.2: Nostr Event Schema

**Beads**: `lf6.3`, `lf6.3.1`, `lf6.3.2`, `lf6.3.3`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Event Structure | Define Kind 30053 parameterized replaceable event | Event creation functions |
| Encryption Layer | AES-256-GCM encryption of bookmark content | `encryptBookmarkContent()` function |
| Validation Schema | Input validation for event fields | `validateEventStructure()` function |
| Vector Clock Extraction | Extract Yjs state vector for sync detection | `extractVectorClock()` function |

**Dependencies**: Keypair derivation (Milestone 1.1)

**Success Criteria**:
- Events conform to NIP-01 and NIP-33 specifications
- All bookmark content is encrypted before publishing
- Validation rejects malformed events

### Milestone 1.3: Publishing Pipeline

**Beads**: `lf6.2`, `lf6.2.1`, `lf6.2.2`, `lf6.2.3`, `lf6.4`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Relay Connection | WebSocket connection management | `RelayConnection` class |
| Event Publishing | Signed event transmission to relays | `publishEvent()` function |
| Yjs Observer | Detect Yjs document changes | Observer registration in `useYjs` hook |
| Debounced Publishing | Batch rapid changes (1.5s window) | Debounce logic in `NostrSyncService` |

**Dependencies**: Event schema (Milestone 1.2)

**Success Criteria**:
- Connection to at least 3 relays maintained
- Events published within 2 seconds of debounce window
- Automatic reconnection with exponential backoff

---

## Phase 2: Inbound Sync

**Objective**: Enable receiving and merging bookmark state from Nostr relays.

### Milestone 2.1: Subscription Management

**Beads**: `lf6.5`, `lf6.6`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Yjs Observer Integration | Hook into Yjs change notification system | Observer in `NostrSyncService` |
| Nostr Subscriptions | Subscribe to Kind 30053 events for our pubkey | `subscribeToBookmarks()` function |
| Event Deduplication | Prevent processing same event multiple times | Event ID tracking |

**Dependencies**: Publishing pipeline (Milestone 1.3)

**Success Criteria**:
- Subscriptions maintained across reconnections
- Duplicate events filtered efficiently
- Subscription filters correctly scoped to user's pubkey

### Milestone 2.2: CRDT Merge Operations

**Beads**: `lf6.7`, `lf6.8`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Vector Clock Comparison | Compare local and remote state vectors | `compareVectorClocks()` function |
| CRDT Merge | Apply remote changes through Yjs | `applyRemoteBookmarkState()` function |
| Conflict Detection | Identify concurrent modifications | Conflict logging and metrics |

**Dependencies**: Subscription management (Milestone 2.1)

**Success Criteria**:
- No data loss during concurrent edits
- Deterministic merge results across devices
- All Yjs CRDT mathematical properties preserved

### Milestone 2.3: Initial Sync

**Bead**: `lf6.9`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Fetch Existing Events | Retrieve all bookmarks on new device | `fetchAllBookmarks()` function |
| Paginated Loading | Progressive loading for large collections | Batch processing with UI updates |
| Sync State Tracking | Track initial sync completion | Sync status in service state |

**Dependencies**: CRDT merge operations (Milestone 2.2)

**Success Criteria**:
- New device receives all bookmarks from relays
- UI updates progressively during sync
- Initial sync completes within 30 seconds for 1000 bookmarks

---

## Phase 3: Polish and Production Readiness

**Objective**: Add user-facing features, comprehensive testing, and security validation.

### Milestone 3.1: User Interface

**Beads**: `lf6.10`, `lf6.11`, `lf6.12`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Sync Status UI | Display connection and sync state | Status component in Settings |
| Relay Configuration | Add/remove/test custom relays | Relay management UI |
| Diagnostics Tools | Troubleshooting and debugging | Diagnostics panel |

**Dependencies**: Full sync functionality (Phase 2)

**Success Criteria**:
- Users can see sync status at a glance
- Users can configure custom relays
- Diagnostic export provides actionable information

### Milestone 3.2: Performance Optimization

**Bead**: `lf6.13`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Connection Pooling | Efficient relay connection management | Pool configuration |
| Event Batching | Optimize network requests | Batch publishing logic |
| Memory Management | Limit memory usage for large collections | Pagination and cleanup |

**Dependencies**: UI components (Milestone 3.1)

**Success Criteria**:
- Memory usage <50MB for 1000 bookmarks
- Event publish latency <500ms (single relay)
- No memory leaks detected in stress testing

### Milestone 3.3: Testing and Documentation

**Beads**: `lf6.14`, `lf6.15`, `lf6.16`, `lf6.17`, `lf6.18`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Comprehensive Testing | Unit, integration, and E2E tests | Test suites with 80%+ coverage |
| User Documentation | Sync guide for end users | `docs/sync-guide.md` |
| Architecture Documentation | Technical reference | `docs/nostr-sync-architecture.md` |
| Error Handling | Graceful degradation framework | Error handling throughout services |
| Conflict Testing | Extensive conflict scenario testing | Conflict resolution test suite |

**Dependencies**: Performance optimization (Milestone 3.2)

**Success Criteria**:
- 80% overall test coverage
- 95% coverage on security-critical code
- All documented conflict scenarios pass

### Milestone 3.4: Security Audit Preparation

**Bead**: `lf6.19`

| Task | Description | Deliverable |
|------|-------------|-------------|
| Threat Model | Document security assumptions | `docs/security-audit/THREAT_MODEL.md` |
| Security Test Cases | Manual and automated tests | `docs/security-audit/SECURITY_TEST_CASES.md` |
| Crypto Review | Cryptographic implementation analysis | `docs/security-audit/CRYPTO_REVIEW.md` |
| Pentest Scenarios | Penetration testing guidance | `docs/security-audit/PENTEST_SCENARIOS.md` |

**Dependencies**: Testing and documentation (Milestone 3.3)

**Success Criteria**:
- All security-critical code paths documented
- Automated security regression tests pass
- Pentest scenarios ready for external auditor

---

## Testing Strategy

### Test Categories

| Category | Scope | Coverage Target | Tools |
|----------|-------|-----------------|-------|
| Unit Tests | Individual functions | 80% | Vitest |
| Integration Tests | Service interactions | 70% | Vitest |
| E2E Tests | Complete user flows | Critical paths | Playwright |
| Security Tests | Crypto operations | 95% | Vitest + custom |
| Conflict Tests | CRDT merge scenarios | All documented | Custom test suite |

### Testing Throughout Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Testing Strategy                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 1: OUTBOUND SYNC                                                     │
│  ├─ Unit tests for key derivation                                          │
│  ├─ Unit tests for event creation and signing                              │
│  ├─ Integration tests for relay publishing                                 │
│  └─ Security tests for cryptographic operations                            │
│                                                                             │
│  PHASE 2: INBOUND SYNC                                                      │
│  ├─ Unit tests for event validation                                        │
│  ├─ Integration tests for subscription management                          │
│  ├─ CRDT merge property tests (commutativity, idempotency)                │
│  └─ Conflict resolution scenario tests                                     │
│                                                                             │
│  PHASE 3: POLISH & PRODUCTION                                               │
│  ├─ E2E tests for complete sync workflows                                  │
│  ├─ Performance tests (latency, memory, throughput)                        │
│  ├─ Chaos tests (network failures, relay issues)                           │
│  └─ Security regression tests                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Test Suites

| Test Suite | File | Purpose |
|------------|------|---------|
| Nostr Crypto | `nostr-crypto.test.js` | Key derivation, signing, verification |
| Nostr Sync | `nostr-sync.test.js` | Core sync service functionality |
| Sync Integration | `nostr-sync-integration.test.js` | Cross-service interactions |
| Comprehensive | `nostr-sync-comprehensive.test.js` | Full sync scenarios |
| Chaos Testing | `nostr-sync-chaos.test.js` | Network failure scenarios |
| Conflict Resolution | `sync-conflict-resolution.test.js` | CRDT merge edge cases |

---

## Integration Points

### Existing Codebase Integration

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        Integration Architecture                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  EXISTING COMPONENTS              NEW COMPONENTS                            │
│  ═══════════════════              ═══════════════                           │
│                                                                             │
│  ┌─────────────────┐             ┌─────────────────┐                       │
│  │ key-storage.js  │─────────────│ nostr-crypto.js │                       │
│  │ (LEK storage)   │  LEK fetch  │ (Key derivation)│                       │
│  └─────────────────┘             └─────────────────┘                       │
│                                           │                                 │
│  ┌─────────────────┐             ┌───────▼─────────┐                       │
│  │ crypto.js       │─────────────│ nostr-sync.js   │                       │
│  │ (AES-GCM)       │  Encrypt    │ (Sync service)  │                       │
│  └─────────────────┘             └─────────────────┘                       │
│                                           │                                 │
│  ┌─────────────────┐             ┌───────▼─────────┐                       │
│  │ useYjs.js       │─────────────│ NostrSync       │                       │
│  │ (Yjs document)  │  Observer   │ Observer        │                       │
│  └─────────────────┘             └─────────────────┘                       │
│                                           │                                 │
│  ┌─────────────────┐             ┌───────▼─────────┐                       │
│  │ Settings.jsx    │─────────────│ SyncStatus.jsx  │                       │
│  │ (Settings page) │  Include    │ (Status UI)     │                       │
│  └─────────────────┘             └─────────────────┘                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Critical Integration Points

| Integration Point | Existing Code | New Code | Notes |
|-------------------|---------------|----------|-------|
| LEK Access | `key-storage.js` | `nostr-crypto.js` | Read-only LEK access |
| Encryption | `crypto.js` | `nostr-sync.js` | Use existing AES-GCM |
| Yjs Document | `useYjs.js` | `nostr-sync.js` | Observer registration |
| UI | `Settings.jsx` | `SyncStatus.jsx` | New settings section |
| WebRTC | `y-webrtc` provider | `NostrSyncService` | Parallel sync mechanisms |

### Data Flow

```
LOCAL CHANGE FLOW:
User Edit → Yjs Document → IndexedDB (persist)
                       ↘
                         Nostr Observer → Debounce → Encrypt → Publish

REMOTE CHANGE FLOW:
Relay Event → Validate → Decrypt → Compare Vector Clock
                                 ↘
                                   Apply to Yjs → IndexedDB (persist)
                                                ↘
                                                  UI Update
```

---

## Rollout Strategy

### Phased Deployment

| Phase | Scope | Criteria for Advancement |
|-------|-------|--------------------------|
| Internal Alpha | Development team | Basic functionality verified |
| Private Beta | Selected users | No critical bugs for 1 week |
| Public Beta | Opt-in users | No critical bugs for 2 weeks |
| General Availability | All users | Stable for 1 month |

### Feature Flag Strategy

```javascript
// Feature flag configuration
const NOSTR_SYNC_CONFIG = {
  // Master switch
  enabled: false,  // Toggle for rollout phases

  // Granular controls
  outboundSyncEnabled: true,   // Publishing to relays
  inboundSyncEnabled: true,    // Receiving from relays
  diagnosticsEnabled: true,    // Diagnostics UI

  // Rate limiting (for initial rollout)
  maxPublishRate: 10,          // Events per minute
  maxRelays: 5,                // Maximum relay connections
};
```

### Monitoring During Rollout

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| Event publish success rate | >95% | <90% |
| Sync latency (P95) | <5s | >10s |
| Error rate | <1% | >5% |
| Memory usage | <50MB | >100MB |
| Active connections | 3-5 relays | <2 relays |

### Rollout Checklist

**Pre-rollout**:
- [ ] All tests passing (CI green)
- [ ] Security audit materials reviewed
- [ ] Documentation complete
- [ ] Feature flags configured
- [ ] Monitoring dashboards ready
- [ ] Rollback procedure tested

**During rollout**:
- [ ] Monitor error rates
- [ ] Check user feedback channels
- [ ] Review sync latency metrics
- [ ] Verify relay connectivity

**Post-rollout**:
- [ ] Gather user feedback
- [ ] Review performance metrics
- [ ] Document any issues encountered
- [ ] Plan improvements for next release

---

## Risk Mitigation

### Identified Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Relay availability | Medium | Medium | Multiple relay redundancy |
| Key derivation bugs | Low | Critical | Extensive unit tests, security review |
| CRDT merge issues | Low | High | Comprehensive conflict testing |
| Performance degradation | Medium | Medium | Debouncing, pagination, monitoring |
| Privacy leakage | Low | Critical | Code review, security audit |

### Risk Mitigation Strategies

#### R1: Relay Unavailability

**Mitigation**:
- Connect to 5 relays by default
- Require only 1 relay for operation
- Allow user-configured custom relays
- Automatic reconnection with backoff

**Monitoring**:
- Track relay connection count
- Alert if <2 relays connected

#### R2: Cryptographic Issues

**Mitigation**:
- Use well-tested libraries (@noble/secp256k1)
- Follow RFC standards (HKDF RFC 5869)
- Security audit preparation complete
- No custom cryptographic primitives

**Monitoring**:
- Track decryption failures
- Alert on signature verification failures

#### R3: Data Synchronization Errors

**Mitigation**:
- Yjs CRDT provides mathematical guarantees
- Extensive conflict resolution testing
- Validate all incoming events
- Log sync operations for debugging

**Monitoring**:
- Track merge conflict frequency
- Monitor vector clock drift

#### R4: Performance Issues

**Mitigation**:
- 1.5s debounce on publishing
- Paginated initial sync
- Memory-efficient event handling
- Background processing where possible

**Monitoring**:
- Track publish latency
- Monitor memory usage
- Measure initial sync time

#### R5: Privacy Concerns

**Mitigation**:
- End-to-end encryption (AES-256-GCM)
- No plaintext bookmark data on relays
- Minimal metadata exposure
- Security audit documentation

**Monitoring**:
- Verify encryption on all events
- Review relay-visible metadata

---

## Rollback Plans

### Rollback Triggers

| Condition | Action |
|-----------|--------|
| >5% error rate sustained 1 hour | Disable Nostr sync feature flag |
| Critical security vulnerability | Immediate rollback, security review |
| Data corruption detected | Disable sync, investigate, restore |
| Performance degradation >3x | Reduce publish rate, investigate |

### Rollback Procedure

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          Rollback Procedure                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. DISABLE FEATURE FLAG                                                    │
│     ├─ Set NOSTR_SYNC_CONFIG.enabled = false                               │
│     ├─ Gracefully disconnect from relays                                   │
│     └─ Stop all Nostr observers                                            │
│                                                                             │
│  2. PRESERVE LOCAL DATA                                                     │
│     ├─ Local IndexedDB data is unaffected                                  │
│     ├─ WebRTC sync continues to function                                   │
│     └─ No user data loss expected                                          │
│                                                                             │
│  3. NOTIFY USERS                                                            │
│     ├─ In-app notification about sync status                               │
│     └─ Status page update (if applicable)                                  │
│                                                                             │
│  4. INVESTIGATE                                                             │
│     ├─ Review error logs                                                   │
│     ├─ Analyze affected events                                             │
│     └─ Identify root cause                                                 │
│                                                                             │
│  5. FIX AND REDEPLOY                                                        │
│     ├─ Implement fix                                                       │
│     ├─ Test thoroughly                                                     │
│     └─ Gradual re-enablement                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Data Recovery

**Local data**:
- IndexedDB persistence is independent of Nostr sync
- Yjs document maintains local state
- WebRTC sync provides alternative sync path

**Remote data**:
- Events on relays are preserved
- Re-fetching possible after fix deployment
- No automatic deletion of relay events

### Partial Rollback Options

| Option | Effect | Use Case |
|--------|--------|----------|
| Disable outbound only | No publishing, still receive | Publishing issues |
| Disable inbound only | Publish, don't receive | Merge issues |
| Reduce relay count | Fewer connections | Connectivity issues |
| Increase debounce | Less frequent publishing | Rate limiting |

---

## Success Criteria

### Phase 1 Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Keypair derivation | <10ms | Performance test |
| Event signing | <50ms | Performance test |
| Relay connection | 3+ relays | Integration test |
| Event publishing | <500ms | E2E test |
| Test coverage | >80% | Coverage report |

### Phase 2 Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| Event reception | <2s from publish | E2E test |
| Conflict resolution | 100% scenarios pass | Conflict test suite |
| Initial sync (100 bookmarks) | <5s | Performance test |
| Initial sync (1000 bookmarks) | <30s | Performance test |
| No data loss | 0 lost bookmarks | Integration test |

### Phase 3 Success Criteria

| Criterion | Target | Measurement |
|-----------|--------|-------------|
| User documentation | Complete | Review checklist |
| Security audit prep | All materials ready | Audit checklist |
| E2E tests | Critical paths covered | Test suite |
| Performance | <50MB memory | Memory profiling |
| Error handling | Graceful degradation | Chaos testing |

### Production Readiness Checklist

**Functionality**:
- [ ] Outbound sync working (publish to relays)
- [ ] Inbound sync working (receive from relays)
- [ ] Initial sync on new device working
- [ ] Conflict resolution preserves all data
- [ ] UI shows accurate sync status

**Performance**:
- [ ] Publish latency <500ms (single relay)
- [ ] Initial sync <30s for 1000 bookmarks
- [ ] Memory usage <50MB for 1000 bookmarks
- [ ] No memory leaks in stress testing

**Security**:
- [ ] All bookmark content encrypted
- [ ] Event signatures validated
- [ ] No private key material in logs
- [ ] Security audit materials complete

**Reliability**:
- [ ] Graceful handling of relay failures
- [ ] Automatic reconnection working
- [ ] Offline operation preserved
- [ ] WebRTC sync unaffected

**Documentation**:
- [ ] User sync guide complete
- [ ] Architecture documentation complete
- [ ] API documentation complete
- [ ] Troubleshooting guide available

---

## User Communication Plan

### Communication Timeline

| Phase | Communication | Channel |
|-------|---------------|---------|
| Pre-launch | Feature announcement | Blog, changelog |
| Beta launch | Opt-in invitation | In-app notification |
| GA launch | Feature available | Release notes, in-app |
| Post-launch | Success stories | Blog, social |

### Key Messages

**For End Users**:
- "Your bookmarks now sync even when your devices aren't online together"
- "Same secure, private sync - now with cloud backup"
- "No account needed - works automatically after pairing"

**For Technical Users**:
- "Nostr-based decentralized sync"
- "End-to-end encrypted with your existing LEK"
- "Self-host your own relay for complete control"

### Documentation Deliverables

| Document | Audience | Location |
|----------|----------|----------|
| Sync Guide | End users | `docs/sync-guide.md` |
| Architecture | Developers | `docs/nostr-sync-architecture.md` |
| Security Materials | Auditors | `docs/security-audit/` |
| Troubleshooting | Support | In sync guide |

### Support Preparation

**FAQ Topics**:
1. How is Nostr sync different from WebRTC sync?
2. What if a relay goes down?
3. Can I use my own relay?
4. Is my data private?
5. How do I troubleshoot sync issues?

**Support Channels**:
- In-app diagnostics and troubleshooting
- GitHub issues for bug reports
- Documentation for self-service

---

## Appendix: Bead Mapping

### Complete Bead List by Phase

**Phase 1: Outbound Sync**
| Bead ID | Title | Dependencies |
|---------|-------|--------------|
| lf6.1 | nostr-keypair-derivation | - |
| lf6.1.1 | hkdf-key-derivation | lf6.1 |
| lf6.1.2 | secp256k1-keypair-generation | lf6.1.1 |
| lf6.1.3 | keypair-caching-strategy | lf6.1.2 |
| lf6.3 | nostr-event-schema | lf6.1 |
| lf6.3.1 | encryption-decryption-layer | lf6.3 |
| lf6.3.2 | event-validation-schema | lf6.3.1 |
| lf6.3.3 | yjs-vector-clock-extraction | lf6.3.2 |
| lf6.2 | nostr-sync-service-foundation | lf6.1, lf6.3 |
| lf6.2.1 | relay-connection-management | lf6.2 |
| lf6.2.2 | event-publishing-pipeline | lf6.2.1 |
| lf6.2.3 | event-subscription-management | lf6.2.2 |
| lf6.4 | bookmark-state-publishing | lf6.2, lf6.3 |

**Phase 2: Inbound Sync**
| Bead ID | Title | Dependencies |
|---------|-------|--------------|
| lf6.5 | yjs-observer-integration | lf6.4 |
| lf6.6 | nostr-subscription-service | lf6.5 |
| lf6.7 | vector-clock-comparison | lf6.6 |
| lf6.8 | crdt-merge-operations | lf6.7 |
| lf6.9 | initial-sync-mechanism | lf6.8 |

**Phase 3: Polish and Production**
| Bead ID | Title | Dependencies |
|---------|-------|--------------|
| lf6.10 | sync-status-ui | lf6.9 |
| lf6.11 | relay-configuration-ui | lf6.10 |
| lf6.12 | sync-diagnostics-tools | lf6.11 |
| lf6.13 | performance-optimizations | lf6.12 |
| lf6.14 | comprehensive-testing | lf6.13 |
| lf6.15 | user-documentation | lf6.14 |
| lf6.16 | implementation-architecture | lf6 |
| lf6.17 | error-handling-framework | lf6.14 |
| lf6.18 | sync-conflict-resolution-testing | lf6.8, lf6.17 |
| lf6.19 | security-audit-preparation | lf6.1, lf6.3, lf6.17 |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Implementation Team | Initial comprehensive roadmap |
