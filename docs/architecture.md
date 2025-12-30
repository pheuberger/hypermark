# Technical Architecture

Hypermark is designed as a local-first, privacy-focused Progressive Web App (PWA). It ensures that all bookmark data is encrypted on the device and synchronized directly between devices without ever exposing plaintext content to a server.

## System Overview

The following diagram illustrates the high-level data flow and component interaction:

```text
       ┌─────────────────────────────────────────────────────────┐
       │                  Browser / PWA Context                  │
       │                                                         │
       │  ┌──────────────────┐          ┌─────────────────────┐  │
       │  │ Preact UI Layer  │◄────────►│   Service Layer     │  │
       │  └──────────────────┘          │ (Business Logic)    │  │
       │                                └──────────┬──────────┘  │
       │                                           │             │
       │                 ┌─────────────────────────┼─────────────┤
       │                 │                         │             │
       │        ┌────────▼────────┐       ┌────────▼──────────┐  │
       │        │  Yjs Document   │       │  Web Crypto API   │  │
       │        │     (CRDT)      │       │ (AES-GCM / ECDH)  │  │
       │        └────────┬────────┘       └───────────────────┘  │
       │                 │                                       │
       │        ┌────────▼────────┐       ┌───────────────────┐  │
       │        │   IndexedDB     │       │  WebRTC (y-webrtc)│  │
       │        │ (Persistence)   │       │   (P2P Sync)      │  │
       │        └─────────────────┘       └─────────┬─────────┘  │
       │                                            │            │
       └────────────────────────────────────────────┼────────────┘
                                                    │
                                           ┌────────▼────────┐
                                           │ Signaling Server│
                                           │ (Metadata Only) │
                                           └─────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|------------|
| UI Framework | Preact + Vite |
| State Management | Yjs (CRDT) |
| Local Storage | IndexedDB (via y-indexeddb) |
| P2P Transport | WebRTC Data Channels (via y-webrtc) |
| Encryption | Web Crypto API (AES-256-GCM) |
| Search | MiniSearch (Client-side) |
| Styling | Tailwind CSS + DaisyUI |

## Data Flow

1. **User Action**: User adds or modifies a bookmark in the UI.
2. **Service Layer**: The `bookmarks.js` service validates the input.
3. **CRDT Update**: The change is applied to the local Yjs document.
4. **Local Persistence**: `y-indexeddb` automatically persists the change to IndexedDB.
5. **P2P Sync**: If other devices are connected via `y-webrtc`, the delta is broadcast over an encrypted WebRTC data channel.
6. **Background Indexing**: `useSearch` hook detects changes in the Yjs document and updates the local MiniSearch index.

## Key Concepts

### Ledger Encryption Key (LEK)
The LEK is a symmetric AES-256 key generated on the first device. It is used to encrypt all bookmark content. During pairing, the LEK is securely transferred to the new device via an ECDH key exchange.

### Yjs CRDTs
Hypermark uses Yjs to manage its data. CRDTs (Conflict-free Replicated Data Types) ensure that concurrent edits from different devices merge deterministically without a central authority.

### WebRTC P2P Sync
Devices sync directly with each other. The signaling server is only used to help devices discover each other and negotiate the initial connection. Once the WebRTC channel is open, all traffic is peer-to-peer and end-to-end encrypted.

### Derived Passwords
To protect the LEK, the password for the WebRTC "room" is derived from the LEK using HKDF. This ensures that even if the signaling server or the WebRTC layer is compromised, the raw LEK is never exposed.

## Component Overview

- **`src/components/`**: Divided into feature domains (bookmarks, pairing, sync, ui).
- **`src/services/`**: Pure logic services for bookmarks, crypto, device registry, and signaling.
- **`src/hooks/`**: React-style hooks that bridge Yjs and search functionality into the UI.
- **`src/utils/`**: Shared utilities for device identification and QR processing.

For detailed security implementation, see [Security](security.md).
