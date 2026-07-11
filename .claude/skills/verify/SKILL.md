---
name: verify
description: Build, launch, and drive Hypermark to verify UI changes end-to-end.
---

# Verifying Hypermark changes

## Launch

```bash
npm install                      # fresh containers have no node_modules
npx vite --port 5199 --strictPort &   # dev server; ready in ~3s, serves on http://localhost:5199/
```

The app is fully usable without a signaling server or Nostr relays — sync
just stays offline. Console shows `ERR_TUNNEL_CONNECTION_FAILED` for the
WebRTC signaling websocket and Google favicon fetches in sandboxed
environments; that's environment noise, not app breakage.

## Drive (Playwright)

Chromium is pre-installed; `playwright` (npm) must be installed in a
scratch dir. Launch with:

```js
chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' })
// note: /opt/pw-browsers/chromium/ exists but has no chrome-linux/ inside — use the versioned dir
```

Useful contexts:
- Mobile: `{ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true }`
- Desktop: `{ viewport: { width: 1440, height: 900 } }`
- Keyboard-up simulation: viewport height ~450
- Clipboard flows need `permissions: ['clipboard-read', 'clipboard-write']`

## Flows worth driving

- Add bookmark: header "+ Add" button (`aria-label="Add bookmark"`) →
  AddBookmarkDialog (bottom sheet on mobile, centered dialog on sm+).
- Read Later filter: navigate to `#/?filter=readlater`.
- Bookmarks persist in IndexedDB (y-indexeddb) — a fresh context starts empty.
