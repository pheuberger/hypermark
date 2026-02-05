# Hypermark

**A privacy-first bookmark manager with end-to-end encryption and cross-device sync.**

No accounts. No servers storing your data. Your bookmarks are encrypted on your device and synced directly between your devices using peer-to-peer WebRTC and decentralized [Nostr](https://nostr.com/) relays.

---

## Why Hypermark?

Most bookmark managers require an account, store your data on their servers, and can read everything you save. Hypermark takes a different approach:

- **No accounts** -- pair devices with a one-time code, no email or password needed
- **End-to-end encrypted** -- bookmarks are encrypted with AES-256-GCM before leaving your device
- **Local-first** -- works fully offline, instant UI, your data lives on your device
- **Decentralized sync** -- no single server controls your data; Nostr relays only see encrypted blobs
- **Cross-browser, cross-device** -- works as a PWA on any modern browser (desktop + mobile)

## Features

- Full bookmark management (create, edit, delete, tag, search)
- Read-later inbox
- Full-text search (client-side, powered by [MiniSearch](https://github.com/lucaferber/minisearch))
- Import/export (HTML and JSON)
- Keyboard shortcuts (`Cmd+K` search, `Ctrl+Z` undo, arrow navigation)
- Real-time P2P sync via WebRTC (sub-second when both devices are online)
- Async cloud sync via Nostr relays (works when devices are on different schedules)
- Automatic CRDT conflict resolution (concurrent edits on different devices merge cleanly)
- Configurable Nostr relays with status monitoring
- Sync diagnostics and troubleshooting tools
- Dark theme, responsive layout, installable as a PWA

---

## Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- npm 9+

### Install and Run

```bash
git clone https://github.com/pheuberger/hypermark.git
cd hypermark
npm install
make dev
```

Open [http://localhost:5173](http://localhost:5173).

`make dev` starts both the WebRTC signaling server (port 4444) and the Vite dev server (port 5173). Logs are written to `logs/dev.log`.

### Stop

```bash
make stop
```

### Cross-Device Testing

To test sync between devices (e.g. laptop and phone), you need [ngrok](https://ngrok.com/) configured with tunnels for ports 5173 and 4444:

```yaml
# ~/.config/ngrok/ngrok.yml
tunnels:
  vite:
    proto: http
    addr: 5173
  signaling:
    proto: http
    addr: 4444
```

Then run:

```bash
make remote    # Starts ngrok tunnels and opens the browser
make stop      # Stops everything
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SIGNALING_URL` | WebSocket URL for the WebRTC signaling server | `ws://localhost:4444` |
| `VITE_SUGGESTION_URL` | Content suggestion service URL (optional) | Derived from signaling URL |

Copy `.env.example` to `.env.local` to override. `make dev` and `make remote` manage `.env.local` automatically.

---

## How It Works

### Device Pairing

1. Open Hypermark on your first device and go to **Settings > Device pairing**
2. Click **Show Pairing Code** -- a code like `42-apple-river` appears
3. On your second device, enter the code under **Enter Pairing Code**
4. Devices exchange encryption keys over a secure channel and start syncing

The pairing code creates a temporary encrypted WebRTC channel. The Ledger Encryption Key (LEK) is transferred via ECDH key exchange. Codes expire after 5 minutes.

### Sync Architecture

Hypermark uses two complementary sync mechanisms that both feed into the same [Yjs](https://github.com/yjs/yjs) CRDT document:

```
Device A                              Device B
    |                                     |
    +---> WebRTC (real-time, <1s) <-------+
    |                                     |
    +---> Nostr Relays (async, E2E) <-----+
```

- **WebRTC P2P**: Sub-second sync when both devices are online simultaneously
- **Nostr Cloud**: Encrypted events (kind 30053) stored on decentralized relays for async sync

Changes merge automatically via CRDT -- no manual conflict resolution needed.

### Encryption

All bookmark content is encrypted with **AES-256-GCM** before leaving the device. The encryption key (LEK) never leaves your paired devices. From the LEK, Hypermark derives:

- A **Yjs room password** (via HKDF) for WebRTC encryption
- A **Nostr keypair** (secp256k1, via HKDF) for signing and publishing encrypted events

Relay operators, signaling servers, and network observers see only encrypted data.

For a deeper dive, see [Security Architecture](docs/security.md) and [Nostr Sync Architecture](docs/nostr-sync-architecture.md).

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [React](https://react.dev/) 18 + [Vite](https://vite.dev/) 7 |
| State / Sync | [Yjs](https://github.com/yjs/yjs) (CRDT) |
| P2P Transport | [y-webrtc](https://github.com/yjs/y-webrtc) (WebRTC data channels) |
| Cloud Sync | [Nostr](https://nostr.com/) protocol (kind 30053 events) |
| Encryption | Web Crypto API (AES-256-GCM, ECDH, HKDF) + [secp256k1](https://github.com/paulmillr/noble-secp256k1) |
| Local Storage | IndexedDB (via [y-indexeddb](https://github.com/yjs/y-indexeddb)) |
| Search | [MiniSearch](https://github.com/lucaferber/minisearch) (client-side full-text) |
| Styling | [Tailwind CSS](https://tailwindcss.com/) v4 + [Radix UI](https://www.radix-ui.com/) primitives |
| Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |
| Deployment | [Netlify](https://www.netlify.com/) (frontend) + [Fly.io](https://fly.io/) (signaling server) |

---

## Project Structure

```
hypermark/
├── src/
│   ├── components/          # React components
│   │   ├── bookmarks/       # Bookmark list, items, forms, tags
│   │   ├── pairing/         # Device pairing flow
│   │   └── ui/              # Shared UI primitives (Button, Modal, etc.)
│   ├── hooks/               # React hooks
│   │   ├── useYjs.js        # Yjs document, WebRTC + IndexedDB providers
│   │   ├── useNostrSync.js  # Nostr sync integration
│   │   ├── useSearch.js     # Full-text search
│   │   └── useHotkeys.js    # Keyboard shortcuts
│   ├── services/            # Core business logic
│   │   ├── bookmarks.js     # Bookmark CRUD
│   │   ├── crypto.js        # Cryptographic primitives (LEK, AES-GCM, ECDH)
│   │   ├── nostr-sync.js    # Nostr relay sync service
│   │   ├── nostr-crypto.js  # Nostr keypair derivation (secp256k1)
│   │   ├── key-storage.js   # IndexedDB key persistence
│   │   ├── bookmark-io.js   # Import/export (HTML, JSON)
│   │   └── search-index.js  # MiniSearch integration
│   ├── test-utils/          # Test helpers and mocks
│   ├── app.jsx              # Root component
│   └── main.jsx             # Entry point
├── services/                # Backend (signaling + suggestion API)
│   ├── server.js            # WebSocket signaling server
│   ├── metadata.js          # URL metadata extraction
│   └── Dockerfile           # Container for Fly.io deployment
├── docs/                    # Documentation
├── public/                  # Static assets (PWA manifest, service worker)
├── .github/workflows/       # CI/CD (tests, security, performance)
├── Makefile                 # Development commands (dev, remote, stop)
├── vite.config.js           # Vite build configuration
└── vitest.config.js         # Test configuration
```

---

## Testing

```bash
npm test                 # Run tests in watch mode
npm run test:run         # Run all tests once
npm run test:coverage    # Run with coverage report
npm run test:security    # Security-critical tests only
npm run test:ui          # Interactive test UI
```

### Coverage Requirements

- **Global**: 45% lines, 60% functions, 75% branches
- **Security-critical files** (`crypto.js`, `pairing-code.js`, `key-storage.js`): **95% minimum**

### CI/CD

Three GitHub Actions workflows run automatically:

1. **test.yml** -- runs on every push/PR: full test suite + build
2. **security-tests.yml** -- triggered by changes to crypto files: enforces 95% coverage
3. **performance.yml** -- weekly benchmarks for sync speed and memory usage

---

## Deployment

### Frontend (Netlify)

The app is configured for Netlify deployment via `netlify.toml`:

```bash
npm run build    # Outputs to dist/
```

### Signaling Server (Fly.io)

The signaling server runs as a Node.js WebSocket service:

```bash
cd services
fly deploy       # Deploy to Fly.io (requires fly CLI)
```

Or run locally:

```bash
npm run signaling    # Starts on port 4444
```

### Self-Hosting

You can self-host both components:

1. **Frontend**: Any static hosting (Netlify, Vercel, Cloudflare Pages, nginx, etc.)
2. **Signaling server**: Any Node.js host -- see `services/Dockerfile`
3. **Nostr relays**: Optionally run your own relay for full control over encrypted data storage

Set `VITE_SIGNALING_URL` to point to your signaling server.

---

## Documentation

| Document | Description |
|----------|-------------|
| [Getting Started](docs/getting-started.md) | Development setup, Makefile workflow, multi-device testing |
| [Architecture](docs/architecture.md) | System design, tech stack, data flow, component overview |
| [Security](docs/security.md) | Threat model, pairing protocol, attack scenarios |
| [Sync Guide](docs/sync-guide.md) | User guide for pairing, relay config, troubleshooting |
| [Nostr Sync Architecture](docs/nostr-sync-architecture.md) | Deep dive into hybrid sync, CRDT integration, Nostr events |
| [Testing](docs/testing/README.md) | Test infrastructure, coverage requirements, CI/CD |
| [Contributing](CONTRIBUTING.md) | How to contribute to Hypermark |

---

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on setting up the development environment, running tests, and submitting pull requests.

---

## License

[MIT](LICENSE)
