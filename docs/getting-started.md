# Getting Started

This guide covers everything you need to set up a Hypermark development environment.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+ (20+ recommended)
- npm 9+
- [ngrok](https://ngrok.com/) (optional, for cross-device testing)

## Setup

```bash
git clone https://github.com/pheuberger/hypermark.git
cd hypermark
npm install
```

## Development

### Local Development

```bash
make dev
```

This starts:
- **Signaling server** on port 4444 (WebRTC peer discovery)
- **Vite dev server** on port 5173 (the app)

Navigate to [http://localhost:5173](http://localhost:5173). Logs are merged into `logs/dev.log`.

### Stop All Services

```bash
make stop
```

Gracefully kills all processes spawned by `make dev` or `make remote`. Uses PID files in `/tmp/hypermark-*.pid`.

## Makefile Commands

| Command | Purpose |
|---------|---------|
| `make dev` | Local development (signaling + Vite) |
| `make remote` | Cross-device testing via ngrok tunnels |
| `make stop` | Stop all Hypermark processes |

## Environment Variables

Configuration is handled via `.env` and `.env.local` files.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SIGNALING_URL` | WebSocket URL for WebRTC signaling | `ws://localhost:4444` |
| `VITE_SUGGESTION_URL` | Content suggestion service URL (optional) | Derived from signaling URL |

`make dev` and `make remote` overwrite `.env.local` automatically on each run. See `.env.example` for documentation.

## Cross-Device Testing

### Option 1: Same Machine

Open multiple browser tabs to `http://localhost:5173`. They sync via BroadcastChannel (same-origin) and WebRTC.

### Option 2: Same Network

1. Run `make dev`
2. Find your local IP (`ip addr show` or `ifconfig`)
3. Set `VITE_SIGNALING_URL=ws://<LOCAL_IP>:4444` in `.env.local`
4. Access `http://<LOCAL_IP>:5173` from other devices

### Option 3: Remote Devices (ngrok)

Requires ngrok installed and configured:

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

Then:

```bash
make remote    # Starts tunnels, discovers URLs, opens browser
make stop      # Stops everything
```

The Makefile discovers tunnel URLs via the ngrok local API (`http://localhost:4040/api/tunnels`) and writes the signaling URL to `.env.local`.

## Testing

```bash
npm test                 # Watch mode
npm run test:run         # Single run
npm run test:coverage    # With coverage report
npm run test:security    # Security-critical tests only
npm run test:ui          # Interactive test UI
```

See [Testing documentation](testing/README.md) for details on test structure, coverage requirements, and CI/CD integration.

## Building for Production

```bash
npm run build     # Outputs to dist/
npm run preview   # Preview the production build locally
```

The production build is configured for deployment to Netlify via `netlify.toml`.

## Signaling Server

The signaling server (in `services/`) handles WebRTC peer discovery and URL metadata extraction. It runs separately from the frontend:

```bash
npm run signaling              # Run locally on port 4444
cd services && fly deploy      # Deploy to Fly.io
```

See `services/Dockerfile` for the container configuration.

## Troubleshooting

- **Ports in use**: If ports 4444 or 5173 are occupied, `make dev` will fail. Run `make stop` or manually kill conflicting processes.
- **Stale PIDs**: If the app crashed, `make stop` cleans up stale PID files in `/tmp/`.
- **Log inspection**: Check `logs/dev.log` for output from signaling, Vite, and ngrok.
- **ngrok not working**: Ensure ngrok is running and configured before `make remote`. The Makefile queries `http://localhost:4040/api/tunnels`.
