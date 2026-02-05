# Nostr Sync Implementation Architecture

This document provides comprehensive architectural documentation for Hypermark's Nostr-based sync implementation. It serves as the definitive technical reference for the implementation and guides future development decisions.

## Table of Contents

1. [Overview](#overview)
2. [Architecture Evolution](#architecture-evolution)
3. [Component Architecture](#component-architecture)
4. [Key Design Decisions](#key-design-decisions)
5. [LEK-Derived Keypairs](#lek-derived-keypairs)
6. [Parameterized Replaceable Events](#parameterized-replaceable-events)
7. [Yjs CRDT Conflict Resolution](#yjs-crdt-conflict-resolution)
8. [Sync Flow Sequences](#sync-flow-sequences)
9. [Security Model](#security-model)
10. [Performance Optimizations](#performance-optimizations)
11. [Error Handling](#error-handling)
12. [Future Considerations](#future-considerations)

---

## Overview

Hypermark implements a hybrid synchronization architecture that combines:

- **WebRTC P2P Sync**: Real-time, sub-second synchronization when devices are simultaneously online
- **Nostr Cloud Sync**: Asynchronous synchronization via encrypted events stored on decentralized relays

This dual-sync approach ensures bookmarks stay synchronized whether devices are online at the same time or not, while maintaining Hypermark's core principles of privacy, decentralization, and zero-setup user experience.

### High-Level Architecture

```
┌───────────────────────────────────────────────────────────────────────┐
│                     Hypermark Multi-Device Sync                       │
└───────────────────────────────────────────────────────────────────────┘

Device A                                        Device B
┌─────────────────────────┐                    ┌─────────────────────────┐
│ Browser / PWA           │                    │ Browser / PWA           │
│                         │                    │                         │
│ ┌─────────────────────┐ │                    │ ┌─────────────────────┐ │
│ │ UI Layer (React)    │ │                    │ │ UI Layer (React)    │ │
│ └──────────┬──────────┘ │                    │ └──────────┬──────────┘ │
│            │            │                    │            │            │
│ ┌──────────▼──────────┐ │                    │ ┌──────────▼──────────┐ │
│ │ Yjs Document (CRDT) │ │                    │ │ Yjs Document (CRDT) │ │
│ └──────────┬──────────┘ │                    │ └──────────┬──────────┘ │
│            │            │                    │            │            │
│ ┌──────────┼──────────┐ │                    │ ┌──────────┼──────────┐ │
│ │ IndexedDB│ WebRTC   │ │                    │ │ IndexedDB│ WebRTC   │ │
│ │ Provider │ Provider │ │                    │ │ Provider │ Provider │ │
│ └──────────┼──────────┘ │                    │ └──────────┼──────────┘ │
│            │            │                    │            │            │
│ ┌──────────▼──────────┐ │                    │ ┌──────────▼──────────┐ │
│ │ NostrSyncService    │ │                    │ │ NostrSyncService    │ │
│ │ (1.5s debounce)     │ │                    │ │ (1.5s debounce)     │ │
│ └──────────┬──────────┘ │                    │ └──────────┬──────────┘ │
└────────────┼────────────┘                    └────────────┼────────────┘
             │                                              │
             │      ┌──────────────────────┐               │
             │      │  WebRTC P2P Channel  │               │
             └──────┤  (Real-time sync)    ├───────────────┘
                    │  Sub-second latency  │
                    └──────────────────────┘
             │                                              │
             │      ┌──────────────────────┐               │
             │      │    Nostr Relays      │               │
             └──────┤  (Async storage)     ├───────────────┘
                    │  - relay.damus.io    │
                    │  - nos.lol           │
                    │  - relay.nostr.band  │
                    │  - wellorder.net     │
                    │  - current.fyi       │
                    └──────────────────────┘
```

---

## Architecture Evolution

### Phase 1: WebRTC-Only (Original Design)

The original Hypermark sync architecture relied exclusively on WebRTC peer-to-peer connections:

```
┌─────────────────┐         ┌─────────────────┐
│ Device A        │         │ Device B        │
│                 │         │                 │
│ Yjs Document    │◄───────►│ Yjs Document    │
│      │          │ WebRTC  │      │          │
│      ▼          │         │      ▼          │
│ IndexedDB       │         │ IndexedDB       │
└─────────────────┘         └─────────────────┘
```

**Characteristics:**
- Real-time sync with sub-second latency
- Requires both devices to be online simultaneously
- Uses y-webrtc provider for Yjs integration
- Signaling server for peer discovery only

**Limitations:**
- No sync when devices are offline or on different schedules
- Mobile devices (especially iOS) have limited background connectivity
- Network conditions (NAT, firewalls) can prevent direct connections

### Phase 2: Hybrid WebRTC + Nostr (Current Design)

The hybrid architecture adds Nostr as a secondary sync mechanism:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Yjs Document (CRDT)                          │
│                           │                                     │
│            ┌──────────────┼──────────────┐                     │
│            │              │              │                     │
│            ▼              ▼              ▼                     │
│      IndexedDB       WebRTC P2P     NostrSync                  │
│    (Persistence)   (Real-time)    (Async backup)               │
└─────────────────────────────────────────────────────────────────┘
```

**Benefits:**
- WebRTC provides immediate sync when devices are online together
- Nostr provides durable storage for async sync
- Graceful degradation: either mechanism can work independently
- No single point of failure

### Why Add Nostr?

| Problem with WebRTC-Only | Nostr Solution |
|--------------------------|----------------|
| Both devices must be online | Events persist on relays indefinitely |
| NAT traversal failures | Relays provide reliable connectivity |
| No iOS background sync | Changes stored for later retrieval |
| Single network dependency | Multiple redundant relays |

---

## Component Architecture

### Core Services

```
src/services/
├── nostr-sync.js          # Core sync service (1,872 lines)
│   ├── NostrSyncService   # Main class
│   ├── Connection management
│   ├── Event publishing
│   ├── Subscription handling
│   └── Debouncing logic
│
├── nostr-crypto.js        # Cryptographic utilities (773 lines)
│   ├── deriveNostrKeypair()
│   ├── createSignedNostrEvent()
│   ├── verifyNostrEventSignature()
│   └── HKDF key derivation
│
├── nostr-diagnostics.js   # Diagnostics service (1,183 lines)
│   ├── Relay testing
│   ├── Sync history
│   └── Troubleshooting tools
│
├── sync-performance.js    # Performance optimizations
│   ├── Paginated sync
│   └── Priority-based loading
│
├── crypto.js              # Core cryptographic primitives
│   ├── LEK generation
│   ├── AES-GCM encryption
│   └── ECDH key exchange
│
└── key-storage.js         # Secure key storage
    ├── IndexedDB persistence
    └── Key retrieval
```

### Integration Points

```
src/hooks/
├── useYjs.js              # Yjs + WebRTC + Nostr integration
│   ├── Yjs document setup
│   ├── WebRTC provider connection
│   ├── Nostr observer registration
│   └── Change detection
│
└── useNostrSync.js        # React hook for Nostr sync
    ├── Service initialization
    ├── Status tracking
    └── Error handling
```

### Component Interaction Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI Layer                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │ BookmarkList │  │ Settings     │  │ SyncStatus   │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
└─────────┼─────────────────┼─────────────────┼───────────────────────────┘
          │                 │                 │
          │    ┌────────────▼────────────┐    │
          │    │      useYjs Hook        │    │
          │    │  ┌─────────────────┐    │    │
          │    │  │ Yjs Document    │    │    │
          │    │  │ (Y.Doc)         │    │    │
          │    │  └────────┬────────┘    │    │
          │    └───────────┼────────────┘    │
          │                │                  │
          ▼                ▼                  ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                          Service Layer                                   │
│                                                                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │ bookmarks.js    │   │ NostrSyncService│   │ WebRTC Provider │       │
│  │                 │   │                 │   │                 │       │
│  │ - create()      │   │ - publish()     │   │ - broadcast()   │       │
│  │ - update()      │   │ - subscribe()   │   │ - awareness     │       │
│  │ - delete()      │   │ - fetch()       │   │ - peer mgmt     │       │
│  └────────┬────────┘   └────────┬────────┘   └────────┬────────┘       │
└───────────┼─────────────────────┼─────────────────────┼─────────────────┘
            │                     │                     │
            │                     │                     │
            ▼                     ▼                     ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Storage / Network Layer                          │
│                                                                         │
│  ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐       │
│  │ IndexedDB       │   │ Nostr Relays    │   │ WebRTC Peers    │       │
│  │ (Local)         │   │ (Cloud)         │   │ (P2P)           │       │
│  └─────────────────┘   └─────────────────┘   └─────────────────┘       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Key Design Decisions

### Decision 1: LEK-Derived Keypairs (vs NIP-07 Browser Extensions)

**Problem:** The original specification required NIP-07 browser extensions for Nostr authentication. NIP-07 extensions don't exist for iOS Safari, preventing cross-platform sync.

**Decision:** Derive Nostr keypairs deterministically from the existing Ledger Encryption Key (LEK) using HKDF.

**Rationale:**
| Criterion | NIP-07 Extensions | LEK-Derived Keys |
|-----------|-------------------|------------------|
| iOS Safari support | No | Yes |
| User setup required | Yes (install extension) | None |
| Consistent identity | Per-extension | Automatic across devices |
| Security model | Trusts extension | Uses existing LEK trust |
| Implementation complexity | Medium | Low |

**See:** [LEK-Derived Keypairs](#lek-derived-keypairs)

### Decision 2: Parameterized Replaceable Events (vs Operational Events)

**Problem:** How should bookmark state be represented in Nostr events?

**Options considered:**
1. **Operational events** (Kind 1053): Store each operation (create, update, delete) as a separate event
2. **Parameterized replaceable events** (Kind 30053): Store current bookmark state, auto-replaced on updates

**Decision:** Use parameterized replaceable events (Kind 30053).

**Rationale:**
| Criterion | Operational Events | Replaceable Events |
|-----------|-------------------|-------------------|
| Bandwidth usage | High (full history) | Low (current state only) |
| Relay storage | Grows linearly | Constant per bookmark |
| Sync logic | Complex (replay history) | Simple (compare states) |
| Initial sync time | O(n operations) | O(n bookmarks) |
| Conflict resolution | Complex | Yjs handles it |

**See:** [Parameterized Replaceable Events](#parameterized-replaceable-events)

### Decision 3: Yjs CRDT Conflict Resolution (vs Last-Write-Wins)

**Problem:** How should concurrent edits from different devices be merged?

**Options considered:**
1. **Last-Write-Wins (LWW)**: Timestamp-based, simpler but loses data
2. **Yjs CRDT**: Field-level merging, preserves all changes

**Decision:** Leverage Yjs's built-in CRDT algorithms.

**Rationale:**
```
Scenario: Device A edits title, Device B adds tag (concurrent)

Last-Write-Wins result:
  → Only one change preserved (data loss!)

Yjs CRDT result:
  → Both changes preserved (title changed AND tag added)
```

**See:** [Yjs CRDT Conflict Resolution](#yjs-crdt-conflict-resolution)

### Decision 4: Debounced Publishing (vs Immediate)

**Problem:** Publishing every keystroke creates excessive network traffic.

**Decision:** Batch changes with 1.5-second debouncing.

**Rationale:**
- Rapid typing (5-10 changes) → 1 Nostr event (~80% reduction)
- Final state always published accurately
- Acceptable latency for user experience
- Prevents relay rate limiting

### Decision 5: Fixed Relay List (vs User-Configurable Only)

**Problem:** How should relay selection work?

**Decision:** Provide sensible defaults with optional user customization.

**Rationale:**
- Zero-setup experience for new users
- Power users can add custom relays
- Multiple relays provide redundancy
- Default relays chosen for reliability and geographic distribution

---

## LEK-Derived Keypairs

### The Zero-Setup Philosophy

Hypermark's core value proposition is zero-setup sync. Users pair devices via QR code, and everything "just works." Adding Nostr sync should not require additional setup steps.

### Key Derivation Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                    Initial Device Pairing                      │
│                                                                │
│  Device A                              Device B                │
│  ┌──────────────┐                     ┌──────────────┐        │
│  │ Generate LEK │                     │              │        │
│  │ (AES-256)    │                     │              │        │
│  └──────┬───────┘                     │              │        │
│         │                              │              │        │
│         │ ─────── ECDH Key Exchange ───────►         │        │
│         │                              │              │        │
│         │                     ┌───────▼────────┐    │        │
│         │                     │ Receive LEK    │    │        │
│         │                     └───────┬────────┘    │        │
│         │                              │              │        │
│  ┌──────▼───────┐              ┌──────▼───────┐    │        │
│  │ Store LEK    │              │ Store LEK    │    │        │
│  │ in IndexedDB │              │ in IndexedDB │    │        │
│  └──────────────┘              └──────────────┘    │        │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│                    Nostr Key Derivation                        │
│                                                                │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                        LEK                              │   │
│  │                    (AES-256 key)                        │   │
│  └───────────────────────────┬────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │                    HKDF-SHA256                          │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │ Salt: "nostr-keypair"                           │   │   │
│  │  │ Info: "hypermark-v1"                            │   │   │
│  │  │ Output: 256 bits                                │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  └───────────────────────────┬────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              32-byte Deterministic Seed                 │   │
│  └───────────────────────────┬────────────────────────────┘   │
│                              │                                 │
│                              ▼                                 │
│  ┌────────────────────────────────────────────────────────┐   │
│  │              secp256k1 Keypair Generation               │   │
│  │  ┌─────────────────┐    ┌─────────────────┐           │   │
│  │  │ Private Key     │    │ Public Key      │           │   │
│  │  │ (32 bytes)      │    │ (x-only, 32 b)  │           │   │
│  │  └─────────────────┘    └─────────────────┘           │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                                │
│  Same LEK → Same seed → Same keypair on ALL paired devices    │
└────────────────────────────────────────────────────────────────┘
```

### Implementation Details

**File:** `src/services/nostr-crypto.js`

```javascript
// Key derivation function
export async function deriveNostrKeypair(lek) {
  // 1. Export LEK to raw bytes
  const lekRaw = await crypto.subtle.exportKey("raw", lek);

  // 2. Import as HKDF key material
  const keyMaterial = await crypto.subtle.importKey(
    "raw", lekRaw, "HKDF", false, ["deriveBits"]
  );

  // 3. Derive seed using HKDF with domain-specific parameters
  const seed = await crypto.subtle.deriveBits({
    name: "HKDF",
    hash: "SHA-256",
    salt: new TextEncoder().encode("nostr-keypair"),
    info: new TextEncoder().encode("hypermark-v1"),
  }, keyMaterial, 256);

  // 4. Generate secp256k1 keypair from seed
  return generateSecp256k1Keypair(new Uint8Array(seed));
}
```

### Security Properties

| Property | How It's Achieved |
|----------|-------------------|
| **Deterministic** | Same LEK → same seed → same keypair |
| **Domain-separated** | HKDF salt/info prevents key reuse |
| **Standards-compliant** | Uses RFC 5869 HKDF |
| **secp256k1 compatible** | Works with Nostr's cryptographic requirements |
| **Cross-platform** | Web Crypto API works everywhere |

### Why HKDF Instead of Simple Hashing?

Simple hashing (e.g., `SHA256(LEK)`) is not suitable for key derivation:

1. **No domain separation**: Same input could be used for different purposes
2. **No key stretching**: Single hash round
3. **Not designed for KDF**: SHA-256 is a hash function, not a KDF

HKDF provides:
- Domain separation via salt and info parameters
- Proper key derivation with extract-then-expand paradigm
- RFC 5869 standardization and security proofs

---

## Parameterized Replaceable Events

### Nostr Event Kinds Background

Nostr defines several event kinds with different storage behaviors:

| Kind Range | Type | Relay Behavior |
|------------|------|----------------|
| 0-9999 | Regular | Store all events |
| 10000-19999 | Replaceable | Keep only latest per pubkey |
| 20000-29999 | Ephemeral | Don't store |
| 30000-39999 | Parameterized Replaceable | Keep only latest per pubkey+d-tag |

### Why Kind 30053?

**Parameterized replaceable events** (kind 30000-39999) have a special property: relays automatically keep only the latest event for each unique combination of:
- Author public key
- Event kind
- `d` tag value

This is perfect for bookmark state:

```javascript
// When Device A publishes a bookmark update:
{
  kind: 30053,
  pubkey: "abc123...",
  tags: [["d", "bookmark:1234567890-xyz"]],
  content: "<encrypted_state_v1>",
  created_at: 1700000001
}

// When Device A publishes another update to the same bookmark:
{
  kind: 30053,
  pubkey: "abc123...",  // Same author
  tags: [["d", "bookmark:1234567890-xyz"]],  // Same d-tag
  content: "<encrypted_state_v2>",
  created_at: 1700000002
}

// Relay automatically REPLACES v1 with v2
// Only ONE version stored per bookmark!
```

### Event Structure

```javascript
// Complete Nostr event for bookmark state
{
  id: "event_hash_64_hex_chars",      // SHA256 of serialized event
  pubkey: "author_pubkey_64_hex",      // Derived from LEK
  created_at: 1700000000,              // Unix timestamp
  kind: 30053,                         // Parameterized replaceable
  tags: [
    ["d", "bookmark:1234567890-xyz"],  // Bookmark ID (replacement key)
    ["app", "hypermark"],              // Application identifier
    ["v", "1"],                        // Schema version
    ["t", "bookmark"]                  // Type tag for filtering
  ],
  content: "base64(iv):base64(ciphertext)",  // AES-GCM encrypted
  sig: "schnorr_signature_128_hex"     // BIP-340 Schnorr signature
}
```

### Encrypted Content Structure

```javascript
// Decrypted content (before encryption)
{
  type: "bookmark_state",
  id: "bookmark:1234567890-xyz",
  data: {
    url: "https://example.com/article",
    title: "Example Article",
    description: "An interesting read",
    tags: ["tech", "reading-list"],
    readLater: true,
    favicon: "...",
    preview: {...},
    createdAt: 1699999999,
    updatedAt: 1700000000
  },
  deviceId: "device-uuid",
  yjs_vector_clock: {...},  // For CRDT sync
  deleted: false
}
```

### Comparison: Operational vs Replaceable Events

```
OPERATIONAL EVENTS (NOT USED)
─────────────────────────────
Time T1: Event 1 - "Create bookmark: {url, title}"
Time T2: Event 2 - "Update bookmark: {title: 'New Title'}"
Time T3: Event 3 - "Add tag: 'important'"
Time T4: Event 4 - "Update bookmark: {description: '...'}"
Time T5: Event 5 - "Remove tag: 'important'"

→ New device must replay ALL events to get current state
→ Relay stores ALL events forever
→ Bandwidth: O(operations)


REPLACEABLE EVENTS (USED)
─────────────────────────────
Time T1: Event - "Current state: {url, title, ...}"
Time T2: Event - "Current state: {url, title: 'New Title', ...}"
         ↑ Replaces T1 event
Time T3: Event - "Current state: {url, title: 'New Title', tags: ['important'], ...}"
         ↑ Replaces T2 event

→ New device fetches ONE event per bookmark
→ Relay stores ONE event per bookmark
→ Bandwidth: O(bookmarks)
```

---

## Yjs CRDT Conflict Resolution

### The Problem with Last-Write-Wins

Traditional sync systems use timestamps to resolve conflicts:

```
Device A at T=100: bookmark.title = "New Title"
Device B at T=101: bookmark.tags.push("important")

Last-Write-Wins resolution:
  T=101 > T=100, so Device B's change wins
  Result: title unchanged, tag added
  PROBLEM: Device A's title change is LOST!
```

### Yjs CRDT Solution

Hypermark uses Yjs, a Conflict-free Replicated Data Type (CRDT) library. CRDTs have mathematical properties that guarantee:

1. **Eventual consistency**: All replicas converge to the same state
2. **Commutativity**: Operations can be applied in any order
3. **Idempotency**: Applying the same operation twice has no additional effect

```
Device A at T=100: bookmark.title = "New Title"
Device B at T=101: bookmark.tags.push("important")

Yjs CRDT resolution:
  Both operations are on DIFFERENT fields
  Both operations are preserved
  Result: {
    title: "New Title",        // From Device A
    tags: [..., "important"]   // From Device B
  }
  SUCCESS: Both changes merged!
```

### Vector Clock Synchronization

Yjs uses vector clocks to track causality and detect new changes:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Vector Clock Concept                          │
│                                                                  │
│  Device A vector: { A: 5, B: 3 }                                │
│  Device B vector: { A: 3, B: 7 }                                │
│                                                                  │
│  Comparison:                                                     │
│    A has changes B doesn't know about (A: 5 > 3)               │
│    B has changes A doesn't know about (B: 7 > 3)               │
│                                                                  │
│  Result: DIVERGENT - Both have unique changes to merge          │
└─────────────────────────────────────────────────────────────────┘
```

### Integration with Nostr Sync

```javascript
// In NostrSyncService
async applyRemoteBookmarkState(remoteEvent) {
  // 1. Extract vector clock from event
  const remoteVectorClock = decryptAndExtractVectorClock(remoteEvent);

  // 2. Get local vector clock
  const localVectorClock = Y.encodeStateVector(ydoc);

  // 3. Compare to detect new changes
  const comparison = compareVectorClocks(localVectorClock, remoteVectorClock);

  if (comparison.remoteHasNewChanges) {
    // 4. Apply changes through Yjs (CRDT handles merging)
    ydoc.transact(() => {
      const bookmarksMap = ydoc.getMap('bookmarks');
      const bookmarkData = decryptContent(remoteEvent.content);

      // Yjs Y.Map automatically merges field-level changes
      const existing = bookmarksMap.get(bookmarkData.id);
      if (existing) {
        Object.entries(bookmarkData.data).forEach(([key, value]) => {
          existing.set(key, value);
        });
      } else {
        bookmarksMap.set(bookmarkData.id, createYMap(bookmarkData.data));
      }
    }, 'nostr-sync');
  }
}
```

### Conflict Resolution Examples

| Scenario | Device A Action | Device B Action | Result |
|----------|-----------------|-----------------|--------|
| Different fields | Edit title | Add tag | Both changes preserved |
| Same field (text) | title="A" | title="B" | Deterministic merge (based on client ID ordering) |
| Array operations | push("x") | push("y") | Both items added |
| Delete + Edit | Delete bookmark | Edit bookmark | Delete wins (tombstone) |

---

## Sync Flow Sequences

### Sequence 1: Local Change → Nostr Publish

```
┌─────────┐  ┌─────────┐  ┌───────────┐  ┌──────────────┐  ┌───────────┐
│  User   │  │   UI    │  │  useYjs   │  │ NostrSync    │  │  Relays   │
└────┬────┘  └────┬────┘  └─────┬─────┘  └──────┬───────┘  └─────┬─────┘
     │            │             │                │                │
     │ Edit       │             │                │                │
     │ bookmark   │             │                │                │
     │───────────>│             │                │                │
     │            │             │                │                │
     │            │ Update      │                │                │
     │            │ Y.Map       │                │                │
     │            │────────────>│                │                │
     │            │             │                │                │
     │            │             │ Persist to     │                │
     │            │             │ IndexedDB      │                │
     │            │             │────────┐       │                │
     │            │             │        │       │                │
     │            │             │<───────┘       │                │
     │            │             │                │                │
     │            │             │ Observer       │                │
     │            │             │ detects        │                │
     │            │             │ change         │                │
     │            │             │                │                │
     │            │             │ Queue          │                │
     │            │             │ update         │                │
     │            │             │───────────────>│                │
     │            │             │                │                │
     │            │             │                │ [1.5s debounce │
     │            │             │                │  window]       │
     │            │             │                │                │
     │            │             │                │ Encrypt        │
     │            │             │                │ content        │
     │            │             │                │────────┐       │
     │            │             │                │        │       │
     │            │             │                │<───────┘       │
     │            │             │                │                │
     │            │             │                │ Sign event     │
     │            │             │                │────────┐       │
     │            │             │                │        │       │
     │            │             │                │<───────┘       │
     │            │             │                │                │
     │            │             │                │ Publish        │
     │            │             │                │───────────────>│
     │            │             │                │                │
     │            │             │                │           OK   │
     │            │             │                │<───────────────│
     │            │             │                │                │
```

### Sequence 2: Remote Change → Local Apply

```
┌───────────┐  ┌──────────────┐  ┌───────────┐  ┌─────────┐  ┌─────────┐
│  Relays   │  │ NostrSync    │  │  useYjs   │  │   UI    │  │  User   │
└─────┬─────┘  └──────┬───────┘  └─────┬─────┘  └────┬────┘  └────┬────┘
      │               │                │             │            │
      │ New event     │                │             │            │
      │ (subscription)│                │             │            │
      │──────────────>│                │             │            │
      │               │                │             │            │
      │               │ Validate       │             │            │
      │               │ signature      │             │            │
      │               │────────┐       │             │            │
      │               │        │       │             │            │
      │               │<───────┘       │             │            │
      │               │                │             │            │
      │               │ Decrypt        │             │            │
      │               │ content        │             │            │
      │               │────────┐       │             │            │
      │               │        │       │             │            │
      │               │<───────┘       │             │            │
      │               │                │             │            │
      │               │ Compare        │             │            │
      │               │ vector clocks  │             │            │
      │               │────────┐       │             │            │
      │               │        │       │             │            │
      │               │<───────┘       │             │            │
      │               │                │             │            │
      │               │ [If new        │             │            │
      │               │  changes]      │             │            │
      │               │                │             │            │
      │               │ Apply to       │             │            │
      │               │ Yjs doc        │             │            │
      │               │───────────────>│             │            │
      │               │                │             │            │
      │               │                │ CRDT        │            │
      │               │                │ merge       │            │
      │               │                │────┐        │            │
      │               │                │    │        │            │
      │               │                │<───┘        │            │
      │               │                │             │            │
      │               │                │ Persist     │            │
      │               │                │ to IDB      │            │
      │               │                │────┐        │            │
      │               │                │    │        │            │
      │               │                │<───┘        │            │
      │               │                │             │            │
      │               │                │ Reactive    │            │
      │               │                │ update      │            │
      │               │                │────────────>│            │
      │               │                │             │            │
      │               │                │             │ Display    │
      │               │                │             │ change     │
      │               │                │             │───────────>│
      │               │                │             │            │
```

### Sequence 3: Initial Sync (New Device)

```
┌──────────────┐  ┌───────────┐  ┌───────────┐  ┌───────────┐
│ New Device   │  │ NostrSync │  │  Relays   │  │   Yjs     │
└──────┬───────┘  └─────┬─────┘  └─────┬─────┘  └─────┬─────┘
       │                │              │              │
       │ Pair with      │              │              │
       │ existing       │              │              │
       │ device (LEK)   │              │              │
       │────────────────│──────────────│──────────────│
       │                │              │              │
       │ Initialize     │              │              │
       │ NostrSync      │              │              │
       │───────────────>│              │              │
       │                │              │              │
       │                │ Derive       │              │
       │                │ keypair      │              │
       │                │ from LEK     │              │
       │                │────┐         │              │
       │                │    │         │              │
       │                │<───┘         │              │
       │                │              │              │
       │                │ Connect to   │              │
       │                │ relays       │              │
       │                │─────────────>│              │
       │                │              │              │
       │                │ Subscribe    │              │
       │                │ (kind:30053, │              │
       │                │  author:me)  │              │
       │                │─────────────>│              │
       │                │              │              │
       │                │ Fetch all    │              │
       │                │ existing     │              │
       │                │ events       │              │
       │                │<─────────────│              │
       │                │              │              │
       │                │ For each event:             │
       │                │              │              │
       │                │ Decrypt &    │              │
       │                │ validate     │              │
       │                │────┐         │              │
       │                │    │         │              │
       │                │<───┘         │              │
       │                │              │              │
       │                │ Apply to     │              │
       │                │ Yjs doc      │              │
       │                │─────────────────────────────>│
       │                │              │              │
       │                │              │         CRDT │
       │                │              │        merge │
       │                │              │              │
       │                │              │       Persist│
       │                │              │       to IDB │
       │                │              │              │
       │ Bookmarks      │              │              │
       │ populated!     │              │              │
       │<───────────────│──────────────│──────────────│
       │                │              │              │
```

---

## Security Model

### Threat Model

**Defending against:**
- Passive network eavesdropping (WiFi sniffers, ISP monitoring)
- Curious relay operators
- Unauthorized device access (without physical QR scan)

**Not defending against:**
- Device compromise (malware on user's device)
- State-level targeted attacks
- Traffic analysis / metadata leakage

### Encryption Layers

```
┌─────────────────────────────────────────────────────────────────┐
│                    Security Layer Stack                          │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Layer 4: Transport Security (WSS/TLS)                     │  │
│  │   - Encrypts relay connections                            │  │
│  │   - Prevents network eavesdropping                        │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Layer 3: Nostr Event Signing (secp256k1 Schnorr)          │  │
│  │   - Authenticates event author                            │  │
│  │   - Prevents tampering and impersonation                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Layer 2: Content Encryption (AES-256-GCM)                 │  │
│  │   - Encrypts bookmark content                             │  │
│  │   - Only LEK holders can decrypt                          │  │
│  │   - Random IV per encryption                              │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Layer 1: Key Management (LEK + HKDF)                      │  │
│  │   - LEK shared via secure pairing                         │  │
│  │   - Nostr keys derived via HKDF                           │  │
│  │   - No keys ever transmitted in plaintext                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What Relays Can See

| Data | Visible to Relays? |
|------|-------------------|
| Bookmark URLs | No (encrypted) |
| Bookmark titles | No (encrypted) |
| Bookmark tags | No (encrypted) |
| Bookmark descriptions | No (encrypted) |
| Nostr public key | Yes |
| Bookmark IDs (d-tags) | Yes (but meaningless) |
| Event timestamps | Yes |
| Event frequency | Yes |
| Event sizes | Yes |

### Event Validation

All incoming events are validated before processing:

```javascript
// In nostr-sync.js
const VALIDATION_CHECKS = [
  'Event structure (NIP-01 compliance)',
  'Kind is 30053 (parameterized replaceable)',
  'Signature verification (Schnorr)',
  'Content size limits (100KB max)',
  'Timestamp bounds (not too old, not too future)',
  'Required tags present (d, app)',
  'Encrypted content format (iv:ciphertext)',
];
```

### Zero-Trust Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│                    Zero-Trust Data Flow                            │
│                                                                    │
│  Local Device                     Untrusted Infrastructure        │
│  ┌─────────────────────┐         ┌─────────────────────┐         │
│  │                     │         │                     │         │
│  │  Plaintext          │         │  Nostr Relays       │         │
│  │  Bookmarks          │         │  (see encrypted     │         │
│  │       │             │         │   blobs only)       │         │
│  │       ▼             │         │                     │         │
│  │  AES-256-GCM        │         └─────────────────────┘         │
│  │  Encryption         │                   ▲                     │
│  │       │             │                   │                     │
│  │       ▼             │         ┌─────────┴─────────┐           │
│  │  Encrypted          │────────>│ Encrypted Events  │           │
│  │  Content            │         │ (unreadable by    │           │
│  │                     │         │  relay operators) │           │
│  │                     │         └───────────────────┘           │
│  │                     │                                         │
│  │  LEK never leaves   │                                         │
│  │  paired devices     │                                         │
│  │                     │                                         │
│  └─────────────────────┘                                         │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Performance Optimizations

### Debounced Publishing

Rapid changes are batched to reduce network traffic:

```javascript
// Configuration
const DEBOUNCE_DELAY = 1500; // 1.5 seconds

// Example: User types in bookmark title
Keystrokes at: T+0, T+200ms, T+400ms, T+600ms, T+800ms
                │     │         │         │         │
                └─────┴─────────┴─────────┴─────────┘
                              │
                              ▼
                [Wait 1.5s from last change]
                              │
                              ▼
                    Single Nostr publish
                    (final state only)

// Result: 5 changes → 1 network request
```

### Connection Pool Management

```javascript
// Relay connection strategy
const RELAY_CONFIG = {
  initialConnections: 3,    // Connect to 3 relays initially
  maxConnections: 5,        // Maximum 5 concurrent connections
  retryStrategy: {
    baseDelay: 1000,        // Start with 1s delay
    maxDelay: 30000,        // Cap at 30s delay
    backoffFactor: 2,       // Double each retry
    jitter: 0.1             // 10% random jitter
  }
};
```

### Paginated Initial Sync

For users with large bookmark collections:

```javascript
// Progressive loading strategy
async function fetchBookmarksPaginated() {
  const BATCH_SIZE = 100;
  let cursor = null;

  while (true) {
    const batch = await fetchBatch(BATCH_SIZE, cursor);

    if (batch.length === 0) break;

    // Apply batch to Yjs (UI updates progressively)
    await applyBatch(batch);

    cursor = batch[batch.length - 1].created_at;

    // Small delay to prevent overwhelming the UI
    await sleep(50);
  }
}
```

### Performance Metrics

| Metric | Target | Notes |
|--------|--------|-------|
| Debounce latency | 1.5s max | Time from last edit to publish |
| Event publish | <500ms | Single relay acknowledgment |
| Initial sync (100 bookmarks) | <5s | Progressive loading |
| Initial sync (1000 bookmarks) | <30s | Paginated batches |
| Memory usage | <50MB | For 1000 bookmarks |

---

## Error Handling

### Graceful Degradation

```
┌─────────────────────────────────────────────────────────────────┐
│                    Fallback Hierarchy                            │
│                                                                  │
│  Primary: WebRTC P2P (real-time)                                │
│     │                                                           │
│     │ If both devices online → Use WebRTC                       │
│     │                                                           │
│     ▼                                                           │
│  Secondary: Nostr Relays (async)                                │
│     │                                                           │
│     │ If WebRTC unavailable → Queue for Nostr                   │
│     │                                                           │
│     ▼                                                           │
│  Tertiary: Local-only (IndexedDB)                               │
│     │                                                           │
│     │ If all relays down → Store locally, retry later           │
│     │                                                           │
│     ▼                                                           │
│  App remains fully functional offline                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Retry Strategy

```javascript
// Exponential backoff with jitter
function calculateRetryDelay(attempt) {
  const base = RETRY_CONFIG.baseDelay;      // 1000ms
  const max = RETRY_CONFIG.maxDelay;        // 30000ms
  const factor = RETRY_CONFIG.backoffFactor; // 2
  const jitter = RETRY_CONFIG.jitterFactor;  // 0.1

  // Calculate exponential delay
  let delay = Math.min(base * Math.pow(factor, attempt), max);

  // Add random jitter to prevent thundering herd
  const jitterAmount = delay * jitter * Math.random();
  delay += jitterAmount;

  return delay;
}

// Retry sequence: 1s, 2s, 4s, 8s, 16s, 30s (capped)
```

### Error Categories

| Error Type | Handling Strategy |
|------------|-------------------|
| Network timeout | Retry with backoff |
| Relay rejection | Try next relay |
| Invalid signature | Log and discard event |
| Decryption failure | Log, may indicate wrong LEK |
| Rate limiting | Backoff, reduce publish frequency |
| Connection lost | Auto-reconnect with backoff |

---

## Future Considerations

### Potential Enhancements

1. **NIP-44 Encryption**: Upgrade from custom AES-GCM to NIP-44 for better interoperability

2. **Relay Discovery**: Dynamic relay discovery using NIP-65 (relay list metadata)

3. **Compression**: Compress bookmark content before encryption for bandwidth savings

4. **Selective Sync**: Allow users to exclude certain bookmarks from cloud sync

5. **Sync Conflicts UI**: Visual indicator when manual conflict resolution is needed

6. **Relay Health Scoring**: Track relay reliability and prefer faster/more reliable relays

### Migration Paths

| Current | Future | Migration Strategy |
|---------|--------|-------------------|
| Custom encryption | NIP-44 | Dual-read period, gradual migration |
| Fixed relays | NIP-65 discovery | Additive, maintain fallback to fixed |
| Kind 30053 | Updated kind | Version tag allows detection |

---

## References

### Nostr NIPs
- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): Basic protocol
- [NIP-33](https://github.com/nostr-protocol/nips/blob/master/33.md): Parameterized replaceable events

### Cryptographic Standards
- [RFC 5869](https://tools.ietf.org/html/rfc5869): HKDF specification
- [BIP-340](https://github.com/bitcoin/bips/blob/master/bip-0340.mediawiki): Schnorr signatures

### Libraries Used
- [@noble/secp256k1](https://github.com/paulmillr/noble-secp256k1): secp256k1 operations
- [Yjs](https://github.com/yjs/yjs): CRDT implementation
- [y-webrtc](https://github.com/yjs/y-webrtc): WebRTC provider for Yjs

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-01-23 | Claude | Initial comprehensive documentation |
