# Technical Architecture

Hypermark is a local-first, privacy-focused Progressive Web App (PWA). All bookmark data is encrypted on the device and synchronized via a hybrid system: real-time P2P sync (WebRTC) and asynchronous cloud sync (Nostr relays). No server ever sees plaintext content.

## System Overview

```text
       ┌─────────────────────────────────────────────────────────────┐
       │                   Browser / PWA Context                     │
       │                                                             │
       │  ┌──────────────────┐          ┌──────────────────────────┐ │
       │  │  React UI Layer  │◄────────►│     Service Layer        │ │
       │  └──────────────────┘          │   (Business Logic)       │ │
       │                                └───────────┬──────────────┘ │
       │                                            │                │
       │                 ┌──────────────────────────┼────────────────┤
       │                 │                          │                │
       │        ┌────────▼────────┐        ┌───────▼──────────┐     │
       │        │  Yjs Document   │        │  Web Crypto API  │     │
       │        │     (CRDT)      │        │ (AES-GCM / ECDH) │     │
       │        └────────┬────────┘        └──────────────────┘     │
       │                 │                                          │
       │    ┌────────────┼────────────┬──────────────────┐          │
       │    │            │            │                  │          │
       │    ▼            ▼            ▼                  ▼          │
       │ ┌──────────┐ ┌──────────┐ ┌──────────────┐ ┌────────────┐  │
       │ │IndexedDB │ │ WebRTC   │ │NostrSyncSvc  │ │nostr-crypto│  │
       │ │(persist) │ │(P2P sync)│ │(cloud sync)  │ │(secp256k1) │  │
       │ └──────────┘ └────┬─────┘ └──────┬───────┘ └────────────┘  │
       │                   │              │                         │
       └───────────────────┼──────────────┼─────────────────────────┘
                           │              │
                  ┌────────▼────────┐     │
                  │ Signaling Server│     │
                  │ (WebRTC only)   │     │
                  └─────────────────┘     │
                                         │
                           ┌─────────────▼─────────────┐
                           │      Nostr Relays         │
                           │  (encrypted events only)  │
                           │  - relay.damus.io         │
                           │  - nos.lol                │
                           │  - relay.nostr.band       │
                           └───────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | React + Vite |
| State Management | Yjs (CRDT) |
| Local Storage | IndexedDB (via y-indexeddb) |
| P2P Transport | WebRTC Data Channels (via y-webrtc) |
| Cloud Sync | Nostr protocol (kind 30053 events) |
| Encryption | Web Crypto API (AES-256-GCM) + secp256k1 |
| Search | MiniSearch (client-side) |
| Styling | Tailwind CSS v4 + Radix UI primitives |

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

Both sync to the same Yjs document - changes merge via CRDT.

## Data Flow

1. **User Action**: User adds or modifies a bookmark in the UI.
2. **Service Layer**: The `bookmarks.js` service validates the input.
3. **CRDT Update**: The change is applied to the local Yjs document.
4. **Local Persistence**: `y-indexeddb` automatically persists to IndexedDB.
5. **P2P Sync**: If devices connected via `y-webrtc`, delta broadcasts immediately.
6. **Cloud Sync**: `NostrSyncService` publishes encrypted event to Nostr relays (debounced).
7. **Background Indexing**: `useSearch` hook updates the MiniSearch index.

## Key Concepts

### Ledger Encryption Key (LEK)
The LEK is a symmetric AES-256 key generated on the first device. It encrypts all bookmark content. During pairing, the LEK is securely transferred via ECDH key exchange.

### Derived Keys
From the LEK, we derive:
- **Yjs room password** (HKDF) - for WebRTC encryption
- **Nostr keypair** (secp256k1) - deterministic, same on all devices

### Yjs CRDTs
CRDTs ensure concurrent edits merge deterministically without a central authority.

### Nostr Events
Bookmarks are published as kind 30053 (parameterized replaceable) events. Content is always AES-256-GCM encrypted before publishing. The `d` tag enables efficient querying and replacement.

## Component Overview

- **`src/components/`**: Feature domains (bookmarks, pairing, ui)
- **`src/services/`**: Core logic (bookmarks, crypto, nostr-sync, nostr-crypto, key-storage)
- **`src/hooks/`**: React hooks (useYjs, useNostrSync, useSearch)
- **`src/utils/`**: Shared utilities

For detailed security implementation, see [Security](security.md).
For Nostr sync details, see [Nostr Sync Architecture](nostr-sync-architecture.md).
