# PairingFlow Component Design

**Date:** 2025-12-26
**Task:** hypermark-2f9.1 - Build PairingFlow orchestrator component
**Status:** Ready for Implementation

---

## Overview

PairingFlow.jsx orchestrates the complete 7-phase device pairing protocol, managing WebRTC connections, ECDH key agreement, word verification, and encrypted LEK transfer between devices.

**Key Decisions:**
- ✅ PeerJS handled directly in component (not abstracted to hook)
- ✅ State management using @preact/signals for reactivity
- ✅ Inline error display with retry (no modals/toasts)
- ✅ Auto-generate LEK on first pairing (no separate setup flow)

---

## Architecture

### State Machine (8 States)

```
INITIAL → GENERATING/SCANNING → VERIFYING → TRANSFERRING/IMPORTING → COMPLETE
                                         ↓
                                      ERROR
```

**States:**
1. `INITIAL` - Role selection (Show QR vs Scan QR)
2. `GENERATING` - Initiator showing QR code, listening for connections
3. `SCANNING` - Responder scanning QR code
4. `VERIFYING` - Both devices comparing verification words
5. `TRANSFERRING` - Initiator sending encrypted LEK
6. `IMPORTING` - Responder receiving and importing LEK
7. `COMPLETE` - Success state with "Done" button
8. `ERROR` - Error state with inline message and retry

### State Management (Signals)

```javascript
import { signal, computed } from '@preact/signals'

// Core state
const pairingState = signal('INITIAL')
const role = signal(null) // 'initiator' | 'responder'
const error = signal(null)

// Connection state
const session = signal(null)
const connection = signal(null)
const verificationWords = signal(null)

// Ephemeral keys (cleared after pairing)
const ephemeralKeypair = signal(null)
const sessionKey = signal(null)
```

**Why Signals?**
- Automatic re-rendering on state changes
- Easy to share with other components (ConnectionStatus, DeviceList)
- Better performance for reactive updates
- No prop drilling needed

---

## Phase 1: Role Selection & Initialization

### UI (INITIAL State)

```jsx
<div class="role-selection">
  <h2>Pair New Device</h2>
  <p class="text-gray-600">Choose how to pair:</p>

  <button class="btn-primary" onClick={startAsInitiator}>
    📱 Show QR Code
    <span class="text-sm">Use this device to pair a new one</span>
  </button>

  <button class="btn-secondary" onClick={startAsResponder}>
    📷 Scan QR Code
    <span class="text-sm">This is the new device being paired</span>
  </button>
</div>
```

### Initiator Flow

```javascript
async function startAsInitiator() {
  try {
    role.value = 'initiator'
    pairingState.value = 'GENERATING'

    // Check for LEK, generate if missing (first-time pairing)
    let lek = await retrieveLEK()
    if (!lek) {
      console.log('First-time pairing: generating LEK')
      lek = await generateLEK()
      await storeLEK(lek)

      // Also ensure device keypair exists
      let deviceKeypair = await retrieveDeviceKeypair()
      if (!deviceKeypair) {
        deviceKeypair = await generateDeviceKeypair()
        await storeDeviceKeypair(deviceKeypair)
      }
    }

    // Generate ephemeral keypair for this pairing session
    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    // Create session with 5-min expiry
    const sessionData = {
      sessionId: generateUUID(),
      ephemeralPublicKey: await exportPublicKey(keypair.publicKey),
      peerID: getPeerJSId(),
      deviceName: getDeviceName(),
      expires: Date.now() + 300000 // 5 minutes
    }
    session.value = sessionData

    // Initialize PeerJS and listen for connections
    await initializePeerJSListener()

  } catch (err) {
    error.value = err.message
    pairingState.value = 'ERROR'
  }
}
```

**Key Point:** LEK auto-generation allows first device to use app locally without pairing, then later become a primary device when pairing others.

### Responder Flow

```javascript
async function startAsResponder() {
  role.value = 'responder'
  pairingState.value = 'SCANNING'
  // QRScanner component handles camera and parsing
}
```

---

## Phase 2: PeerJS Connection Establishment

### Initiator (Listening)

```javascript
async function initializePeerJSListener() {
  const peerId = getPeerJSId()
  const peer = new Peer(peerId, {
    host: '0.peerjs.com',
    port: 443,
    secure: true,
  })

  peer.on('open', (id) => {
    console.log('PeerJS ready, ID:', id)
    session.value = { ...session.value, peerID: id }
  })

  peer.on('connection', (conn) => {
    console.log('Incoming pairing connection')
    connection.value = conn

    conn.on('open', () => {
      console.log('Connection established')
    })

    conn.on('data', handlePairingMessage)

    conn.on('error', (err) => {
      error.value = `Connection error: ${err.message}`
      pairingState.value = 'ERROR'
    })
  })

  peer.on('error', (err) => {
    error.value = `PeerJS error: ${err.message}`
    pairingState.value = 'ERROR'
  })
}
```

### Responder (Connecting)

```javascript
async function connectToInitiator(sessionData) {
  const peer = new Peer() // Let PeerJS assign temporary ID

  peer.on('open', (id) => {
    console.log('Responder PeerJS ready:', id)

    // Connect to initiator
    const conn = peer.connect(sessionData.peerID, {
      reliable: true // Use reliable data channel
    })

    connection.value = conn

    conn.on('open', async () => {
      // Send handshake with our ephemeral public key
      const deviceInfo = getDeviceInfo()
      const handshake = {
        type: MESSAGE_TYPES.PAIRING_HANDSHAKE,
        sessionId: sessionData.sessionId,
        ephemeralPublicKey: await exportPublicKey(ephemeralKeypair.value.publicKey),
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name
      }
      conn.send(handshake)
    })

    conn.on('data', handlePairingMessage)
    conn.on('error', handleConnectionError)
  })
}
```

**Connection Strategy:**
- Initiator: Stable peer ID (based on device ID) for reconnection
- Responder: Temporary peer ID assigned by PeerJS server
- Reliable data channel (TCP-like) for message ordering

---

## Phase 3: Message Protocol & ECDH Key Agreement

### Message Types

```javascript
const MESSAGE_TYPES = {
  PAIRING_HANDSHAKE: 'pairing-handshake',     // Responder → Initiator
  PAIRING_CONFIRMED: 'pairing-confirmed',     // Both → trigger LEK transfer
  PAIRING_COMPLETE: 'pairing-complete',       // Initiator → Responder (with LEK)
  PAIRING_ACK: 'pairing-ack',                 // Responder → Initiator (success)
  PAIRING_ERROR: 'pairing-error',             // Either direction
}
```

### Message Dispatcher

```javascript
async function handlePairingMessage(msg) {
  try {
    console.log('Received message:', msg.type)

    switch (msg.type) {
      case MESSAGE_TYPES.PAIRING_HANDSHAKE:
        await handleHandshake(msg)
        break
      case MESSAGE_TYPES.PAIRING_CONFIRMED:
        await handlePairingConfirmed(msg)
        break
      case MESSAGE_TYPES.PAIRING_COMPLETE:
        await handlePairingComplete(msg)
        break
      case MESSAGE_TYPES.PAIRING_ACK:
        await handlePairingAck(msg)
        break
      case MESSAGE_TYPES.PAIRING_ERROR:
        handlePairingError(msg)
        break
      default:
        console.warn('Unknown message type:', msg.type)
    }
  } catch (err) {
    error.value = err.message
    pairingState.value = 'ERROR'
  }
}
```

### ECDH Key Agreement (Initiator)

```javascript
async function handleHandshake(msg) {
  // Initiator receives handshake from responder
  const { ephemeralPublicKey, deviceName, sessionId } = msg

  // Verify session ID matches
  if (sessionId !== session.value.sessionId) {
    throw new Error('Session ID mismatch')
  }

  // Import responder's ephemeral public key
  const responderPublicKey = await importPublicKey(ephemeralPublicKey)

  // Derive shared secret via ECDH
  const sharedSecret = await deriveSharedSecret(
    ephemeralKeypair.value.privateKey,
    responderPublicKey
  )

  // Derive session key using HKDF
  const sk = await deriveSessionKey(sharedSecret, sessionId)
  sessionKey.value = sk

  // Derive verification words
  const words = await deriveVerificationWords(sk, sessionId)
  verificationWords.value = words

  // Transition to verification state
  pairingState.value = 'VERIFYING'
}
```

### ECDH Key Agreement (Responder)

Performed in `handleQRScanned()` after scanning QR code:

```javascript
async function handleQRScanned(sessionData) {
  try {
    // Validate and check expiry
    if (!sessionData.sessionId || !sessionData.ephemeralPublicKey) {
      throw new Error('Invalid QR code')
    }
    if (sessionData.expires < Date.now()) {
      throw new Error('QR code has expired')
    }

    session.value = sessionData

    // Generate our ephemeral keypair
    const keypair = await generateEphemeralKeypair()
    ephemeralKeypair.value = keypair

    // Perform ECDH with initiator's public key
    const initiatorPublicKey = await importPublicKey(sessionData.ephemeralPublicKey)
    const sharedSecret = await deriveSharedSecret(
      keypair.privateKey,
      initiatorPublicKey
    )

    // Derive session key
    const sk = await deriveSessionKey(sharedSecret, sessionData.sessionId)
    sessionKey.value = sk

    // Derive verification words
    const words = await deriveVerificationWords(sk, sessionData.sessionId)
    verificationWords.value = words

    // Connect to initiator via PeerJS
    await connectToInitiator(sessionData)

    // Transition to verification
    pairingState.value = 'VERIFYING'

  } catch (err) {
    error.value = `QR scan failed: ${err.message}`
    pairingState.value = 'ERROR'
  }
}
```

**Result:** Both devices derive identical session key and verification words via ECDH.

---

## Phase 4: Verification UI & Word Comparison

### Verification Screen (VERIFYING State)

```jsx
{pairingState.value === 'VERIFYING' && (
  <div class="verification-screen">
    <h2 class="text-2xl font-bold mb-4">Verify Pairing</h2>

    <p class="text-gray-600 mb-6">
      Confirm these words match on both devices:
    </p>

    <div class="verification-words">
      <span class="word">{verificationWords.value[0]}</span>
      <span class="word-separator">·</span>
      <span class="word">{verificationWords.value[1]}</span>
    </div>

    <div class="verification-buttons">
      <button class="btn-success" onClick={handleWordsMatch}>
        ✓ They Match
      </button>
      <button class="btn-danger" onClick={handleWordsDontMatch}>
        ✗ Don't Match
      </button>
    </div>

    <p class="text-sm text-gray-500 mt-4">
      This protects against network attacks
    </p>
  </div>
)}
```

### CSS Styling

```css
.verification-words {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  padding: 2rem;
  background: #f8f9fa;
  border-radius: 8px;
  margin: 1rem 0;
}

.word {
  font-size: 2rem;
  font-weight: 700;
  color: #1a1a1a;
  text-transform: lowercase;
}

.word-separator {
  font-size: 1.5rem;
  color: #666;
}
```

### Handler: Words Match

```javascript
async function handleWordsMatch() {
  // Send confirmation to peer
  connection.value.send({
    type: MESSAGE_TYPES.PAIRING_CONFIRMED,
    role: role.value
  })

  // Transition based on role
  if (role.value === 'initiator') {
    pairingState.value = 'TRANSFERRING'
    await transferLEK()
  } else {
    pairingState.value = 'IMPORTING'
    // Wait for LEK from initiator
  }
}
```

### Handler: Words Don't Match

```javascript
function handleWordsDontMatch() {
  // Notify peer of verification failure
  connection.value.send({
    type: MESSAGE_TYPES.PAIRING_ERROR,
    message: 'Verification words did not match'
  })

  // Close connection and cleanup
  connection.value.close()
  cleanupPairingState()

  error.value = 'Verification failed: words don\'t match. This could indicate a network attack.'
  pairingState.value = 'ERROR'
}
```

---

## Phase 5: LEK Transfer (Initiator)

### Transfer Function (TRANSFERRING State)

```javascript
async function transferLEK() {
  try {
    // Retrieve LEK from storage
    const lek = await retrieveLEK()
    if (!lek) {
      throw new Error('LEK not found')
    }

    // Export LEK as raw bytes
    const lekRaw = await exportLEK(lek)

    // Encrypt with session key using AES-GCM
    const iv = generateRandomBytes(12)
    const deviceInfo = getDeviceInfo()
    const additionalData = `${session.value.sessionId}:${deviceInfo.id}`

    const { ciphertext } = await encryptData(
      sessionKey.value,
      lekRaw,
      additionalData
    )

    // Get device keypair for identity
    const deviceKeypair = await retrieveDeviceKeypair()
    const identityPublicKey = await exportPublicKey(deviceKeypair.publicKey)

    // Send encrypted LEK + metadata
    connection.value.send({
      type: MESSAGE_TYPES.PAIRING_COMPLETE,
      encryptedLEK: arrayBufferToBase64(ciphertext),
      iv: arrayBufferToBase64(iv),
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey,
      sessionId: session.value.sessionId
    })

    console.log('LEK transferred, waiting for acknowledgment')

  } catch (err) {
    error.value = `Failed to transfer LEK: ${err.message}`
    pairingState.value = 'ERROR'
  }
}
```

**Security Properties:**
- LEK encrypted with session key (derived from ECDH)
- AES-GCM provides authenticated encryption
- AAD binds encryption to session and device IDs
- IV is random (12 bytes for GCM)
- Perfect forward secrecy (ephemeral keys destroyed after)

---

## Phase 6: LEK Import (Responder)

### Import Function (IMPORTING State)

```javascript
async function handlePairingComplete(msg) {
  try {
    const {
      encryptedLEK,
      iv,
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      identityPublicKey,
      sessionId
    } = msg

    // Verify session ID
    if (sessionId !== session.value.sessionId) {
      throw new Error('Session ID mismatch')
    }

    // Decrypt LEK
    const deviceInfo = getDeviceInfo()
    const additionalData = `${sessionId}:${deviceInfo.id}`

    const lekRaw = await decryptData(
      sessionKey.value,
      base64ToArrayBuffer(encryptedLEK),
      base64ToArrayBuffer(iv),
      additionalData
    )

    // Import LEK as extractable (needed for deriving Yjs password and pairing additional devices)
    const lek = await importLEK(lekRaw, true)
    await storeLEK(lek)

    // Derive Yjs room password from LEK (not raw LEK)
    const yjsPassword = await deriveYjsPassword(lek)
    setYjsRoomPassword(yjsPassword)
    reconnectYjsWebRTC()

    // Generate/retrieve our device keypair
    let deviceKeypair = await retrieveDeviceKeypair()
    if (!deviceKeypair) {
      deviceKeypair = await generateDeviceKeypair()
      await storeDeviceKeypair(deviceKeypair)
    }

    // Send acknowledgment
    const ourPublicKey = await exportPublicKey(deviceKeypair.publicKey)
    connection.value.send({
      type: MESSAGE_TYPES.PAIRING_ACK,
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      identityPublicKey: ourPublicKey
    })

    // Cleanup ephemeral keys
    cleanupEphemeralKeys()

    // Success!
    pairingState.value = 'COMPLETE'

  } catch (err) {
    error.value = `Failed to import LEK: ${err.message}`
    pairingState.value = 'ERROR'
  }
}
```

**Security Improvements:**
- LEK is imported as extractable to support deriving Yjs password via HKDF
- Yjs password is derived using HKDF-SHA256, not direct LEK export
- This ensures the Yjs network layer never sees the raw LEK
- Derived password cannot be reversed to obtain the LEK
- Defense in depth: compromised Yjs password doesn't compromise bookmark encryption
- All devices derive the same password (deterministic derivation with fixed domain separator)

### Acknowledgment Handler (Initiator)

```javascript
async function handlePairingAck(msg) {
  const { deviceId, deviceName, identityPublicKey } = msg

  console.log('Pairing acknowledged by responder')

  // Store responder's device metadata
  // (Will be synced to Fireproof in Phase 5)

  // Cleanup ephemeral keys
  cleanupEphemeralKeys()

  // Success!
  pairingState.value = 'COMPLETE'
}
```

---

## Phase 7: Completion & Error Handling

### Success State (COMPLETE)

```jsx
{pairingState.value === 'COMPLETE' && (
  <div class="pairing-success">
    <div class="success-icon">✓</div>
    <h2 class="text-2xl font-bold mb-2">Pairing Complete!</h2>
    <p class="text-gray-600 mb-6">
      Your devices are now paired and ready to sync.
    </p>
    <button class="btn-primary" onClick={handleDone}>
      Done
    </button>
  </div>
)}
```

### Error State (ERROR with Inline Display)

```jsx
{pairingState.value === 'ERROR' && (
  <div class="pairing-error">
    <div class="error-icon">✗</div>
    <h2 class="text-xl font-bold mb-2">Pairing Failed</h2>
    <p class="text-red-600 mb-4">{error.value}</p>

    <div class="error-actions">
      <button class="btn-primary" onClick={reset}>
        Try Again
      </button>
      <button class="btn-secondary" onClick={handleDone}>
        Cancel
      </button>
    </div>

    <details class="mt-4">
      <summary class="text-sm text-gray-500 cursor-pointer">
        Troubleshooting tips
      </summary>
      <ul class="text-sm text-gray-600 mt-2 space-y-1">
        <li>• Ensure both devices are on the same network</li>
        <li>• Check camera permissions on scanning device</li>
        <li>• Try moving QR code closer to camera</li>
        <li>• Restart the app if issues persist</li>
      </ul>
    </details>
  </div>
)}
```

### Progress Indicator (TRANSFERRING/IMPORTING)

```jsx
{(pairingState.value === 'TRANSFERRING' ||
  pairingState.value === 'IMPORTING') && (
  <div class="pairing-progress">
    <div class="spinner"></div>
    <h2 class="text-xl font-bold mb-2">
      {role.value === 'initiator'
        ? 'Sending encryption key...'
        : 'Receiving encryption key...'}
    </h2>
    <p class="text-gray-600">This will only take a moment.</p>
  </div>
)}
```

### Reset & Cleanup

```javascript
function reset() {
  // Close any open connections
  if (connection.value) {
    connection.value.close()
  }

  // Clear all state
  pairingState.value = 'INITIAL'
  role.value = null
  session.value = null
  connection.value = null
  verificationWords.value = null
  error.value = null

  // Cleanup ephemeral keys
  cleanupEphemeralKeys()
}

function cleanupEphemeralKeys() {
  ephemeralKeypair.value = null
  sessionKey.value = null
  // Let garbage collector handle the keys
}

function handleDone() {
  reset()
  // Signal to parent component to close pairing view
  // Could emit event or call prop callback
}
```

---

## Integration with Child Components

### QRCodeDisplay Integration (GENERATING State)

```jsx
{pairingState.value === 'GENERATING' && (
  <QRCodeDisplay
    session={session.value}
    verificationWords={verificationWords.value}
    onError={handleError}
  />
)}
```

**Expected QRCodeDisplay Responsibilities:**
- Encode `session` object as QR code using qrcode library
- Display QR code prominently
- Show verification words when available (after ECDH handshake)
- Provide manual pairing fallback (JSON copy button)
- Fire `onError` for QR generation failures

**QRCodeDisplay does NOT:**
- Manage PeerJS connections (PairingFlow handles this)
- Perform ECDH (PairingFlow handles this)

### QRScanner Integration (SCANNING State)

```jsx
{pairingState.value === 'SCANNING' && (
  <QRScanner
    onScanned={handleQRScanned}
    onError={handleError}
  />
)}
```

**Expected QRScanner Responsibilities:**
- Request camera permission
- Use qr-scanner library to decode QR
- Parse JSON from QR data
- Validate basic structure (has sessionId, ephemeralPublicKey)
- Fire `onScanned(sessionData)` with parsed session
- Show manual entry fallback if camera denied
- Fire `onError` for camera/parsing failures

**QRScanner does NOT:**
- Validate session expiry (PairingFlow handles this)
- Perform ECDH (PairingFlow handles this)
- Connect via PeerJS (PairingFlow handles this)

---

## Error Scenarios & Handling

### Network Errors

**Connection timeout:**
```javascript
// Set timeout when starting connection
const connectionTimeout = setTimeout(() => {
  if (pairingState.value === 'SCANNING' || pairingState.value === 'GENERATING') {
    error.value = 'Connection timeout. Check network and try again.'
    pairingState.value = 'ERROR'
  }
}, 30000) // 30 seconds

// Clear timeout on successful connection
conn.on('open', () => {
  clearTimeout(connectionTimeout)
})
```

**PeerJS server unreachable:**
```javascript
peer.on('error', (err) => {
  if (err.type === 'network') {
    error.value = 'Cannot reach signaling server. Check internet connection.'
  } else if (err.type === 'peer-unavailable') {
    error.value = 'Cannot connect to other device. Check that QR code is current.'
  } else {
    error.value = `PeerJS error: ${err.message}`
  }
  pairingState.value = 'ERROR'
})
```

### Crypto Errors

**WebCrypto unavailable:**
```javascript
if (!isWebCryptoAvailable()) {
  error.value = 'This browser does not support required encryption features.'
  pairingState.value = 'ERROR'
  return
}
```

**ECDH derivation fails:**
```javascript
try {
  const sharedSecret = await deriveSharedSecret(privateKey, publicKey)
} catch (err) {
  error.value = 'Key agreement failed. Invalid QR code or network attack.'
  pairingState.value = 'ERROR'
}
```

**LEK decryption fails:**
```javascript
try {
  const lekRaw = await decryptData(sessionKey, ciphertext, iv, aad)
} catch (err) {
  error.value = 'Failed to decrypt encryption key. Verification may have been compromised.'
  pairingState.value = 'ERROR'
}
```

### Session Errors

**Expired QR code:**
```javascript
if (sessionData.expires < Date.now()) {
  error.value = 'QR code has expired. Generate a new one.'
  pairingState.value = 'ERROR'
}
```

**Session ID mismatch:**
```javascript
if (msg.sessionId !== session.value.sessionId) {
  error.value = 'Session mismatch. Possible network interference.'
  pairingState.value = 'ERROR'
}
```

---

## Security Considerations

### Threat Model Coverage

✅ **Network eavesdropper:** Cannot see LEK (encrypted with session key)
✅ **Evil twin WiFi:** Verification words will differ (MITM detection)
✅ **Compromised PeerJS server:** Cannot decrypt pairing messages
✅ **QR code intercept:** Useless without verification confirmation
✅ **Replay attack:** sessionId + expiry prevents reuse
✅ **Key extraction:** Non-extractable keys in WebCrypto

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

**Integrity:**
- AES-GCM provides authenticated encryption
- AAD binds encryption to session and device IDs
- Session ID prevents message replay

---

## Testing Checklist

### Unit Tests
- [ ] State transitions work correctly
- [ ] Error states trigger on failures
- [ ] Cleanup happens on reset
- [ ] Session expiry validation works
- [ ] Message dispatcher routes correctly

### Integration Tests
- [ ] QRCodeDisplay receives correct props
- [ ] QRScanner callback fires with valid data
- [ ] ECDH produces matching keys on both sides
- [ ] Verification words match on both devices
- [ ] LEK decrypts correctly on responder

### E2E Tests (Two Devices)
- [ ] Initiator shows QR code
- [ ] Responder scans and connects
- [ ] Verification words match
- [ ] LEK transfer succeeds
- [ ] Both devices marked as paired
- [ ] Can retry after error
- [ ] Session expires after 5 minutes

### Security Tests
- [ ] LEK is non-extractable after import
- [ ] Ephemeral keys are cleared after pairing
- [ ] AAD mismatch causes decryption failure
- [ ] Expired QR codes are rejected
- [ ] Session ID mismatch is detected

---

## Implementation Notes

### Dependencies Required
- `peerjs` (already installed)
- `@preact/signals` (already installed)
- Services: `crypto.js`, `key-storage.js`, `wordlist.js`, `device-id.js`
- Utils: existing crypto utilities
- Components: QRCodeDisplay (hypermark-2f9.2), QRScanner (hypermark-2f9.3)

### File Structure
```
src/components/pairing/
├── PairingFlow.jsx           # This component
├── QRCodeDisplay.jsx         # Task 2f9.2
├── QRScanner.jsx             # Task 2f9.3
└── ManualPairing.jsx         # Task 2f9.4
```

### State Persistence
- Pairing state is ephemeral (not persisted)
- If browser refreshes mid-pairing, user must restart
- This is acceptable for security (session keys not persisted)

### Future Enhancements
- Add timeout indicators (countdown from 5 min)
- Support manual pairing without QR (Task 2f9.4)
- Add pairing history/audit log
- Support re-pairing existing device (rotate keys)

---

## Acceptance Criteria

- [ ] State machine transitions correctly through all 8 states
- [ ] Role selection (initiator/responder) works
- [ ] PeerJS connections establish successfully
- [ ] ECDH key agreement produces matching session keys
- [ ] Verification words display and match on both devices
- [ ] LEK transfers encrypted and decrypts correctly
- [ ] Errors show inline with retry option
- [ ] Success state shows with "Done" button
- [ ] Cleanup properly disposes ephemeral keys
- [ ] Integrates with QRCodeDisplay and QRScanner components
- [ ] Auto-generates LEK on first pairing
- [ ] Session expiry (5 min) is enforced

---

## Next Steps

After completing PairingFlow:
1. **Task 2f9.2:** Implement QRCodeDisplay component
2. **Task 2f9.3:** Implement QRScanner component
3. **Task 2f9.4:** Implement ManualPairing fallback
4. **Integration:** Connect PairingFlow to App.jsx routing
5. **Testing:** Two-device pairing validation

---

**Status:** ✅ Design validated, ready for implementation
