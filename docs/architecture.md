# Architecture

Hypermark is a local-first, privacy-focused Progressive Web App (PWA). All bookmark data is encrypted on the device and synchronized via a hybrid system: real-time P2P sync (WebRTC) and asynchronous cloud sync (Nostr relays). No server ever sees plaintext content.

## System Overview

```
       +-------------------------------------------------------------+
       |                   Browser / PWA Context                      |
       |                                                              |
       |  +------------------+          +--------------------------+  |
       |  |  React UI Layer  |<-------->|     Service Layer        |  |
       |  +------------------+          |   (Business Logic)       |  |
       |                                +----------+---------------+  |
       |                                           |                  |
       |                 +-------------------------+------------------+
       |                 |                         |                  |
       |        +--------v--------+       +--------v-----------+     |
       |        |  Yjs Document   |       |  Web Crypto API    |     |
       |        |     (CRDT)      |       | (AES-GCM / ECDH)  |     |
       |        +--------+--------+       +--------------------+     |
       |                 |                                           |
       |    +------------+------------+-----------------+            |
       |    |            |            |                 |            |
       |    v            v            v                 v            |
       | +----------+ +----------+ +--------------+ +------------+  |
       | |IndexedDB | | WebRTC   | |NostrSyncSvc  | |nostr-crypto|  |
       | |(persist) | |(P2P sync)| |(cloud sync)  | |(secp256k1) |  |
       | +----------+ +----+-----+ +------+-------+ +------------+  |
       |                   |              |                          |
       +-------------------+--------------+--------------------------+
                           |              |
                  +--------v--------+     |
                  | Signaling Server|     |
                  | (WebRTC only)   |     |
                  +-----------------+     |
                                          |
                           +--------------v--------------+
                           |      Nostr Relays           |
                           |  (encrypted events only)    |
                           |  - relay.damus.io           |
                           |  - nos.lol                  |
                           |  - relay.nostr.band         |
                           +-----------------------------+
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React 18 + Vite 7 |
| State Management | Yjs (CRDT) |
| Local Storage | IndexedDB (via y-indexeddb) |
| P2P Transport | WebRTC data channels (via y-webrtc) |
| Cloud Sync | Nostr protocol (kind 30053 events) |
| Encryption | Web Crypto API (AES-256-GCM, ECDH, HKDF) + secp256k1 |
| Search | MiniSearch (client-side full-text) |
| Styling | Tailwind CSS v4 + Radix UI primitives |
| Icons | lucide-react |

## Hybrid Sync Architecture

Hypermark uses two complementary sync mechanisms:

### 1. WebRTC P2P Sync (Real-time)
- Sub-second latency when both devices are online
- Direct peer-to-peer, no server sees data
- Uses y-webrtc provider for Yjs
- Room password derived from LEK via HKDF

### 2. Nostr Cloud Sync (Asynchronous)
- Works when devices are not online simultaneously
- Encrypted events stored on decentralized relays
- Uses parameterized replaceable events (kind 30053)
- Keypair deterministically derived from LEK
- 1.5s debounce to batch rapid changes

Both sync to the same Yjs document -- changes merge via CRDT.

For full details, see [Nostr Sync Architecture](nostr-sync-architecture.md).

## Data Flow

1. **User action**: User adds or modifies a bookmark in the UI
2. **Service layer**: `bookmarks.js` validates the input
3. **CRDT update**: The change is applied to the local Yjs document
4. **Local persistence**: y-indexeddb automatically persists to IndexedDB
5. **P2P sync**: If devices connected via y-webrtc, delta broadcasts immediately
6. **Cloud sync**: NostrSyncService publishes encrypted event to Nostr relays (debounced)
7. **Search indexing**: The useSearch hook updates the MiniSearch index

## Key Concepts

### Ledger Encryption Key (LEK)

The LEK is a symmetric AES-256 key generated on the first device. It encrypts all bookmark content. During pairing, the LEK is securely transferred via ECDH key exchange.

### Derived Keys

From the LEK, Hypermark derives:
- **Yjs room password** (HKDF) -- for WebRTC room encryption
- **Nostr keypair** (secp256k1 via HKDF) -- deterministic, same on all devices sharing the same LEK

### Yjs CRDTs

CRDTs (Conflict-free Replicated Data Types) ensure concurrent edits merge deterministically without a central authority.

| Field | Merge Strategy |
|-------|---------------|
| `tags` | Y.Array -- add-wins set semantics |
| `url` | Immutable after create |
| `title`, `description`, `readLater` | Last-write-wins |
| `createdAt` | Immutable |
| `updatedAt` | Auto-updated on change |

### Nostr Events

Bookmarks are published as kind 30053 (parameterized replaceable) events. Content is always AES-256-GCM encrypted before publishing. The `d` tag enables efficient querying and replacement.

## Component Overview

### Source Layout

```
src/
├── components/          # React components
│   ├── bookmarks/       # BookmarkList, BookmarkItem, BookmarkForm, TagSidebar, FilterBar
│   ├── pairing/         # PairingFlow (QR + verification words)
│   └── ui/              # Button, Card, Modal, Toast, Input, Badge, etc.
├── hooks/               # React hooks
│   ├── useYjs.js        # Yjs document + WebRTC + IndexedDB providers + UndoManager
│   ├── useNostrSync.js  # Nostr sync lifecycle
│   ├── useSearch.js     # Full-text search with MiniSearch
│   ├── useHotkeys.js    # Keyboard shortcuts (Cmd+K, Ctrl+Z, arrows)
│   ├── usePasteToInbox.js    # URL paste detection
│   └── useContentSuggestion.js  # URL metadata fetching
├── services/            # Core business logic
│   ├── bookmarks.js     # CRUD, tags, read-later, duplicate detection
│   ├── crypto.js        # LEK generation, AES-GCM, ECDH, key export/import
│   ├── nostr-sync.js    # NostrSyncService (relay connections, pub/sub, debounce)
│   ├── nostr-crypto.js  # secp256k1 keypair derivation, Schnorr signing, event creation
│   ├── key-storage.js   # IndexedDB key persistence
│   ├── bookmark-io.js   # Import/export (HTML, JSON)
│   ├── search-index.js  # MiniSearch integration
│   ├── pairing-code.js  # Pairing code generation (room-word-word format)
│   ├── device-registry.js   # Trusted device tracking
│   ├── nostr-diagnostics.js # Relay health monitoring
│   └── reset.js         # Factory reset
└── test-utils/          # Test helpers and mocks
```

### Backend

```
services/
├── server.js            # WebSocket signaling server + HTTP suggestion API
├── metadata.js          # URL metadata extraction (title, description, favicon)
├── package.json         # Server dependencies
├── Dockerfile           # Fly.io container
└── fly.toml             # Fly.io deployment config
```

## Further Reading

- [Security Architecture](security.md) -- threat model, pairing protocol, attack scenarios
- [Nostr Sync Architecture](nostr-sync-architecture.md) -- hybrid sync details, CRDT integration
- [Sync Guide](sync-guide.md) -- user-facing guide for pairing and relay configuration
