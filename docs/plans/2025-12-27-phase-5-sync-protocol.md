# Phase 5: Sync Protocol Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable real-time peer-to-peer synchronization of bookmarks between paired devices using PeerJS and Fireproof's changes API.

**Architecture:** Custom P2P sync protocol that exchanges Fireproof clock heads and document changes over PeerJS connections. Uses device authentication with stored public keys, maintains persistent connections to all paired devices, and provides real-time bidirectional sync.

**Tech Stack:** PeerJS (WebRTC), Fireproof changes/subscribe API, Preact signals for state management

---

## Overview

Phase 5 implements the sync protocol described in the design document (lines 256-355). The implementation consists of:

1. **usePeerSync hook** - Core sync engine managing PeerJS connections
2. **Sync protocol messages** - Hello, sync-state, sync-request, sync-data
3. **ConnectionStatus component** - Visual indicator of sync state
4. **Device storage in Fireproof** - Store paired device metadata for reconnection

**Key Design Decisions:**
- Use Fireproof's `changes()` API instead of raw commits (not exposed in API)
- Store device metadata in Fireproof with type `_device` for automatic sync
- Subscribe to local changes and push immediately to connected peers
- Auto-reconnect to paired devices on app restart

---

## Task 1: Create Device Storage Module

Store paired device metadata in Fireproof for persistence and sync.

**Files:**
- Create: `src/services/device-registry.js`
- Test: `src/services/device-registry.test.js` (manual testing for now)

**Step 1: Write device-registry.js**

```javascript
/**
 * Device registry - manage paired devices in Fireproof
 * Devices are stored with type: "_device" so they sync automatically
 */

/**
 * Add a paired device to the registry
 * @param {Database} db - Fireproof database
 * @param {Object} deviceInfo - Device information
 * @param {string} deviceInfo.deviceId - Unique device ID
 * @param {string} deviceInfo.deviceName - Human-readable name
 * @param {string} deviceInfo.peerID - PeerJS peer ID
 * @param {string} deviceInfo.publicKey - Device identity public key (base64)
 * @returns {Promise<Object>} - Created device document
 */
export async function addPairedDevice(db, deviceInfo) {
  const { deviceId, deviceName, peerID, publicKey } = deviceInfo

  if (!deviceId || !deviceName || !peerID || !publicKey) {
    throw new Error('Missing required device information')
  }

  const deviceDoc = {
    _id: `device:${deviceId}`,
    type: '_device',
    deviceId,
    deviceName,
    peerID,
    publicKey,
    pairedAt: Date.now(),
    lastSeen: Date.now(),
  }

  await db.put(deviceDoc)
  return deviceDoc
}

/**
 * Get all paired devices
 * @param {Database} db - Fireproof database
 * @returns {Promise<Array>} - Array of device documents
 */
export async function getAllPairedDevices(db) {
  const result = await db.allDocs()

  return result.rows
    .map(row => row.value)
    .filter(doc => doc && doc.type === '_device' && !doc._deleted)
}

/**
 * Get a specific device by ID
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<Object|null>} - Device document or null
 */
export async function getDevice(db, deviceId) {
  try {
    const doc = await db.get(`device:${deviceId}`)
    if (doc && doc.type === '_device' && !doc._deleted) {
      return doc
    }
    return null
  } catch (err) {
    if (err.name === 'not_found' || err.message?.includes('Not found')) {
      return null
    }
    throw err
  }
}

/**
 * Update device last-seen timestamp
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export async function updateDeviceLastSeen(db, deviceId) {
  const device = await getDevice(db, deviceId)
  if (device) {
    await db.put({
      ...device,
      lastSeen: Date.now(),
    })
  }
}

/**
 * Unpair a device (soft delete)
 * @param {Database} db - Fireproof database
 * @param {string} deviceId - Device ID
 * @returns {Promise<void>}
 */
export async function unpairDevice(db, deviceId) {
  const device = await getDevice(db, deviceId)
  if (device) {
    await db.del(`device:${deviceId}`)
  }
}
```

**Step 2: Manual test device registry**

Run app in browser console:
```javascript
import { fireproof } from '@fireproof/core'
import * as deviceRegistry from './src/services/device-registry.js'

const db = fireproof('hypermark')

// Test adding device
const device = await deviceRegistry.addPairedDevice(db, {
  deviceId: 'test-123',
  deviceName: 'Test Device',
  peerID: 'peer-abc',
  publicKey: 'mock-key-base64'
})
console.log('Added:', device)

// Test getting all devices
const devices = await deviceRegistry.getAllPairedDevices(db)
console.log('All devices:', devices)

// Test getting specific device
const retrieved = await deviceRegistry.getDevice(db, 'test-123')
console.log('Retrieved:', retrieved)
```

Expected: Device CRUD operations work correctly

**Step 3: Commit**

```bash
git add src/services/device-registry.js
git commit -m "feat: add device registry for paired devices storage"
```

---

## Task 2: Create Sync Protocol Messages Module

Define message types and validators for the sync protocol.

**Files:**
- Create: `src/services/sync-messages.js`

**Step 1: Write sync-messages.js**

```javascript
/**
 * Sync protocol message types and validators
 */

export const MESSAGE_TYPES = {
  HELLO: 'sync-hello',
  HELLO_ACK: 'sync-hello-ack',
  SYNC_STATE: 'sync-state',
  SYNC_REQUEST: 'sync-request',
  SYNC_DATA: 'sync-data',
  ERROR: 'sync-error',
}

/**
 * Create a hello message for device authentication
 * @param {Object} params
 * @param {string} params.deviceId - Our device ID
 * @param {string} params.deviceName - Our device name
 * @param {string} params.publicKey - Our public key (base64)
 * @returns {Object} - Hello message
 */
export function createHelloMessage({ deviceId, deviceName, publicKey }) {
  return {
    type: MESSAGE_TYPES.HELLO,
    deviceId,
    deviceName,
    publicKey,
    timestamp: Date.now(),
  }
}

/**
 * Create a hello acknowledgment message
 * @param {Object} params
 * @param {string} params.deviceId - Our device ID
 * @param {string} params.deviceName - Our device name
 * @returns {Object} - Hello ACK message
 */
export function createHelloAckMessage({ deviceId, deviceName }) {
  return {
    type: MESSAGE_TYPES.HELLO_ACK,
    deviceId,
    deviceName,
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-state message with current clock head
 * @param {Object} params
 * @param {Array} params.clockHead - Fireproof clock head
 * @returns {Object} - Sync state message
 */
export function createSyncStateMessage({ clockHead }) {
  return {
    type: MESSAGE_TYPES.SYNC_STATE,
    clockHead: clockHead || [],
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-request message asking for changes
 * @param {Object} params
 * @param {Array} params.since - Clock head to request changes since
 * @returns {Object} - Sync request message
 */
export function createSyncRequestMessage({ since }) {
  return {
    type: MESSAGE_TYPES.SYNC_REQUEST,
    since: since || [],
    timestamp: Date.now(),
  }
}

/**
 * Create a sync-data message with document changes
 * @param {Object} params
 * @param {Array} params.changes - Array of document changes
 * @param {Array} params.clockHead - Current clock head after these changes
 * @returns {Object} - Sync data message
 */
export function createSyncDataMessage({ changes, clockHead }) {
  return {
    type: MESSAGE_TYPES.SYNC_DATA,
    changes,
    clockHead: clockHead || [],
    timestamp: Date.now(),
  }
}

/**
 * Create an error message
 * @param {Object} params
 * @param {string} params.error - Error message
 * @param {string} params.code - Error code (optional)
 * @returns {Object} - Error message
 */
export function createErrorMessage({ error, code }) {
  return {
    type: MESSAGE_TYPES.ERROR,
    error,
    code,
    timestamp: Date.now(),
  }
}

/**
 * Validate a message has required structure
 * @param {Object} msg - Message to validate
 * @returns {boolean} - True if valid
 */
export function isValidMessage(msg) {
  return (
    msg &&
    typeof msg === 'object' &&
    typeof msg.type === 'string' &&
    Object.values(MESSAGE_TYPES).includes(msg.type)
  )
}
```

**Step 2: Commit**

```bash
git add src/services/sync-messages.js
git commit -m "feat: add sync protocol message types and creators"
```

---

## Task 3: Create usePeerSync Hook (Part 1: Connection Management)

Build the core sync engine starting with connection management.

**Files:**
- Create: `src/hooks/usePeerSync.js`

**Step 1: Write initial usePeerSync hook with connection management**

```javascript
/**
 * usePeerSync Hook
 * Manages PeerJS connections and sync protocol with paired devices
 */

import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
import Peer from 'peerjs'
import { getPeerJSId } from '../utils/device-id'
import { getAllPairedDevices, updateDeviceLastSeen } from '../services/device-registry'
import { retrieveDeviceKeypair, exportPublicKey } from '../services/crypto'
import { getDeviceInfo } from '../utils/device-id'
import {
  MESSAGE_TYPES,
  createHelloMessage,
  createHelloAckMessage,
  createErrorMessage,
  isValidMessage,
} from '../services/sync-messages'

// Global sync state using signals
const syncState = signal('disconnected') // 'disconnected' | 'connecting' | 'connected' | 'syncing' | 'error'
const connectedDevices = signal(new Map()) // Map<deviceId, {conn, deviceInfo}>
const peerInstance = signal(null)
const syncError = signal(null)

/**
 * Hook to manage peer sync connections
 * @param {Database} db - Fireproof database instance
 * @returns {Object} - Sync state and methods
 */
export function usePeerSync(db) {
  useEffect(() => {
    if (!db) return

    let mounted = true
    let peer = null

    async function initializePeerSync() {
      try {
        console.log('[usePeerSync] Initializing...')
        syncState.value = 'connecting'

        // Initialize PeerJS with stable ID
        const peerId = getPeerJSId()
        peer = new Peer(peerId, {
          host: '0.peerjs.com',
          port: 443,
          secure: true,
        })

        peerInstance.value = peer

        // Set up PeerJS event handlers
        peer.on('open', (id) => {
          console.log('[usePeerSync] PeerJS ready, ID:', id)
          if (mounted) {
            syncState.value = 'connected'
            // Start connecting to paired devices
            connectToPairedDevices(db, peer)
          }
        })

        peer.on('connection', (conn) => {
          console.log('[usePeerSync] Incoming connection from:', conn.peer)
          if (mounted) {
            handleIncomingConnection(db, conn)
          }
        })

        peer.on('error', (err) => {
          console.error('[usePeerSync] PeerJS error:', err)
          if (mounted) {
            syncError.value = err.message
            syncState.value = 'error'
          }
        })

        peer.on('disconnected', () => {
          console.log('[usePeerSync] PeerJS disconnected')
          if (mounted) {
            syncState.value = 'disconnected'
            // Try to reconnect after delay
            setTimeout(() => {
              if (mounted && peer && !peer.destroyed) {
                peer.reconnect()
              }
            }, 5000)
          }
        })
      } catch (err) {
        console.error('[usePeerSync] Failed to initialize:', err)
        if (mounted) {
          syncError.value = err.message
          syncState.value = 'error'
        }
      }
    }

    initializePeerSync()

    // Cleanup on unmount
    return () => {
      mounted = false
      if (peer && !peer.destroyed) {
        // Close all connections
        const devices = connectedDevices.value
        devices.forEach(({ conn }) => {
          if (conn.open) {
            conn.close()
          }
        })
        connectedDevices.value = new Map()

        peer.destroy()
      }
      peerInstance.value = null
      syncState.value = 'disconnected'
    }
  }, [db])

  return {
    syncState: syncState.value,
    connectedDevices: Array.from(connectedDevices.value.values()),
    syncError: syncError.value,
    manualSync: () => triggerManualSync(db),
  }
}

/**
 * Connect to all paired devices
 */
async function connectToPairedDevices(db, peer) {
  try {
    const devices = await getAllPairedDevices(db)
    console.log('[usePeerSync] Connecting to', devices.length, 'paired devices')

    for (const device of devices) {
      try {
        await connectToDevice(db, peer, device)
      } catch (err) {
        console.error('[usePeerSync] Failed to connect to', device.deviceName, err)
      }
    }
  } catch (err) {
    console.error('[usePeerSync] Failed to get paired devices:', err)
  }
}

/**
 * Connect to a specific device
 */
async function connectToDevice(db, peer, deviceInfo) {
  const { deviceId, peerID, deviceName } = deviceInfo

  // Don't connect to ourselves
  const ourPeerId = getPeerJSId()
  if (peerID === ourPeerId) {
    return
  }

  // Check if already connected
  if (connectedDevices.value.has(deviceId)) {
    console.log('[usePeerSync] Already connected to', deviceName)
    return
  }

  console.log('[usePeerSync] Connecting to', deviceName, 'at', peerID)

  const conn = peer.connect(peerID, {
    reliable: true,
    serialization: 'json',
  })

  conn.on('open', async () => {
    console.log('[usePeerSync] Connected to', deviceName)

    // Send hello message
    await sendHelloMessage(db, conn)
  })

  conn.on('data', (msg) => {
    handleMessage(db, conn, msg, deviceInfo)
  })

  conn.on('close', () => {
    console.log('[usePeerSync] Connection closed:', deviceName)
    connectedDevices.value.delete(deviceId)
    connectedDevices.value = new Map(connectedDevices.value) // Trigger signal update

    // Try to reconnect after delay
    setTimeout(() => {
      if (peerInstance.value && !peerInstance.value.destroyed) {
        connectToDevice(db, peerInstance.value, deviceInfo)
      }
    }, 10000)
  })

  conn.on('error', (err) => {
    console.error('[usePeerSync] Connection error:', deviceName, err)
    connectedDevices.value.delete(deviceId)
    connectedDevices.value = new Map(connectedDevices.value)
  })
}

/**
 * Handle incoming connection from another device
 */
async function handleIncomingConnection(db, conn) {
  console.log('[usePeerSync] Handling incoming connection')

  conn.on('data', (msg) => {
    handleMessage(db, conn, msg, null) // deviceInfo will be filled from HELLO message
  })

  conn.on('close', () => {
    console.log('[usePeerSync] Incoming connection closed')
    // Remove from connected devices
    for (const [deviceId, { conn: storedConn }] of connectedDevices.value.entries()) {
      if (storedConn === conn) {
        connectedDevices.value.delete(deviceId)
        connectedDevices.value = new Map(connectedDevices.value)
        break
      }
    }
  })

  conn.on('error', (err) => {
    console.error('[usePeerSync] Incoming connection error:', err)
  })
}

/**
 * Send hello message to authenticate
 */
async function sendHelloMessage(db, conn) {
  try {
    const deviceInfo = getDeviceInfo()
    const deviceKeypair = await retrieveDeviceKeypair()
    const publicKey = await exportPublicKey(deviceKeypair.publicKey)

    const helloMsg = createHelloMessage({
      deviceId: deviceInfo.id,
      deviceName: deviceInfo.name,
      publicKey,
    })

    conn.send(helloMsg)
    console.log('[usePeerSync] Sent HELLO message')
  } catch (err) {
    console.error('[usePeerSync] Failed to send HELLO:', err)
  }
}

/**
 * Handle incoming message
 */
async function handleMessage(db, conn, msg, deviceInfo) {
  try {
    if (!isValidMessage(msg)) {
      console.warn('[usePeerSync] Invalid message:', msg)
      return
    }

    console.log('[usePeerSync] Received message:', msg.type)

    switch (msg.type) {
      case MESSAGE_TYPES.HELLO:
        await handleHelloMessage(db, conn, msg)
        break
      case MESSAGE_TYPES.HELLO_ACK:
        await handleHelloAckMessage(db, conn, msg, deviceInfo)
        break
      // More message types will be added in next tasks
      default:
        console.warn('[usePeerSync] Unknown message type:', msg.type)
    }
  } catch (err) {
    console.error('[usePeerSync] Error handling message:', err)
    conn.send(createErrorMessage({ error: err.message }))
  }
}

/**
 * Handle HELLO message - authenticate the peer
 */
async function handleHelloMessage(db, conn, msg) {
  const { deviceId, deviceName, publicKey } = msg

  console.log('[usePeerSync] Received HELLO from', deviceName)

  // Verify this device is in our paired devices list
  const storedDevice = await getDevice(db, deviceId)

  if (!storedDevice) {
    console.error('[usePeerSync] Device not in paired list:', deviceId)
    conn.send(createErrorMessage({
      error: 'Device not authorized',
      code: 'NOT_PAIRED',
    }))
    conn.close()
    return
  }

  // Verify public key matches
  if (storedDevice.publicKey !== publicKey) {
    console.error('[usePeerSync] Public key mismatch for device:', deviceId)
    conn.send(createErrorMessage({
      error: 'Authentication failed',
      code: 'KEY_MISMATCH',
    }))
    conn.close()
    return
  }

  // Authentication successful!
  console.log('[usePeerSync] Device authenticated:', deviceName)

  // Update last seen
  await updateDeviceLastSeen(db, deviceId)

  // Add to connected devices
  connectedDevices.value.set(deviceId, {
    conn,
    deviceInfo: { deviceId, deviceName, publicKey },
  })
  connectedDevices.value = new Map(connectedDevices.value) // Trigger signal update

  // Send ACK
  const deviceInfo = getDeviceInfo()
  conn.send(createHelloAckMessage({
    deviceId: deviceInfo.id,
    deviceName: deviceInfo.name,
  }))

  // TODO: Start sync protocol (next task)
}

/**
 * Handle HELLO_ACK message - peer authenticated us
 */
async function handleHelloAckMessage(db, conn, msg, deviceInfo) {
  const { deviceId, deviceName } = msg

  console.log('[usePeerSync] Received HELLO_ACK from', deviceName)

  // Update last seen
  await updateDeviceLastSeen(db, deviceId)

  // Add to connected devices (if not already)
  if (!connectedDevices.value.has(deviceId)) {
    connectedDevices.value.set(deviceId, {
      conn,
      deviceInfo: { deviceId, deviceName, publicKey: deviceInfo?.publicKey },
    })
    connectedDevices.value = new Map(connectedDevices.value)
  }

  // TODO: Start sync protocol (next task)
}

/**
 * Trigger manual sync (for future use)
 */
function triggerManualSync(db) {
  console.log('[usePeerSync] Manual sync triggered')
  // TODO: Implement in next task
}

export {
  syncState,
  connectedDevices,
  peerInstance,
  syncError,
}
```

**Step 2: Test connection management**

Add temporary test code to `src/app.jsx`:
```javascript
import { usePeerSync } from './hooks/usePeerSync'

function App() {
  const { db } = useFireproof()
  const { syncState, connectedDevices, syncError } = usePeerSync(db)

  return (
    <div>
      <div>Sync State: {syncState}</div>
      <div>Connected: {connectedDevices.length} devices</div>
      {syncError && <div>Error: {syncError}</div>}
      {/* rest of app */}
    </div>
  )
}
```

Run app and check browser console for PeerJS initialization logs.

**Step 3: Commit**

```bash
git add src/hooks/usePeerSync.js
git commit -m "feat: add usePeerSync hook with connection management"
```

---

## Task 4: Integrate Device Registration in Pairing Flow

Update PairingFlow to store device metadata after successful pairing.

**Files:**
- Modify: `src/components/pairing/PairingFlow.jsx:591-605`

**Step 1: Import device registry functions**

Add to imports at top of PairingFlow.jsx:
```javascript
import { addPairedDevice } from '../../services/device-registry'
import { useFireproof } from '../../hooks/useFireproof'
```

**Step 2: Get database instance in component**

Add near top of PairingFlow component:
```javascript
export default function PairingFlow() {
  const { db } = useFireproof()

  // ... rest of component
}
```

**Step 3: Update handlePairingAck to store device**

Replace lines 591-605 (handlePairingAck function):
```javascript
async function handlePairingAck(msg) {
  // Initiator receives acknowledgment from responder
  const { deviceId, deviceName, identityPublicKey } = msg

  console.log('Pairing acknowledged by:', deviceName)

  // Store responder's device metadata in Fireproof
  if (db) {
    try {
      const deviceInfo = getDeviceInfo()
      await addPairedDevice(db, {
        deviceId,
        deviceName,
        peerID: session.value.peerID, // The PeerJS ID we used for this session
        publicKey: identityPublicKey,
      })
      console.log('Device registered:', deviceName)
    } catch (err) {
      console.error('Failed to register device:', err)
    }
  }

  // Cleanup ephemeral keys
  cleanupEphemeralKeys()

  // Success!
  pairingState.value = STATES.COMPLETE
}
```

**Step 4: Update handlePairingComplete to store device**

Find handlePairingComplete function (around line 525) and add device registration after LEK import:
```javascript
async function handlePairingComplete(msg) {
  // Responder receives encrypted LEK from initiator
  try {
    const {
      encryptedLEK,
      iv,
      deviceId: initiatorDeviceId,
      deviceName: initiatorDeviceName,
      identityPublicKey,
      sessionId: msgSessionId,
    } = msg

    // ... existing validation and LEK import code ...

    // Store initiator's device metadata in Fireproof
    if (db) {
      try {
        await addPairedDevice(db, {
          deviceId: initiatorDeviceId,
          deviceName: initiatorDeviceName,
          peerID: session.value.peerID,
          publicKey: identityPublicKey,
        })
        console.log('Device registered:', initiatorDeviceName)
      } catch (err) {
        console.error('Failed to register device:', err)
      }
    }

    // ... rest of function ...
  } catch (err) {
    // ... error handling ...
  }
}
```

**Step 5: Test device registration**

Run pairing flow between two browser tabs:
1. Tab 1: "Show QR Code"
2. Tab 2: "Scan QR Code" (manually paste session data)
3. Complete verification
4. Check browser console for "Device registered" logs
5. Check IndexedDB (Application -> IndexedDB -> hypermark) for device documents

Expected: After pairing, device documents are stored in Fireproof

**Step 6: Commit**

```bash
git add src/components/pairing/PairingFlow.jsx
git commit -m "feat: store paired device metadata in Fireproof after pairing"
```

---

## Task 5: Implement Sync Protocol (Part 2: Clock Exchange & Data Sync)

Add clock exchange and data sync to usePeerSync hook.

**Files:**
- Modify: `src/hooks/usePeerSync.js:150-300`

**Step 1: Import sync message creators**

Add to imports:
```javascript
import {
  createSyncStateMessage,
  createSyncRequestMessage,
  createSyncDataMessage,
} from '../services/sync-messages'
```

**Step 2: Add message handlers for sync protocol**

Update the `handleMessage` function's switch statement to add:
```javascript
case MESSAGE_TYPES.SYNC_STATE:
  await handleSyncStateMessage(db, conn, msg, deviceInfo)
  break
case MESSAGE_TYPES.SYNC_REQUEST:
  await handleSyncRequestMessage(db, conn, msg)
  break
case MESSAGE_TYPES.SYNC_DATA:
  await handleSyncDataMessage(db, conn, msg)
  break
case MESSAGE_TYPES.ERROR:
  handleErrorMessage(msg)
  break
```

**Step 3: Implement initiateSync function**

Add after handleHelloAckMessage function:
```javascript
/**
 * Initiate sync protocol after authentication
 */
async function initiateSync(db, conn) {
  try {
    console.log('[usePeerSync] Initiating sync protocol')
    syncState.value = 'syncing'

    // Get our current clock head from Fireproof
    const allDocs = await db._crdt.allDocs()
    const clockHead = allDocs.head || []

    console.log('[usePeerSync] Sending our clock head:', clockHead)

    // Send our clock state to peer
    conn.send(createSyncStateMessage({ clockHead }))
  } catch (err) {
    console.error('[usePeerSync] Failed to initiate sync:', err)
    syncState.value = 'error'
    syncError.value = err.message
  }
}
```

**Step 4: Implement handleSyncStateMessage**

```javascript
/**
 * Handle SYNC_STATE message - compare clocks and request missing changes
 */
async function handleSyncStateMessage(db, conn, msg, deviceInfo) {
  try {
    const { clockHead: peerClockHead } = msg
    console.log('[usePeerSync] Received peer clock head:', peerClockHead)

    // Get our current clock head
    const allDocs = await db._crdt.allDocs()
    const ourClockHead = allDocs.head || []

    // Send our clock state back (if peer sent theirs first)
    if (peerClockHead && peerClockHead.length > 0) {
      conn.send(createSyncStateMessage({ clockHead: ourClockHead }))
    }

    // Request changes since peer's clock head
    // Note: Fireproof's changes() API will determine what we're missing
    if (peerClockHead && peerClockHead.length > 0) {
      // Request changes we don't have
      conn.send(createSyncRequestMessage({ since: peerClockHead }))
    }

    // Get changes peer doesn't have and send them
    if (ourClockHead && ourClockHead.length > 0) {
      await sendChangesToPeer(db, conn, peerClockHead)
    }
  } catch (err) {
    console.error('[usePeerSync] Error handling SYNC_STATE:', err)
  }
}
```

**Step 5: Implement handleSyncRequestMessage**

```javascript
/**
 * Handle SYNC_REQUEST message - send changes since given clock head
 */
async function handleSyncRequestMessage(db, conn, msg) {
  try {
    const { since } = msg
    console.log('[usePeerSync] Received sync request since:', since)

    await sendChangesToPeer(db, conn, since)
  } catch (err) {
    console.error('[usePeerSync] Error handling SYNC_REQUEST:', err)
  }
}
```

**Step 6: Implement sendChangesToPeer**

```javascript
/**
 * Send changes to peer that they don't have
 */
async function sendChangesToPeer(db, conn, peerClockHead) {
  try {
    // Get changes since peer's clock head
    const result = await db.changes(peerClockHead)
    const changes = result.rows || []

    if (changes.length === 0) {
      console.log('[usePeerSync] No changes to send')
      return
    }

    console.log('[usePeerSync] Sending', changes.length, 'changes to peer')

    // Get current clock head
    const allDocs = await db._crdt.allDocs()
    const clockHead = allDocs.head || []

    // Send changes
    conn.send(createSyncDataMessage({
      changes: changes.map(change => ({
        key: change.key,
        value: change.value,
      })),
      clockHead,
    }))
  } catch (err) {
    console.error('[usePeerSync] Error sending changes:', err)
  }
}
```

**Step 7: Implement handleSyncDataMessage**

```javascript
/**
 * Handle SYNC_DATA message - apply incoming changes to our database
 */
async function handleSyncDataMessage(db, conn, msg) {
  try {
    const { changes, clockHead: peerClockHead } = msg
    console.log('[usePeerSync] Received', changes.length, 'changes from peer')

    if (!changes || changes.length === 0) {
      console.log('[usePeerSync] No changes to apply')
      syncState.value = 'connected'
      return
    }

    // Apply each change to our database
    for (const change of changes) {
      try {
        // Use put to add/update documents
        // Fireproof's CRDT will handle conflicts automatically
        if (change.value && !change.value._deleted) {
          await db.put(change.value)
          console.log('[usePeerSync] Applied change:', change.key)
        } else if (change.value?._deleted) {
          // Handle deletions
          await db.del(change.key)
          console.log('[usePeerSync] Applied deletion:', change.key)
        }
      } catch (err) {
        console.error('[usePeerSync] Error applying change:', change.key, err)
      }
    }

    console.log('[usePeerSync] Successfully applied', changes.length, 'changes')
    syncState.value = 'connected'
  } catch (err) {
    console.error('[usePeerSync] Error handling SYNC_DATA:', err)
    syncState.value = 'error'
    syncError.value = err.message
  }
}
```

**Step 8: Implement handleErrorMessage**

```javascript
/**
 * Handle ERROR message from peer
 */
function handleErrorMessage(msg) {
  const { error, code } = msg
  console.error('[usePeerSync] Received error from peer:', error, code)
  syncError.value = `Peer error: ${error}`
  syncState.value = 'error'
}
```

**Step 9: Update handleHelloAckMessage to start sync**

Add at the end of handleHelloAckMessage (before the TODO comment):
```javascript
  // Start sync protocol
  await initiateSync(db, conn)
```

**Step 10: Update handleHelloMessage to start sync**

Add at the end of handleHelloMessage (before the TODO comment):
```javascript
  // Start sync protocol
  await initiateSync(db, conn)
```

**Step 11: Test sync protocol**

1. Open two browser tabs
2. Pair devices
3. Add a bookmark in Tab 1
4. Check if it appears in Tab 2
5. Add a bookmark in Tab 2
6. Check if it appears in Tab 1

Expected: Bookmarks sync between tabs

**Step 12: Commit**

```bash
git add src/hooks/usePeerSync.js
git commit -m "feat: implement clock exchange and data sync protocol"
```

---

## Task 6: Add Real-Time Continuous Sync

Subscribe to local database changes and push them immediately to connected peers.

**Files:**
- Modify: `src/hooks/usePeerSync.js:50-80`

**Step 1: Add database subscription in usePeerSync**

Update the `useEffect` in usePeerSync hook to add subscription after PeerJS initialization:

```javascript
// Add this after peer initialization is complete (after peer.on('open', ...))

// Subscribe to local database changes
const unsubscribe = db.subscribe(async (changes) => {
  console.log('[usePeerSync] Local changes detected:', changes)

  // Push changes to all connected devices
  const devices = connectedDevices.value
  if (devices.size === 0) {
    console.log('[usePeerSync] No connected devices to push to')
    return
  }

  try {
    // Get current clock head
    const allDocs = await db._crdt.allDocs()
    const clockHead = allDocs.head || []

    // Convert changes to sync format
    const changesArray = Array.isArray(changes) ? changes : [changes]
    const syncChanges = changesArray.map(change => ({
      key: change.key || change.id,
      value: change.value || change.doc,
    }))

    // Send to all connected devices
    devices.forEach(({ conn, deviceInfo }) => {
      if (conn.open) {
        console.log('[usePeerSync] Pushing changes to', deviceInfo.deviceName)
        conn.send(createSyncDataMessage({
          changes: syncChanges,
          clockHead,
        }))
      }
    })
  } catch (err) {
    console.error('[usePeerSync] Error pushing changes:', err)
  }
}, true) // Pass true to include updates
```

**Step 2: Update cleanup to unsubscribe**

In the cleanup return function, add before peer.destroy():
```javascript
// Unsubscribe from database changes
if (unsubscribe) {
  unsubscribe()
}
```

**Step 3: Test real-time sync**

1. Keep two browser tabs open and paired
2. Add bookmark in Tab 1
3. Watch Tab 2 - should appear immediately
4. Edit bookmark in Tab 2
5. Watch Tab 1 - should update immediately
6. Delete bookmark in Tab 1
7. Watch Tab 2 - should disappear immediately

Expected: Changes sync in real-time (<1 second delay)

**Step 4: Commit**

```bash
git add src/hooks/usePeerSync.js
git commit -m "feat: add real-time continuous sync with database subscription"
```

---

## Task 7: Create ConnectionStatus Component

Build a visual indicator showing sync connection status.

**Files:**
- Create: `src/components/sync/ConnectionStatus.jsx`

**Step 1: Write ConnectionStatus component**

```javascript
/**
 * ConnectionStatus Component
 * Shows current sync status and number of connected devices
 */

import { syncState, connectedDevices, syncError } from '../../hooks/usePeerSync'

export default function ConnectionStatus() {
  const state = syncState.value
  const devices = connectedDevices.value
  const error = syncError.value

  // Determine badge color and icon
  const getBadgeStyle = () => {
    switch (state) {
      case 'connected':
      case 'syncing':
        return 'bg-green-100 text-green-800'
      case 'connecting':
        return 'bg-yellow-100 text-yellow-800'
      case 'error':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = () => {
    switch (state) {
      case 'connected':
        return '●'
      case 'syncing':
        return '↻'
      case 'connecting':
        return '○'
      case 'error':
        return '✗'
      default:
        return '○'
    }
  }

  const getStatusText = () => {
    switch (state) {
      case 'connected':
        return `Connected (${devices.size} device${devices.size !== 1 ? 's' : ''})`
      case 'syncing':
        return 'Syncing...'
      case 'connecting':
        return 'Connecting...'
      case 'error':
        return 'Error'
      case 'disconnected':
        return 'Offline'
      default:
        return 'Unknown'
    }
  }

  return (
    <div class="connection-status">
      <div
        class={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getBadgeStyle()}`}
        title={error || getStatusText()}
      >
        <span class="text-lg leading-none">{getStatusIcon()}</span>
        <span>{getStatusText()}</span>
      </div>

      {error && state === 'error' && (
        <div class="mt-2 text-sm text-red-600">
          {error}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add ConnectionStatus to app**

Modify `src/app.jsx` to include ConnectionStatus:
```javascript
import ConnectionStatus from './components/sync/ConnectionStatus'

function App() {
  return (
    <div class="app">
      {/* Add to header/toolbar */}
      <header class="flex justify-between items-center p-4">
        <h1 class="text-2xl font-bold">Hypermark</h1>
        <ConnectionStatus />
      </header>

      {/* Rest of app */}
    </div>
  )
}
```

**Step 3: Test ConnectionStatus**

1. Open app - should show "Offline" initially
2. Wait for PeerJS to connect - should show "Connecting..." then "Connected (0 devices)"
3. Pair another device - should show "Connected (1 device)"
4. Add bookmark - should briefly show "Syncing..." then back to "Connected"
5. Close one tab - should show "Connected (0 devices)"

Expected: Status badge updates in real-time

**Step 4: Commit**

```bash
git add src/components/sync/ConnectionStatus.jsx src/app.jsx
git commit -m "feat: add ConnectionStatus component for sync state indicator"
```

---

## Task 8: Add Error Recovery and Reconnection

Implement robust error handling and automatic reconnection.

**Files:**
- Modify: `src/hooks/usePeerSync.js:200-250`

**Step 1: Add reconnection logic for closed connections**

Update the connection close handler in `connectToDevice`:
```javascript
conn.on('close', () => {
  console.log('[usePeerSync] Connection closed:', deviceName)
  connectedDevices.value.delete(deviceId)
  connectedDevices.value = new Map(connectedDevices.value)

  // Try to reconnect with exponential backoff
  let retryCount = 0
  const maxRetries = 5
  const baseDelay = 5000 // 5 seconds

  const reconnect = () => {
    if (retryCount >= maxRetries) {
      console.log('[usePeerSync] Max reconnection attempts reached for', deviceName)
      return
    }

    if (!peerInstance.value || peerInstance.value.destroyed) {
      console.log('[usePeerSync] Peer destroyed, cannot reconnect')
      return
    }

    retryCount++
    const delay = baseDelay * Math.pow(2, retryCount - 1) // Exponential backoff
    console.log(`[usePeerSync] Reconnecting to ${deviceName} in ${delay/1000}s (attempt ${retryCount}/${maxRetries})`)

    setTimeout(() => {
      connectToDevice(db, peerInstance.value, deviceInfo)
    }, delay)
  }

  reconnect()
})
```

**Step 2: Add network error recovery**

Update peer.on('disconnected') handler:
```javascript
peer.on('disconnected', () => {
  console.log('[usePeerSync] PeerJS disconnected')
  if (mounted) {
    syncState.value = 'disconnected'

    // Try to reconnect with exponential backoff
    let retryCount = 0
    const maxRetries = 5

    const reconnect = () => {
      if (retryCount >= maxRetries) {
        console.log('[usePeerSync] Max PeerJS reconnection attempts reached')
        syncState.value = 'error'
        syncError.value = 'Could not reconnect to signaling server'
        return
      }

      if (!mounted || !peer || peer.destroyed) {
        return
      }

      retryCount++
      const delay = 5000 * Math.pow(2, retryCount - 1)
      console.log(`[usePeerSync] Reconnecting PeerJS in ${delay/1000}s (attempt ${retryCount}/${maxRetries})`)

      setTimeout(() => {
        if (mounted && peer && !peer.destroyed) {
          peer.reconnect()
        }
      }, delay)
    }

    reconnect()
  }
})
```

**Step 3: Add error handling for sync operations**

Wrap sync operations in try-catch in `initiateSync`, `handleSyncStateMessage`, etc:
```javascript
// Example for initiateSync
async function initiateSync(db, conn) {
  try {
    console.log('[usePeerSync] Initiating sync protocol')
    syncState.value = 'syncing'

    const allDocs = await db._crdt.allDocs()
    const clockHead = allDocs.head || []

    console.log('[usePeerSync] Sending our clock head:', clockHead)
    conn.send(createSyncStateMessage({ clockHead }))

    // Reset to connected after successful sync initiation
    syncState.value = 'connected'
  } catch (err) {
    console.error('[usePeerSync] Failed to initiate sync:', err)
    syncState.value = 'error'
    syncError.value = `Sync error: ${err.message}`

    // Don't close connection on sync error, just log it
  }
}
```

**Step 4: Test error recovery**

1. Open two paired tabs
2. Disconnect network (browser DevTools -> Network -> Offline)
3. Wait 10 seconds - should show "Disconnected" or "Error"
4. Reconnect network - should automatically reconnect within 30 seconds
5. Verify sync works after reconnection

Expected: Automatic reconnection after network issues

**Step 5: Commit**

```bash
git add src/hooks/usePeerSync.js
git commit -m "feat: add error recovery and automatic reconnection with exponential backoff"
```

---

## Task 9: Update Beads Issues

Close completed Phase 5 tasks in beads.

**Step 1: Close completed beads issues**

```bash
bd close hypermark-co7.1 hypermark-co7.2 --reason="Implemented usePeerSync hook with connection management, authentication, and sync protocol"
```

**Step 2: Update Phase 5 epic status**

```bash
bd update hypermark-co7 --status=in_progress
```

**Step 3: Check remaining Phase 5 tasks**

```bash
bd epic children hypermark-co7
```

---

## Task 10: Testing & Verification

Comprehensive testing of the sync system.

**Step 1: Manual testing checklist**

Test the following scenarios:

```
[ ] 1. Two devices pair successfully
[ ] 2. Devices appear in connected devices list
[ ] 3. Adding bookmark on Device A appears on Device B
[ ] 4. Adding bookmark on Device B appears on Device A
[ ] 5. Editing bookmark syncs bidirectionally
[ ] 6. Deleting bookmark syncs bidirectionally
[ ] 7. Tags sync correctly
[ ] 8. Read-later status syncs correctly
[ ] 9. Concurrent edits to same bookmark (test CRDT merge)
[ ] 10. Concurrent edits to different bookmarks (both survive)
[ ] 11. Network disconnect/reconnect (auto-recovery)
[ ] 12. Close tab and reopen (auto-reconnect to paired devices)
[ ] 13. Three devices all paired (mesh network)
[ ] 14. ConnectionStatus shows correct state
[ ] 15. No errors in console during normal operation
```

**Step 2: Test concurrent edits**

1. Open two paired tabs (A and B)
2. In Tab A: Add bookmark "Test" with tag "tag-a"
3. Wait 1 second for sync
4. In Tab B: Verify bookmark exists
5. **Simultaneously**:
   - Tab A: Add tag "tag-from-a" to "Test"
   - Tab B: Add tag "tag-from-b" to "Test"
6. Wait for sync
7. Check both tabs: Both tags should be present (CRDT merge)

Expected: Both tags survive (set CRDT)

**Step 3: Test offline resilience**

1. Tab A and B connected
2. Tab A: Go offline (DevTools Network -> Offline)
3. Tab A: Add bookmark "Offline Bookmark"
4. Tab B: Add bookmark "Online Bookmark"
5. Tab A: Go back online
6. Wait 30 seconds for reconnection
7. Both tabs: Should have both bookmarks

Expected: Changes sync after reconnection

**Step 4: Test three-device mesh**

1. Open three tabs: A, B, C
2. Pair A with B (A shows QR, B scans)
3. Pair A with C (A shows QR, C scans)
4. Pair B with C (B shows QR, C scans)
5. Add bookmark in A - should appear in B and C
6. Add bookmark in B - should appear in A and C
7. Add bookmark in C - should appear in A and B

Expected: Full mesh sync works

**Step 5: Document test results**

Create `docs/testing/phase-5-sync-results.md` with test results.

**Step 6: Commit**

```bash
git add docs/testing/phase-5-sync-results.md
git commit -m "docs: add Phase 5 sync testing results"
```

---

## Task 11: Final Cleanup and Sync to Main

Sync beads and merge to main.

**Step 1: Run git status**

```bash
git status
```

Expected: All changes committed

**Step 2: Sync beads from main**

```bash
bd sync --from-main
```

**Step 3: Final commit if needed**

```bash
git add .
git commit -m "feat: complete Phase 5 sync protocol implementation"
```

**Step 4: Close Phase 5 epic**

```bash
bd close hypermark-co7 --reason="Phase 5 sync protocol implementation complete - full P2P sync working"
```

---

## Summary

Phase 5 implementation complete! You now have:

✅ **Device Registry** - Stores paired devices in Fireproof
✅ **usePeerSync Hook** - Core sync engine with PeerJS
✅ **Sync Protocol** - Hello, clock exchange, data sync
✅ **Real-time Sync** - Database subscriptions push changes immediately
✅ **ConnectionStatus** - Visual indicator of sync state
✅ **Error Recovery** - Automatic reconnection with exponential backoff
✅ **CRDT Merging** - Fireproof handles conflicts automatically

**What's Working:**
- Bookmarks sync automatically between paired devices
- Real-time updates (<1 second latency)
- Offline-first with automatic catch-up on reconnection
- Concurrent edits merge correctly
- Mesh network support (any number of paired devices)

**Next Steps:**
- Phase 6: Device Management UI (unpair, last-seen, sync status)
- Phase 7: Error handling and edge cases
- Phase 8: Polish and comprehensive testing
