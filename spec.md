# Nostr Bookmark Sync Specification

## Overview
Add Nostr relay-based synchronization to Hypermark as a secondary sync mechanism alongside existing WebRTC P2P sync. This enables bookmark sync even when devices are offline simultaneously, using the distributed Nostr relay network as an intermediary.

## Architecture Integration

**Current System:**
```
Yjs Document ←→ IndexedDB (local persistence)
     ↓
WebRTC P2P (when devices online simultaneously)
```

**With Nostr:**
```
Yjs Document ←→ IndexedDB (local persistence)
     ↓              ↓
WebRTC P2P    Nostr Relays (async sync)
```

## Key Design Decisions

| Aspect | Decision | Rationale |
|--------|----------|-----------|
| **Authentication** | LEK-derived deterministic keypairs | Cross-platform compatible, zero additional setup, leverages existing security model |
| **Privacy** | Encrypted private events (NIP-04/44) | Preserves existing privacy model |
| **Conflict Resolution** | Yjs CRDT with vector clocks | Leverages Yjs strengths, prevents data loss, intelligent merging |
| **Data Structure** | Parameterized replaceable events | Latest state only, efficient bandwidth, automatic deduplication |
| **Event Kind** | 30053 (parameterized replaceable) | Relays store only latest version per bookmark ID |
| **Sync Strategy** | Real-time on every change | Immediate propagation for best UX |
| **Relay Strategy** | Fixed relay list | Reliable, predictable behavior |

## Current System Analysis

### Bookmark Implementation - Hypermark

Based on codebase exploration, here's how bookmarks are currently implemented:

#### Storage Mechanism
**Primary Storage: Yjs + IndexedDB**
- Bookmarks are stored using **Yjs** (CRDT - Conflict-free Replicated Data Type)
- Data is persisted locally via **IndexedDB** through the `y-indexeddb` provider
- Database: `hypermark-keys` (for cryptographic keys), managed by `src/services/key-storage.js`
- No server-side storage - all data remains local on the device

#### Bookmark Data Structure
Each bookmark is a **Yjs Y.Map** with the following schema:

```javascript
{
  id: "bookmark:${timestamp}-${randomId}",
  type: "bookmark",
  url: string (normalized),
  title: string,
  description: string (optional),
  tags: Y.Array<string> (lowercase, normalized),
  readLater: boolean,
  favicon: string | null (URL or cached reference),
  preview: object | null (metadata),
  createdAt: timestamp,
  updatedAt: timestamp
}
```

#### Available Operations
All bookmark CRUD operations are in `src/services/bookmarks.js`:

**Core Operations:**
- `createBookmark(bookmarkData)` - Create new bookmark with validation
- `updateBookmark(id, updates)` - Modify existing bookmark
- `deleteBookmark(id)` - Remove bookmark
- `getBookmark(id)` - Retrieve single bookmark
- `getAllBookmarks()` - Get all bookmarks (sorted by createdAt descending)

**Tag Management:**
- `addTag(id, tag)` - Add tag to bookmark
- `removeTag(id, tag)` - Remove tag from bookmark
- `getBookmarksByTag(tag)` - Filter bookmarks by tag
- `getAllTags()` - Get all unique tags across bookmarks

**Read-Later Management:**
- `toggleReadLater(id)` - Toggle read-later status
- `getReadLaterBookmarks()` - Get all read-later items

#### Encryption & Security
- **Ledger Encryption Key (LEK)**: AES-256 symmetric key for bookmark content
- **Web Crypto API**: AES-GCM for encryption
- **Device Identity**: ECDH key pairs for device-to-device authentication
- Stored in IndexedDB via `key-storage.js`
- WebRTC room password derived from LEK (prevents LEK exposure)

## Implementation Specification

### 1. Nostr Event Schema

**Event Kind:** `30053` (Parameterized Replaceable Event)
**Content:** Encrypted bookmark state using existing LEK

```javascript
// Encrypted content structure - Current bookmark state
{
  type: "bookmark_state",
  id: "bookmark:1234567890-abc123",
  data: {
    // Complete bookmark object (null for deleted bookmarks)
    url: "https://example.com",
    title: "Example Title",
    description: "...",
    tags: ["tech", "favorites"],
    readLater: false,
    favicon: "...",
    preview: {...},
    createdAt: 1640995200000,
    updatedAt: 1640995250000
  },
  deviceId: "device-uuid", // from existing device registry
  yjs_vector_clock: {...}, // for CRDT conflict resolution
  deleted: false // true for deleted bookmarks
}

// Nostr event structure
{
  kind: 30053,
  content: "<encrypted_bookmark_state>",
  tags: [
    ["d", "bookmark:1234567890-abc123"], // bookmark ID - enables replacement
    ["app", "hypermark"],
    ["version", "1.0"]
  ],
  created_at: 1640995250,
  pubkey: "...",
  sig: "..."
}
```

**Key Benefits of Parameterized Replaceable Events:**
- Relays automatically store only the latest version per bookmark ID
- No need to replay event history - just fetch current state
- Dramatically reduced bandwidth and storage requirements
- Simplified sync logic - compare current states, not event streams

### 2. Component Architecture

**New Components:**
- `src/services/nostr-sync.js` - Core Nostr synchronization service
- `src/hooks/useNostrSync.js` - React hook for Nostr integration

**Modified Components:**
- `src/services/bookmarks.js` - Add Nostr sync calls
- `src/hooks/useYjs.js` - Integrate Nostr observer
- `src/components/settings/` - Add Nostr configuration

### 3. NostrSync Service API

```javascript
class NostrSyncService {
  // Initialization
  async initialize(ydoc, relayUrls = DEFAULT_RELAYS)
  async deriveNostrKeypair(lek) // Generate deterministic keypair from LEK

  // Core sync operations
  async publishBookmarkState(bookmarkId, bookmarkData)
  async subscribeToBookmarkStates()
  async fetchAllBookmarkStates()
  async fetchBookmarkState(bookmarkId)

  // CRDT-based conflict resolution
  async applyRemoteState(remoteEvent)
  compareVectorClocks(localClock, remoteClock)
  mergeBookmarkStates(localBookmark, remoteState)

  // Status and diagnostics
  isConnected()
  getRelayStatus()
  getLastSyncTime()
  getKeypairStatus()
}
```

### 4. LEK-Based Key Derivation

**Deterministic Keypair Generation:**
```javascript
// Derive Nostr keypair from existing LEK
const deriveNostrKeypair = async (lek) => {
  // Export LEK as raw bytes
  const lekRaw = await crypto.subtle.exportKey('raw', lek);

  // Create deterministic seed using HKDF
  const seed = await crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: new TextEncoder().encode('nostr-keypair'),
      info: new TextEncoder().encode('hypermark-v1')
    },
    await crypto.subtle.importKey('raw', lekRaw, 'HKDF', false, ['deriveKey']),
    { name: 'HMAC', hash: 'SHA-256' },
    true,
    ['sign', 'verify']
  );

  // Convert to secp256k1 keypair for Nostr
  return generateSecp256k1Keypair(seed);
};
```

**Benefits:**
- **Deterministic**: Same LEK always produces identical Nostr keys across devices
- **Secure**: Uses HKDF for proper key derivation (not simple hashing)
- **Standard**: Compatible with secp256k1 used by Nostr protocol
- **Automatic**: No user interaction required after initial WebRTC pairing

### 5. Integration Points

**Bookmark Operations:**
```javascript
// In src/services/bookmarks.js
export const createBookmark = async (data) => {
  // Existing Yjs logic
  const bookmark = bookmarksMap.set(id, yBookmark);

  // New: Publish current state to Nostr
  await nostrSync?.publishBookmarkState(id, bookmark.toJSON());

  return bookmark;
};

export const updateBookmark = async (id, updates) => {
  // Existing Yjs logic
  const bookmark = bookmarksMap.get(id);
  Object.assign(bookmark, updates);

  // New: Publish updated state to Nostr
  await nostrSync?.publishBookmarkState(id, bookmark.toJSON());

  return bookmark;
};
```

**Yjs Observer Integration with Debouncing:**
```javascript
// In src/hooks/useYjs.js
useEffect(() => {
  const pendingUpdates = new Map(); // bookmarkId -> latest state
  let publishTimeout = null;

  const observer = (events) => {
    // Existing UI update logic

    // New: Collect state changes for debounced Nostr sync
    events.forEach(event => {
      if (event.path[0] === 'bookmarks' && event.path[1]) {
        const bookmarkId = event.path[1];
        const bookmark = bookmarksMap.get(bookmarkId);
        if (bookmark) {
          // Queue the latest state (overwrites previous pending update)
          pendingUpdates.set(bookmarkId, bookmark.toJSON());
        }
      }
    });

    // Debounce: batch publish updates every 1.5 seconds max
    if (pendingUpdates.size > 0 && !publishTimeout) {
      publishTimeout = setTimeout(async () => {
        // Process all pending updates in batch
        const updates = Array.from(pendingUpdates.entries());
        pendingUpdates.clear();
        publishTimeout = null;

        // Publish each bookmark state (could be further optimized with batch API)
        for (const [bookmarkId, bookmarkData] of updates) {
          try {
            await nostrSync?.publishBookmarkState(bookmarkId, bookmarkData);
          } catch (err) {
            console.error('[Nostr] Failed to publish bookmark:', bookmarkId, err);
          }
        }
      }, 1500); // 1.5 second debounce
    }
  };

  ydoc.observeDeep(observer);

  // Cleanup timeout on unmount
  return () => {
    if (publishTimeout) {
      clearTimeout(publishTimeout);
      // Flush remaining updates immediately on cleanup
      if (pendingUpdates.size > 0) {
        pendingUpdates.forEach(async (bookmarkData, bookmarkId) => {
          try {
            await nostrSync?.publishBookmarkState(bookmarkId, bookmarkData);
          } catch (err) {
            console.error('[Nostr] Failed to publish on cleanup:', bookmarkId, err);
          }
        });
      }
    }
  };
}, []);
```

**Performance Benefits:**
- **Reduced Network Traffic**: Rapid-fire changes (typing, multiple edits) are batched into single updates
- **Latest State Only**: If a bookmark is edited multiple times within 1.5 seconds, only the final state is published
- **Graceful Cleanup**: Pending updates are flushed immediately when component unmounts
- **Error Resilience**: Individual bookmark publish failures don't block other updates

### 5. Default Relay Configuration

**Reliable Public Relays:**
```javascript
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://relay.snort.social'
];
```

### 6. Performance & Scalability Considerations

#### Update Frequency Optimization

**Challenge:** Yjs observer triggers on every document change, potentially creating excessive Nostr events during rapid editing.

**Solution:** Debounced publishing with 1.5-second batching (implemented in integration code above).

**Benefits:**
- **Reduced Network Traffic**: Rapid-fire changes batched into single updates
- **Latest State Only**: Multiple edits within window result in single publish
- **User Experience**: No noticeable delay, significantly reduced bandwidth

#### Initial Sync Performance

**Current Approach:**
- New devices call `fetchAllBookmarkStates()` to retrieve all existing bookmarks
- Each bookmark becomes a separate Kind 30053 event subscription
- Simple and reliable for most users (up to ~1000 bookmarks)

**Scalability Implications:**
- **Power Users**: Users with thousands of bookmarks may experience longer initial sync times
- **Network Load**: Bulk fetching thousands of events simultaneously could strain client processing
- **Memory Usage**: All bookmark states loaded into memory at once during initial sync

**Current Mitigation Strategies:**
1. **Parameterized Replaceable Events**: Only latest state per bookmark (no historical events)
2. **Efficient Filtering**: Use bookmark ID as event 'd' tag for precise relay filtering
3. **Incremental Processing**: Events processed as received, not all-at-once
4. **Debounced Updates**: Reduces ongoing sync overhead

**Future Optimization Opportunities:**
```javascript
// Potential future improvements for scale (not in current scope)

// Option 1: Paginated Initial Sync
async fetchBookmarkStatesPaginated(limit = 100, since = null) {
  // Fetch bookmarks in batches to reduce memory pressure
}

// Option 2: Priority-Based Loading
async fetchBookmarksByPriority() {
  // Load recent/important bookmarks first (e.g., readLater, recently modified)
}

// Option 3: Background Sync
async enableBackgroundSync() {
  // Load non-critical bookmarks in background after initial UI render
}
```

**Design Philosophy:**
- **Simplicity First**: Current design prioritizes reliability and ease of implementation
- **Graceful Degradation**: System remains functional even with sync delays
- **Future-Proof Architecture**: Supports optimization without breaking changes
- **Monitor & Adapt**: Scale optimizations based on real usage patterns

### 7. Sync Flow Diagram

```
User Action (create/update/delete bookmark)
           ↓
    Update Yjs Document (CRDT)
           ↓
    Persist to IndexedDB
           ↓
    Publish bookmark state to Nostr (async)
           ↓
    Relay stores latest state (replaces previous)
           ↓
    Other devices fetch/receive state updates
           ↓
    Compare vector clocks & merge via Yjs CRDT
           ↓
    UI updates reactively
```

### 8. Conflict Resolution Strategy

**Yjs CRDT-Based Merge (Recommended):**
Instead of overriding Yjs's conflict resolution capabilities, leverage its CRDT algorithm to intelligently merge changes without data loss.

**Implementation Strategy:**
1. **Vector Clock Comparison**: Use the `yjs_vector_clock` from Nostr events to determine if remote changes are new
2. **Apply Remote Operations**: When new changes are detected, apply them directly to the local Yjs document
3. **Let Yjs Handle Merging**: Allow Yjs CRDT to automatically merge concurrent edits (e.g., User A edits title, User B adds tags - both changes preserved)
4. **No Manual Timestamp Logic**: Avoid timestamp-based conflict resolution that could discard valid changes

**Benefits:**
- **Data Loss Prevention**: Unlike Last Write Wins, concurrent edits are merged intelligently
- **Mathematical Guarantees**: CRDTs provide provable convergence properties
- **Field-Level Merging**: Different fields can be edited simultaneously without conflicts
- **Leverages Existing System**: Uses Yjs's proven conflict resolution instead of reinventing it

**Example Conflict Resolution:**
```javascript
// Bad: Last Write Wins would choose one or the other
Device A: bookmark.title = "New Title"
Device B: bookmark.tags.push("important")

// Good: Yjs CRDT preserves both changes
Result: bookmark = { title: "New Title", tags: [...existing, "important"] }
```

### 9. Error Handling & Fallbacks

**Relay Connectivity:**
- Retry failed publishes with exponential backoff
- Switch to different relays if primary fails
- Continue functioning with WebRTC if all relays unavailable
- Queue operations locally when all relays are down

**LEK-Based Key Derivation (Security Critical):**
- **Automatic Key Generation**: Nostr keypairs derived deterministically from existing LEK
- **Cross-Platform Compatible**: Works on all platforms including iOS Safari (no browser extension required)
- **Zero Additional Setup**: Nostr sync activates automatically after initial WebRTC pairing
- **Graceful Degradation**: If LEK unavailable:
  - Disable Nostr sync until initial device pairing completed
  - Continue functioning with existing WebRTC P2P sync
  - Automatically enable Nostr sync after successful pairing

### 10. Implementation Phases

**Phase 1: Core State Publishing**
1. Implement `NostrSyncService` class with parameterized replaceable events
2. Add LEK-based deterministic key derivation with proper error handling
3. Publish bookmark states to relays (kind: 30053)
4. Basic Yjs observer integration for outbound sync

**Phase 2: Bidirectional State Sync**
1. Subscribe to incoming bookmark state events
2. Implement vector clock comparison for new changes
3. Apply remote states to Yjs documents via CRDT merge
4. Handle initial sync for new devices
5. UI indicators for sync status and relay connectivity

**Phase 3: Polish & Production Ready**
1. Configuration UI for relay selection and sync preferences
2. Sync diagnostics, error reporting, and troubleshooting tools
3. Advanced performance optimizations (paginated sync, background loading)
4. Comprehensive testing with multiple devices and edge cases (including scale testing)
5. Documentation for users on device pairing and sync behavior

## Benefits

1. **Async Sync:** Bookmarks sync even when devices offline simultaneously
2. **Decentralized:** No single point of failure
3. **Privacy Preserved:** Existing encryption model maintained
4. **Minimal Disruption:** Additive to current architecture
5. **Standards-Based:** Uses established Nostr protocols
6. **Graceful Degradation:** Works alongside existing WebRTC sync
7. **Cross-Platform Compatible:** Works on iOS Safari without browser extensions
8. **Zero Additional Setup:** Automatic after existing WebRTC pairing

## Specification Improvements

This specification has been refined based on expert feedback focusing on three critical areas:

### 1. **Conflict Resolution Enhancement**
- **Changed from**: Manual "Last Write Wins" timestamp comparison
- **Changed to**: Yjs CRDT-based merging using vector clocks
- **Benefit**: Prevents data loss, leverages proven CRDT mathematics, enables intelligent field-level merging

### 2. **Event Architecture Optimization**
- **Changed from**: Regular events (kind: 1053) storing operation deltas
- **Changed to**: Parameterized replaceable events (kind: 30053) storing current state
- **Benefit**: Dramatically reduced bandwidth, automatic deduplication by relays, simplified sync logic

### 3. **Security Hardening & Cross-Platform Support**
- **Changed from**: Hard requirement for NIP-07 browser extension
- **Changed to**: LEK-derived deterministic keypairs
- **Benefit**: Eliminates platform restrictions, maintains security, enables iOS Safari support, preserves zero-setup philosophy

## Next Steps

This refined specification provides a robust, secure foundation for implementation. The design preserves all existing functionality while adding powerful async sync capabilities through the Nostr network, maintaining the privacy-first approach of the current system while leveraging the mathematical guarantees of CRDTs and the efficiency of parameterized replaceable events.