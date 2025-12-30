# Development Guide

This guide covers the setup, development workflow, and testing procedures for the Hypermark project.

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start local development:**
   ```bash
   make dev
   ```
   This starts the signaling server and Vite dev server. Navigate to `http://localhost:5173`.

## Makefile Workflow

The project uses a Makefile to manage development processes.

### Available Targets

| Command | Purpose |
|---------|---------|
| `make dev` | Local-only development (Signaling + Vite) |
| `make remote` | Full ngrok setup for cross-device testing |
| `make stop` | Graceful shutdown of all spawned processes |

### Local Mode (`make dev`)

- Starts signaling server on port 4444.
- Starts Vite dev server on port 5173.
- Automatically manages `.env.local` with `VITE_SIGNALING_URL=ws://localhost:4444`.
- Logs are merged into `logs/dev.log`.

### Remote Mode (`make remote`)

Used for testing sync between different devices (e.g., Laptop and Phone).

- Starts signaling server and Vite dev server.
- Starts ngrok tunnels for both services.
- Discovers tunnel URLs via ngrok API and updates `.env.local`.
- Automatically opens the browser to the ngrok Vite URL.

### Process Management (`make stop`)

- Kills all processes spawned by `make dev` or `make remote`.
- Uses PID files stored in `/tmp/hypermark-*.pid`.
- Does not affect other processes running on the same ports.

## ngrok Configuration

To use `make remote`, you must have ngrok installed and configured with the following tunnels in `~/.config/ngrok/ngrok.yml`:

```yaml
tunnels:
  vite:
    proto: http
    addr: 5173
  signaling:
    proto: http
    addr: 4444
```

The Makefile discovers the public URLs at runtime using the ngrok local API (`http://localhost:4040/api/tunnels`).

## Environment Variables

Configuration is handled via `.env` and `.env.local` files.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_SIGNALING_URL` | WebSocket URL for WebRTC signaling | `ws://localhost:4444` |

Note: `make dev` and `make remote` will overwrite `.env.local` on each run.

## Testing Multi-Device Sync

### Option 1: Same Machine
Open multiple browser tabs to the local or remote URL. They will sync via BroadcastChannel (same-tab) and WebRTC.

### Option 2: Different Devices on Same Network
1. Use `make dev`.
2. Find your local IP (`ip addr show`).
3. Manually set `VITE_SIGNALING_URL=ws://<LOCAL_IP>:4444` in `.env`.
4. Access `http://<LOCAL_IP>:5173` from other devices.

### Option 3: Remote Devices
Use `make remote` to expose both the app and signaling server via ngrok. Share the generated ngrok URL with the second device.

## Troubleshooting

- **Ports in use:** If ports 4444 or 5173 are occupied by other processes, the Makefile will fail. Use `make stop` or manually kill the conflicting processes.
- **Log inspection:** Check `logs/dev.log` for detailed output from signaling, Vite, and ngrok.
- **Stale PIDs:** If the app crashed, `make stop` will clean up stale PID files in `/tmp/`.
- **ngrok API:** Ensure ngrok is running if `make remote` fails to discover URLs.
