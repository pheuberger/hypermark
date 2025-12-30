# Hypermark

A privacy-first bookmark manager with end-to-end encryption and device-to-device sync.

**No accounts. No servers storing your data. Just your bookmarks, encrypted and synced directly between your devices.**

## Features

- **Local-first**: Works fully offline, instant UI
- **End-to-end encrypted**: Only your devices can read your bookmarks
- **P2P sync**: Direct device-to-device sync via WebRTC
- **Zero-trust**: Signaling server never sees your data

## Quick Start

```bash
npm install
make dev
```

Open `http://localhost:5173`

## Cross-Device Testing

```bash
make remote    # Starts ngrok tunnels, opens browser
make stop      # Stops all services
```

Requires [ngrok](https://ngrok.com/) with tunnels configured. See [Getting Started](docs/getting-started.md).

## Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](docs/getting-started.md) | Setup, Makefile, testing |
| [Architecture](docs/architecture.md) | System design, data flow |
| [Security](docs/security.md) | Threat model, pairing protocol |
| [Specification](docs/specification.md) | Requirements, acceptance criteria |

## Tech Stack

Preact, Vite, Yjs, y-webrtc, IndexedDB, Web Crypto API, Tailwind CSS, DaisyUI

## License

MIT
