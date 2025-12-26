# Hypermark Implementation Design

**Date:** 2025-12-26
**Status:** Ready for Implementation
**Based on:** todo.md, FINDINGS.md, security.md

---

## Executive Summary

This document details the implementation design for Hypermark, a local-first E2EE bookmarking PWA. The design builds on validated prototypes (prototype-peerjs.html, prototype-webrtc.html) and locks down all critical implementation decisions.

**Core Tech Stack:**
- Frontend: Preact + Vite + Tailwind CSS
- Storage: Fireproof (@fireproof/core) with native sync format
- Search: MiniSearch (full-text with ranking)
- Networking: PeerJS for WebRTC signaling
- Crypto: Web Crypto API (non-extractable keys)

---

## 1. Architecture Overview

### System Layers

```
┌─────────────────────────────────────────┐
│         UI Layer (Preact)               │
│  Bookmarks • Search • Pairing • Sync    │
├─────────────────────────────────────────┤
│       Data Layer (Fireproof)            │
│  Storage • Indexing • CRDT Merging      │
├─────────────────────────────────────────┤
│      Search Layer (MiniSearch)          │
│  Full-text indexing • Fuzzy search      │
├─────────────────────────────────────────┤
│      Network Layer (PeerJS)             │
│  WebRTC • Signaling • Connection Mgmt   │
├─────────────────────────────────────────┤
│      Crypto Layer (Web Crypto API)      │
│  Device Keys • LEK • ECDH • AES-GCM     │
└─────────────────────────────────────────┘
```

### Key Design Decisions

**Decision 1: Use Fireproof's Native Sync Format**
- Leverage built-in clock/commit system
- No custom application-level delta format
- Simpler implementation, less maintenance

**Decision 2: PeerJS for MVP Transport**
- Proven in prototype (prototype-peerjs.html)
- Free hosted signaling (0.peerjs.com)
- Persistent peer IDs enable auto-reconnect
- Can self-host later if needed

**Decision 3: WebCrypto Non-Extractable Keys**
- Device identity keypair stored securely
- LEK stored as non-extractable
- Best security posture
- Trade-off: Re-pairing required for device migration

**Decision 4: Authorization List in Fireproof**
- Device list stored as `_device` documents
- Syncs automatically with bookmark data
- All devices see unified peer list
- Unpair actions propagate naturally

**Decision 5: MiniSearch for Search**
- Full-featured search (fuzzy, ranking, stemming)
- Only ~5KB bundle size
- Better UX than basic token matching
- Runs in main thread (fast enough for 1k bookmarks)

### Performance Targets

- **App cold start:** <1s to usable list
- **Local operations:** <50ms (add/tag/search)
- **Sync handshake:** <2s for connection
- **Bundle size:** <150KB total compressed
- **Storage:** Support 1000+ bookmarks (~5MB)

---

## 2. Component Structure

### File Organization

```
src/
├── main.jsx                 # App entry, Fireproof init
├── App.jsx                  # Root component, routing
├── components/
│   ├── bookmarks/
│   │   ├── BookmarkList.jsx       # Main list view with filters
│   │   ├── BookmarkItem.jsx       # Single bookmark card
│   │   ├── BookmarkForm.jsx       # Add/edit modal
│   │   └── BookmarkSearch.jsx     # Search bar + filters
│   ├── pairing/
│   │   ├── PairingFlow.jsx        # Pairing orchestrator
│   │   ├── QRCodeDisplay.jsx      # Show QR + verification words
│   │   ├── QRScanner.jsx          # Camera scanning
│   │   └── ManualPairing.jsx      # Text input fallback
│   ├── sync/
│   │   ├── ConnectionStatus.jsx   # Indicator badge
│   │   ├── DeviceList.jsx         # Paired devices management
│   │   └── SyncButton.jsx         # Manual sync trigger
│   └── ui/
│       ├── Modal.jsx              # Reusable modal
│       ├── Button.jsx             # Styled buttons
│       ├── Input.jsx              # Form inputs
│       └── Tag.jsx                # Tag chips
├── hooks/
│   ├── useFireproof.js            # Fireproof integration
│   ├── useSearch.js               # MiniSearch wrapper
│   ├── usePeerSync.js             # PeerJS + sync logic
│   └── usePairing.js              # Pairing flow state
├── services/
│   ├── crypto.js                  # WebCrypto utils, ECDH
│   ├── sync-protocol.js           # Commit exchange logic
│   ├── search-index.js            # MiniSearch setup
│   └── wordlist.js                # EFF wordlist for verification
├── utils/
│   ├── qr.js                      # QR encode/decode
│   └── device-id.js               # Device identity management
└── styles/
    └── globals.css                # Tailwind + custom styles
```

### Component Responsibilities

**App.jsx** - Root container
- Initializes Fireproof database
- Manages view routing (Bookmarks | Pairing | Settings)
- Renders ConnectionStatus badge
- Provides app-level context

**BookmarkList.jsx** - Main UI
- Uses `useLiveQuery` for reactive updates
- Implements filters: All / Read Later / By Tag
- Sorting: Recent / Oldest / Title
- Virtual scrolling for 1k+ items
- Delegates rendering to `BookmarkItem`

**BookmarkForm.jsx** - Add/Edit dialog
- Modal overlay (uses ui/Modal.jsx)
- Fields: URL, title, description, tags[], readLater
- URL validation and normalization
- Optional: Auto-fetch metadata from URL
- Calls `database.put()` on submit

**BookmarkSearch.jsx** - Search interface
- Input with 300ms debounce
- Integrates with `useSearch` hook
- Shows result count and filters
- Can combine search + tag filters

**PairingFlow.jsx** - Pairing orchestrator
- State machine: Initial → Generating/Scanning → Verifying → Complete
- Routes to QRCodeDisplay or QRScanner based on role
- Shows word verification comparison screen
- Handles LEK transfer and completion

**QRCodeDisplay.jsx** - Initiator view
- Generates ephemeral keypair
- Encodes pairing payload as QR
- Shows QR + verification words + short code fallback
- "Copy to clipboard" button for manual pairing

**QRScanner.jsx** - Responder view
- Camera permission request
- QR scanning (use qr-scanner library)
- Parses payload, initiates connection
- Fallback to ManualPairing if camera denied

**ManualPairing.jsx** - No-camera fallback
- Text field for short code: `HYPER-abc123...`
- Text area for full JSON paste
- Validates and parses payload
- Continues to same verification flow

**ConnectionStatus.jsx** - Status indicator
- Badge: Offline | Connecting | Connected (N devices)
- Color coding: gray | yellow | green
- Clickable to show DeviceList modal
- Updates from `usePeerSync` hook

**DeviceList.jsx** - Device management
- Lists all paired devices from Fireproof `_device` docs
- Shows: name, pairedAt, lastSeen
- "Unpair" button creates `_device_revoked` tombstone
- Explains: "Unpaired devices can't sync new data"

---

## 3. Data Flow & Sync Protocol

### Local Operations Flow

```
User Action → UI Component → Fireproof database.put()
                                    ↓
                            Encrypted commit created
                                    ↓
                            IndexedDB persisted
                                    ↓
                    useLiveQuery hook triggered
                                    ↓
                            UI re-renders
                                    ↓
                    MiniSearch index updated
                                    ↓
                If peers connected → Sync triggered
```

### Bookmark Document Schema

```javascript
{
  _id: "bookmark:uuid-v4",
  type: "bookmark",
  url: "https://example.com",
  title: "Example Domain",
  description: "An illustrative example...",
  tags: ["reference", "docs"],
  readLater: false,
  createdAt: 1703265678000,
  updatedAt: 1703265999000,
  favicon: null,  // Optional: URL or data URI
  preview: null   // Optional: metadata object
}
```

### Device Document Schema

```javascript
{
  _id: "device:uuid-v4",
  type: "_device",
  publicKey: "base64-encoded-public-key",
  name: "My iPhone",
  pairedAt: 1703265678000,
  lastSeen: 1703265999000
}

// Revoked device
{
  _id: "device:uuid-v4",
  type: "_device_revoked",
  revokedAt: 1703266000000,
  reason: "Device lost"
}
```

### Sync Protocol (PeerJS + Fireproof)

**Phase 1: Connection Establishment**

Device A initiates:
```javascript
const conn = peer.connect(deviceB_peerId)
conn.on('open', () => {
  conn.send({
    type: 'hello',
    deviceId: myDeviceId,
    publicKey: myPublicKey
  })
})
```

Device B receives and validates:
```javascript
conn.on('data', async (msg) => {
  if (msg.type === 'hello') {
    // Check if publicKey matches stored _device doc
    const deviceDoc = await db.get(`device:${msg.deviceId}`)
    if (deviceDoc.publicKey === msg.publicKey) {
      // Authorized! Proceed to sync
      sendSyncState(conn)
    } else {
      conn.close() // Unauthorized
    }
  }
})
```

**Phase 2: State Exchange**

Both devices exchange Fireproof clock state:
```javascript
{
  type: 'sync-state',
  clock: fireproofDb.clock,  // Fireproof's internal clock
  headCommits: [...commitIds]
}
```

**Phase 3: Diff Calculation**

Each device compares peer's clock with local clock to determine missing commits:
```javascript
const missingCommits = calculateMissing(peerClock, myClock)
```

**Phase 4: Commit Transfer**

Request missing commits:
```javascript
{
  type: 'sync-request',
  commitIds: [...missingIds]
}
```

Send commit data:
```javascript
{
  type: 'sync-data',
  commits: [
    { id: '...', data: '...encrypted...', clock: {...} },
    ...
  ]
}
```

**Phase 5: Apply & Merge**

Apply commits via Fireproof:
```javascript
for (const commit of commits) {
  await db.importCommit(commit)  // Fireproof handles merging
}
```

Fireproof's CRDT ensures deterministic merge:
- Tags: Set CRDT (add-wins)
- LWW fields (title, description, readLater): Clock-based tie-breaking
- Conflicts resolved automatically

**Phase 6: Continuous Sync**

Connection stays open:
```javascript
// On local change
db.subscribe((change) => {
  if (conn.open) {
    conn.send({
      type: 'sync-data',
      commits: [change.commit]
    })
  }
})
```

### Merge Semantics

**Tags (Set CRDT):**
- Add operation: Always wins
- Remove operation: Creates tombstone
- Both devices add different tags: Both survive
- Device A adds, Device B removes: Add wins

**LWW Fields (title, description, readLater):**
- Last-write-wins based on Fireproof's clock
- Clock is vector clock or Lamport timestamp
- Tie-break by device ID (deterministic)

**URL Field:**
- Treated as immutable after creation
- Concurrent edits unlikely (same bookmark ID)

---

## 4. Pairing & Security Design

### Key Material Overview

**Per-Device Keys:**

1. **Device Identity Keypair** (permanent)
   - Type: ECDH P-256
   - Storage: WebCrypto non-extractable
   - Purpose: Device authentication, ECDH operations
   - Generated: On first app launch

2. **LEK (Ledger Encryption Key)** (shared)
   - Type: AES-256-GCM symmetric key
   - Storage: WebCrypto non-extractable
   - Purpose: Encrypt/decrypt all Fireproof data
   - Generated: By first device, distributed during pairing

3. **Ephemeral Pairing Keypair** (temporary)
   - Type: ECDH P-256
   - Lifetime: 5 minutes
   - Purpose: Derive session key for LEK transfer
   - Destroyed: After pairing completes

**PeerJS Identity:**
- Stable peer ID in localStorage
- Maps to device identity keypair
- Enables reconnection after restart

### Full Pairing Protocol

**Phase 1: Initiate Pairing (Device A)**

User clicks "Pair New Device":

1. Generate ephemeral keypair:
```javascript
const A_eph = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  true,  // extractable (for export)
  ['deriveKey']
)
```

2. Create pairing session:
```javascript
const session = {
  sessionId: crypto.randomUUID(),
  ephemeralPublicKey: await exportPublicKey(A_eph.publicKey),
  peerID: myPeerId,
  deviceName: myDeviceName,
  expires: Date.now() + 300000  // 5 min
}
```

3. Encode as QR code + display
4. Derive verification words (show below)
5. Listen for incoming PeerJS connection

**Phase 2: Scan QR (Device B)**

User clicks "Scan to Pair":

1. Request camera permission
2. Scan QR → parse session data
3. Generate own ephemeral keypair: `B_eph`
4. Connect to Device A via PeerJS: `peer.connect(session.peerID)`
5. Send handshake:
```javascript
{
  type: 'pairing-handshake',
  sessionId: session.sessionId,
  ephemeralPublicKey: await exportPublicKey(B_eph.publicKey),
  deviceName: myDeviceName
}
```

**Phase 3: ECDH Key Agreement**

Both devices compute shared secret:

```javascript
// Derive shared secret via ECDH
const sharedSecret = await crypto.subtle.deriveKey(
  { name: 'ECDH', public: theirEphemeralPublicKey },
  myEphemeralPrivateKey,
  { name: 'AES-GCM', length: 256 },
  false,  // non-extractable
  ['encrypt', 'decrypt']
)

// Derive session key using HKDF
const sessionKey = await crypto.subtle.deriveKey(
  {
    name: 'HKDF',
    hash: 'SHA-256',
    salt: sessionId,
    info: new TextEncoder().encode('hypermark-pairing-v1')
  },
  sharedSecret,
  { name: 'AES-GCM', length: 256 },
  false,
  ['encrypt', 'decrypt']
)
```

**Phase 4: Verification Words**

Both devices derive verification words from session key:

```javascript
// services/crypto.js
import { wordlist } from './wordlist.js'  // EFF short wordlist (1296 words)

async function deriveVerificationWords(sessionKey, sessionId) {
  const data = new TextEncoder().encode(sessionId + 'verify')
  const signature = await crypto.subtle.sign(
    'HMAC',
    sessionKey,
    data
  )
  const bytes = new Uint8Array(signature)

  // Use first 4 bytes to derive 2 word indices
  const index1 = ((bytes[0] << 8) | bytes[1]) % 1296
  const index2 = ((bytes[2] << 8) | bytes[3]) % 1296

  return [wordlist[index1], wordlist[index2]]
}
```

Both devices show verification words:
```
┌─────────────────────┐
│  Verify Pairing     │
├─────────────────────┤
│                     │
│   mountain  river   │
│                     │
│  Confirm these      │
│  words match on     │
│  the other device   │
│                     │
│  [They Match]       │
│  [Don't Match]      │
└─────────────────────┘
```

**Phase 5: LEK Transfer**

Device A (after B confirms match):

```javascript
// Export LEK from WebCrypto
const lekRaw = await crypto.subtle.exportKey('raw', storedLEK)

// Encrypt LEK with session key
const iv = crypto.getRandomValues(new Uint8Array(12))
const aad = new TextEncoder().encode(
  sessionId + deviceId_A + deviceId_B
)
const encryptedLEK = await crypto.subtle.encrypt(
  { name: 'AES-GCM', iv, additionalData: aad },
  sessionKey,
  lekRaw
)

// Send pairing complete message
conn.send({
  type: 'pairing-complete',
  encrypted_lek: arrayBufferToBase64(encryptedLEK),
  iv: arrayBufferToBase64(iv),
  deviceId: deviceId_A,
  identityPublicKey: await exportPublicKey(myDeviceKeypair.publicKey),
  deviceName: myDeviceName,
  ledgerId: 'default',
  authorizedDevices: await db.query({ type: '_device' })
})
```

**Phase 6: Import LEK (Device B)**

```javascript
// Decrypt LEK
const aad = new TextEncoder().encode(
  sessionId + deviceId_A + deviceId_B
)
const lekRaw = await crypto.subtle.decrypt(
  { name: 'AES-GCM', iv, additionalData: aad },
  sessionKey,
  encryptedLEK
)

// Import LEK into WebCrypto
const lek = await crypto.subtle.importKey(
  'raw',
  lekRaw,
  { name: 'AES-GCM', length: 256 },
  false,  // non-extractable!
  ['encrypt', 'decrypt']
)

// Store in indexed storage (key name)
await storeKeyReference('lek', lek)

// Store device metadata in Fireproof
await db.put({
  _id: `device:${deviceId_A}`,
  type: '_device',
  publicKey: identityPublicKey_A,
  name: deviceName_A,
  pairedAt: Date.now(),
  lastSeen: Date.now()
})

await db.put({
  _id: `device:${myDeviceId}`,
  type: '_device',
  publicKey: await exportPublicKey(myDeviceKeypair.publicKey),
  name: myDeviceName,
  pairedAt: Date.now(),
  lastSeen: Date.now()
})

// Destroy ephemeral keys (garbage collection)
A_eph = B_eph = sessionKey = null

// Send acknowledgment
conn.send({
  type: 'pairing-ack',
  deviceId: myDeviceId,
  identityPublicKey: await exportPublicKey(myDeviceKeypair.publicKey),
  deviceName: myDeviceName
})
```

**Phase 7: Finalize (Device A)**

Receives pairing-ack from Device B:

```javascript
// Store Device B's metadata
await db.put({
  _id: `device:${deviceId_B}`,
  type: '_device',
  publicKey: identityPublicKey_B,
  name: deviceName_B,
  pairedAt: Date.now(),
  lastSeen: Date.now()
})

// Show success UI
showNotification('Pairing complete! Now syncing...')

// Initiate normal sync connection
startSync(conn)
```

### Manual Pairing (No Camera)

For devices without cameras or camera permission denied:

**Device A shows:**
1. QR code (primary)
2. Short code: `HYPER-abc123-def456-ghi789` (Base58, ~35 chars)
3. "Copy Full Payload" button (JSON string)

**Device B input options:**
1. Scan QR (primary)
2. Enter short code manually
3. Paste full JSON payload

**Short code encoding:**
```javascript
// utils/qr.js
function encodeShortCode(session) {
  const payload = JSON.stringify(session)
  const compressed = pako.deflate(payload)  // Optional compression
  const base58 = bs58.encode(compressed)
  return `HYPER-${base58.match(/.{1,6}/g).join('-')}`
}
```

**Critical:** Verification words still required!
- Even with manual entry, both devices show words
- User must confirm match
- Prevents clipboard/keylogger compromise

### Security Properties

**Confidentiality:**
- LEK never transmitted in plaintext
- Session key derived from ECDH (perfect forward secrecy)
- WebRTC DTLS provides additional transport encryption
- Non-extractable keys prevent key export

**Authentication:**
- Verification words prevent MITM during pairing
- QR provides out-of-band channel
- Device identity keys enable ongoing authentication
- Sync connections verify against device list

**Integrity:**
- AES-GCM provides authenticated encryption
- AAD binds encryption to session and device IDs
- Fireproof commits are content-addressed (tamper-evident)

**Threat Mitigation:**
- **Network eavesdropper:** Cannot see LEK (encrypted with SK)
- **Compromised WiFi/Evil twin:** Verification words will differ
- **Compromised PeerJS server:** Cannot decrypt pairing messages
- **QR intercept:** Useless without verification confirmation
- **Replay attack:** sessionId + expiry prevents reuse
- **Device theft:** Revoke via device list, but local data remains (device security boundary)

---

## 5. Error Handling & Edge Cases

### Network Failures

**During Pairing:**
- **Connection drops before verification:**
  Abort cleanly, show "Connection lost, please try again"

- **Connection drops after verification, before LEK transfer:**
  Device A retries for 30s with exponential backoff, then aborts

- **Connection drops after LEK transferred:**
  Device B checks if LEK imported successfully
  If yes → complete pairing and mark successful
  If no → show error and retry option

- **Pairing timeout (5 min expiry):**
  Ephemeral keys expire
  Show "Pairing session expired" with "Start New Pairing" button

**During Sync:**
- **Connection drops mid-sync:**
  Keep partial commits already applied (idempotent)
  Mark sync as "incomplete" in UI
  Auto-retry every 5s for 1 minute

- **Auto-reconnect:**
  PeerJS handles WebRTC reconnection automatically
  Resume sync from last known clock state
  Fireproof deduplicates commits by ID

- **UI indicators:**
  "Syncing..." → "Connection lost" → "Reconnecting..." → "Synced"

### Fireproof Errors

**Database initialization fails:**
```javascript
try {
  const db = await Fireproof.open('hypermark')
} catch (err) {
  console.error('Fireproof init failed:', err)
  showError('Could not open local database. Try clearing app data.')
  // Offer: Export → Clear Data → Retry
}
```

**Encryption/Decryption failures:**
- **LEK missing from WebCrypto:**
  Treat as unpaired device
  Show onboarding: "Set up your bookmark vault"
  Generate new LEK or enter pairing flow

- **Decrypt failure on document:**
  Log error, skip document
  Show: "Some bookmarks couldn't be loaded (X errors)"
  Offer: "View error details" → list corrupted doc IDs

**Merge conflicts:**
- Fireproof handles automatically via CRDT
- No user intervention needed for standard conflicts
- UI shows "Syncing..." briefly during merge
- Final state appears after merge completes

### Browser/Device Limitations

**iOS Safari PWA:**
- **Background throttling:**
  Accept sync only works in foreground
  Show: "Keep app open to sync"

- **Connection killed when backgrounded:**
  Detect with Page Visibility API
  Auto-reconnect when app returns to foreground
  Show: "Reconnecting..." badge

- **Storage limits (~50MB):**
  Monitor via `navigator.storage.estimate()`
  Warn at 80% capacity
  Offer: "Delete old bookmarks" or "Export & clear"

**Storage quota exceeded:**
```javascript
const estimate = await navigator.storage.estimate()
const percentUsed = (estimate.usage / estimate.quota) * 100

if (percentUsed > 80) {
  showWarning('Storage is 80% full. Consider archiving old bookmarks.')
}
```

**WebCrypto unavailable:**
```javascript
if (!window.crypto?.subtle) {
  showError('This browser does not support required encryption features.')
  showMessage('Please use Chrome, Firefox, Safari, or Edge.')
  // Block app initialization
  return
}
```

**Camera permission denied:**
```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ video: true })
  // ... scanning logic
} catch (err) {
  if (err.name === 'NotAllowedError') {
    showInfo('Camera access denied. Use manual pairing instead.')
    switchToManualPairing()
  }
}
```

### Data Integrity

**Duplicate bookmarks (same URL):**
```javascript
// On add, check for existing
const existing = await db.query({
  type: 'bookmark',
  url: normalizeUrl(inputUrl)
})

if (existing.length > 0) {
  showDialog({
    title: 'Bookmark exists',
    message: 'This URL is already bookmarked.',
    actions: [
      { label: 'Open existing', onClick: () => openBookmark(existing[0]) },
      { label: 'Add anyway', onClick: () => createBookmark() }
    ]
  })
}
```

**Invalid bookmark data:**
```javascript
// Validate before persisting
function validateBookmark(data) {
  if (!data.url || !isValidUrl(data.url)) {
    throw new Error('Invalid URL')
  }
  if (!data.title?.trim()) {
    throw new Error('Title is required')
  }
  // Normalize
  data.url = normalizeUrl(data.url)
  data.tags = data.tags.filter(t => t.trim()).map(t => t.toLowerCase())
  return data
}
```

**Malformed sync messages:**
```javascript
conn.on('data', (msg) => {
  try {
    if (!msg.type || typeof msg.type !== 'string') {
      throw new Error('Invalid message format')
    }
    handleMessage(msg)
  } catch (err) {
    console.error('Malformed message:', err)
    // Log error, ignore message, keep connection alive
  }
}
```

### Security Edge Cases

**Device removed from authorized list:**
```javascript
// During sync handshake
const peerDevice = await db.get(`device:${msg.deviceId}`)

if (!peerDevice || peerDevice.type === '_device_revoked') {
  conn.send({ type: 'error', message: 'Device unauthorized' })
  conn.close()
  showError('This device has been unpaired. Please pair again.')
}
```

**Verification words mismatch:**
```javascript
// User clicks "Words don't match"
function handleVerificationFailed() {
  conn.close()
  destroyEphemeralKeys()
  showError('Pairing failed: verification codes did not match.')
  showInfo('This protects against network attacks. Please try again.')
}
```

**Multiple pairing attempts (rate limiting):**
```javascript
const failedAttempts = []

function recordFailedPairing() {
  failedAttempts.push(Date.now())

  // Clean old attempts (>5 min ago)
  const recent = failedAttempts.filter(t => Date.now() - t < 300000)

  if (recent.length >= 3) {
    showError('Too many failed pairing attempts. Please wait 5 minutes.')
    return true  // Rate limited
  }
  return false
}
```

**Stolen device revocation:**
```javascript
// On remaining device
async function unpairDevice(deviceId) {
  // Create revocation tombstone
  await db.put({
    _id: `device:${deviceId}`,
    type: '_device_revoked',
    revokedAt: Date.now(),
    reason: 'Device removed by user'
  })

  showInfo('Device unpaired. It can no longer sync new data.')
  showWarning('Note: The device still has local data and encryption keys.')
}
```

### UI/UX Edge Cases

**First run (no LEK):**
```javascript
async function initializeApp() {
  const hasLEK = await checkForLEK()

  if (!hasLEK) {
    // First device - generate LEK
    const lek = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      false,  // non-extractable
      ['encrypt', 'decrypt']
    )
    await storeKeyReference('lek', lek)

    // Create initial device doc
    await db.put({
      _id: `device:${myDeviceId}`,
      type: '_device',
      publicKey: await exportPublicKey(myDeviceKeypair.publicKey),
      name: myDeviceName,
      pairedAt: Date.now(),
      lastSeen: Date.now()
    })

    showOnboarding('Your secure bookmark vault is ready!')
  }
}
```

**App open in multiple tabs:**
```javascript
// Use BroadcastChannel for tab coordination
const channel = new BroadcastChannel('hypermark-sync')

// Leader election: only one tab maintains PeerJS connections
const tabId = crypto.randomUUID()
let isLeader = false

channel.addEventListener('message', (event) => {
  if (event.data.type === 'leader-ping') {
    if (isLeader) {
      channel.postMessage({ type: 'leader-pong', tabId })
    }
  }
})

// Fireproof handles multi-tab data sync automatically
```

**Very slow network:**
```javascript
let syncTimeout = setTimeout(() => {
  showDialog({
    title: 'Sync is taking a while',
    message: 'Network connection seems slow.',
    actions: [
      { label: 'Keep waiting', onClick: () => extendTimeout() },
      { label: 'Cancel', onClick: () => abortSync() }
    ]
  })
}, 60000)  // 60s timeout
```

**Search with no results:**
```javascript
if (searchResults.length === 0) {
  return (
    <div class="empty-state">
      <p>No bookmarks found for "{query}"</p>
      <button onClick={clearFilters}>Clear filters</button>
      <button onClick={openAddForm}>Add new bookmark</button>
    </div>
  )
}
```

**Empty state (no bookmarks):**
```javascript
if (bookmarks.length === 0) {
  return (
    <div class="onboarding">
      <h2>Welcome to Hypermark!</h2>
      <p>Start by adding your first bookmark.</p>
      <button onClick={openAddForm}>Add Bookmark</button>
    </div>
  )
}
```

### Performance Edge Cases

**1000+ bookmarks:**
```javascript
// Virtual scrolling in BookmarkList
import { VirtualList } from 'preact-virtual-list'

function BookmarkList({ bookmarks }) {
  return (
    <VirtualList
      data={bookmarks}
      renderRow={(bookmark) => <BookmarkItem bookmark={bookmark} />}
      rowHeight={80}
      overscanCount={5}
    />
  )
}

// Debounced search
const debouncedSearch = useMemo(
  () => debounce((query) => setSearchQuery(query), 300),
  []
)
```

**Large first sync:**
```javascript
// Show progress during bulk import
let imported = 0
const total = commits.length

for (const commit of commits) {
  await db.importCommit(commit)
  imported++

  if (imported % 50 === 0) {
    updateProgress(`Syncing: ${imported}/${total}`)
    await new Promise(resolve => setTimeout(resolve, 0))  // Yield to UI
  }
}
```

**MiniSearch index rebuild:**
```javascript
// Build index in chunks to avoid blocking
async function rebuildSearchIndex(documents) {
  const miniSearch = new MiniSearch({
    fields: ['title', 'description', 'tags'],
    storeFields: ['_id', 'title', 'url']
  })

  showProgress('Building search index...')

  // Add in batches of 100
  for (let i = 0; i < documents.length; i += 100) {
    const batch = documents.slice(i, i + 100)
    miniSearch.addAll(batch)

    updateProgress(`Indexing: ${Math.min(i + 100, documents.length)}/${documents.length}`)
    await new Promise(resolve => setTimeout(resolve, 0))  // Yield
  }

  return miniSearch
}
```

---

## 6. Implementation Checklist

### Phase 1: Project Setup
- [ ] Initialize Vite + Preact project
- [ ] Install dependencies: Fireproof, PeerJS, MiniSearch, Tailwind
- [ ] Configure Tailwind CSS
- [ ] Set up PWA manifest and service worker
- [ ] Create basic app shell (App.jsx, routing)

### Phase 2: Local Storage
- [ ] Implement Fireproof initialization (useFireproof hook)
- [ ] Create bookmark CRUD operations
- [ ] Build BookmarkList, BookmarkItem, BookmarkForm components
- [ ] Implement tags and read-later toggle
- [ ] Add local search with MiniSearch (useSearch hook)

### Phase 3: Crypto & Device Identity
- [ ] Implement device keypair generation (services/crypto.js)
- [ ] Implement LEK generation for first device
- [ ] Add WebCrypto key storage utilities
- [ ] Create device ID management (utils/device-id.js)
- [ ] Add EFF wordlist (services/wordlist.js)

### Phase 4: Pairing Flow
- [ ] Build PairingFlow orchestrator component
- [ ] Implement QRCodeDisplay (QR generation + verification words)
- [ ] Implement QRScanner (camera + parsing)
- [ ] Add ManualPairing fallback
- [ ] Implement ECDH key agreement
- [ ] Build LEK transfer protocol
- [ ] Add verification word comparison UI
- [ ] Test pairing between two devices

### Phase 5: Sync Protocol
- [ ] Implement PeerJS connection management (usePeerSync hook)
- [ ] Build sync handshake (hello, auth check)
- [ ] Implement clock state exchange
- [ ] Add commit diff calculation
- [ ] Build commit transfer protocol
- [ ] Implement continuous sync (real-time push)
- [ ] Add ConnectionStatus indicator
- [ ] Test sync with concurrent edits

### Phase 6: Device Management
- [ ] Build DeviceList component
- [ ] Implement unpair functionality
- [ ] Add device last-seen tracking
- [ ] Show sync status per device

### Phase 7: Error Handling
- [ ] Add network error recovery
- [ ] Implement pairing timeout handling
- [ ] Add storage quota monitoring
- [ ] Handle WebCrypto unavailable
- [ ] Add camera permission fallback
- [ ] Implement rate limiting for pairing

### Phase 8: Polish & Testing
- [ ] Add loading states and progress indicators
- [ ] Implement empty states and onboarding
- [ ] Add offline indicator
- [ ] Performance testing with 1k bookmarks
- [ ] Test on iOS Safari PWA
- [ ] Test multi-device sync scenarios
- [ ] Security audit (verify non-extractable keys, E2EE)

### Phase 9: PWA Features
- [ ] Add service worker for offline support
- [ ] Configure app manifest (icons, theme)
- [ ] Test install prompt
- [ ] Verify offline functionality

---

## 7. Dependencies

```json
{
  "dependencies": {
    "preact": "^10.19.0",
    "@preact/signals": "^1.2.0",
    "@fireproof/core": "^0.19.0",
    "peerjs": "^1.5.0",
    "minisearch": "^6.3.0",
    "qr-scanner": "^1.4.2",
    "qrcode": "^1.5.3",
    "bs58": "^5.0.0"
  },
  "devDependencies": {
    "vite": "^5.0.0",
    "@preact/preset-vite": "^2.8.0",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  }
}
```

**Bundle Size Estimate:**
- Preact: ~3KB
- Fireproof: ~30KB
- PeerJS: ~25KB
- MiniSearch: ~5KB
- QR libraries: ~10KB
- App code + Tailwind: ~30KB
- **Total: ~103KB gzipped** ✅ Under 150KB target

---

## 8. Open Questions & Future Work

### Future Enhancements (Post-MVP)

**Favicon fetching:**
- Use favicon service API or fetch from page HTML
- Cache in Fireproof as blob references
- Display in BookmarkItem

**Metadata preview:**
- Fetch Open Graph tags from URLs
- Show rich previews (image, description, site name)
- Optional: Store preview data in bookmark doc

**Export/Import:**
- Export to JSON (plaintext or encrypted)
- Import from browser bookmarks
- Backup to file system

**Raspberry Pi relay:**
- Self-hosted PeerJS signaling server
- Store-and-forward encrypted commits
- Enable cross-network sync

**Advanced search:**
- Full-text search in page content (via archive snapshots)
- Fuzzy matching improvements
- Search history

**Application-level E2EE (Phase 2):**
- Sign sync messages with device identity keys
- Verify signatures on receipt
- Detect tampering or impersonation

---

## 9. Acceptance Criteria

MVP is complete when:

- [ ] User can add/edit/delete bookmarks with tags and read-later
- [ ] Local search works across title/description/tags
- [ ] Two devices can pair via QR code in <30 seconds
- [ ] Manual pairing works without camera
- [ ] Verification words display and match on both devices
- [ ] Devices auto-reconnect after browser restart
- [ ] Concurrent edits merge correctly (both changes survive)
- [ ] App works fully offline (no network errors)
- [ ] Data persists across app restarts
- [ ] Stolen device can be unpaired from remaining devices
- [ ] No plaintext bookmark data in IndexedDB (verify encryption)
- [ ] Network inspection shows encrypted WebRTC traffic
- [ ] Performance: <1s cold start, <50ms local operations
- [ ] iOS Safari PWA works (install + sync)
- [ ] 1000 bookmarks load and search quickly

---

## Conclusion

This design provides a complete blueprint for implementing Hypermark MVP. All critical decisions are locked down:

✅ **Architecture:** Preact + Fireproof + PeerJS + MiniSearch
✅ **Sync format:** Fireproof native commits
✅ **Keys:** WebCrypto non-extractable
✅ **Device list:** Syncs via Fireproof
✅ **Search:** MiniSearch with full-text
✅ **Verification:** Word mnemonics
✅ **Fallback:** Manual pairing for no-camera devices

**Next Step:** Begin Phase 1 implementation (project setup).
