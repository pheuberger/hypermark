# Hypermark

A privacy-first, end-to-end encrypted bookmark manager with device-to-device sync.

## Development Setup

### Prerequisites

- Node.js 16+ and npm
- [ngrok](https://ngrok.com/) (optional, for cross-device testing)

### Local Development

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the signaling server:**
   ```bash
   npm run signaling
   ```
   This starts the Yjs WebRTC signaling server on port 4444.

3. **Start the dev server (in a separate terminal):**
   ```bash
   npm run dev
   ```

4. **Open the app:**
   Navigate to `http://localhost:5173`

### Testing with Multiple Devices

#### Option 1: Same Machine (Multiple Browser Tabs)

Open multiple tabs to `http://localhost:5173` - they will sync via BroadcastChannel and WebRTC.

#### Option 2: Different Devices on Same Network

1. Find your local IP:
   ```bash
   ip addr show | grep "inet " | grep -v 127.0.0.1
   ```

2. Update `.env`:
   ```bash
   VITE_SIGNALING_URL=ws://YOUR_LOCAL_IP:4444
   ```

3. Restart the dev server

4. Access from other devices using: `http://YOUR_LOCAL_IP:5173`

#### Option 3: Remote Devices (via ngrok)

1. **Start both servers** (as described above)

2. **Expose signaling server with ngrok:**
   ```bash
   ngrok http 4444
   ```
   Copy the ngrok URL (e.g., `https://abc123.ngrok-free.app`)

3. **Update `.env`:**
   ```bash
   VITE_SIGNALING_URL=wss://abc123.ngrok-free.app
   ```
   Note: Use `wss://` (WebSocket Secure) for ngrok HTTPS URLs

4. **Restart dev server** to pick up the new environment variable

5. **Expose dev server with ngrok (in another terminal):**
   ```bash
   ngrok http 5173
   ```
   Copy this URL (e.g., `https://def456.ngrok-free.app`)

6. **Access from any device:**
   Open `https://def456.ngrok-free.app` on both devices

7. **Pair devices** using the QR code pairing flow

## Environment Variables

Configuration is done via `.env` file. See `.env.example` for all options.

### `VITE_SIGNALING_URL`

WebRTC signaling server URL. Required for device-to-device sync.

- **Default:** `ws://localhost:4444`
- **ngrok:** `wss://your-tunnel.ngrok-free.app`
- **Production:** `wss://signaling.yourdomain.com`

## Architecture

- **Frontend:** Preact + Vite
- **Sync:** Yjs CRDTs with WebRTC for P2P sync
- **Storage:** IndexedDB for local persistence
- **Pairing:** PeerJS with end-to-end encryption using Web Crypto API

## Security

- All bookmark data is encrypted locally using AES-GCM
- Device pairing uses ECDH key exchange with verification words
- Signaling servers never see unencrypted data
- LEK (Ledger Encryption Key) is never transmitted without encryption
