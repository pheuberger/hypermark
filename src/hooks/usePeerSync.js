/**
 * usePeerSync Hook
 * Manages PeerJS connections and sync protocol with paired devices
 */

import { signal } from '@preact/signals'
import { useEffect, useRef } from 'preact/hooks'
import Peer from 'peerjs'
import { getPeerJSId } from '../utils/device-id'
import { getAllPairedDevices, updateDeviceLastSeen, getDevice } from '../services/device-registry'
import { retrieveDeviceKeypair } from '../services/key-storage'
import { exportPublicKey } from '../services/crypto'
import { getDeviceInfo } from '../utils/device-id'
import {
  MESSAGE_TYPES,
  createHelloMessage,
  createHelloAckMessage,
  createErrorMessage,
  createSyncStateMessage,
  createSyncRequestMessage,
  createSyncDataMessage,
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
  const reconnectionTimeouts = useRef(new Set())

  useEffect(() => {
    if (!db) return

    let mounted = true
    let peer = null
    let unsubscribe = null

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
            connectToPairedDevices(db, peer, reconnectionTimeouts)
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

        // Subscribe to local database changes
        unsubscribe = db.subscribe(async (changes) => {
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

      // Unsubscribe from database changes
      if (unsubscribe) {
        unsubscribe()
      }

      // Clear all reconnection timeouts
      if (reconnectionTimeouts.current) {
        reconnectionTimeouts.current.forEach(clearTimeout)
        reconnectionTimeouts.current.clear()
      }

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
async function connectToPairedDevices(db, peer, reconnectionTimeouts) {
  try {
    const devices = await getAllPairedDevices(db)
    console.log('[usePeerSync] Connecting to', devices.length, 'paired devices')

    for (const device of devices) {
      try {
        await connectToDevice(db, peer, device, reconnectionTimeouts)
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
async function connectToDevice(db, peer, deviceInfo, reconnectionTimeouts) {
  if (!db) {
    console.error('[usePeerSync] Cannot connect: database not available')
    return
  }

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
    const timeoutId = setTimeout(() => {
      if (peerInstance.value && !peerInstance.value.destroyed) {
        connectToDevice(db, peerInstance.value, deviceInfo, reconnectionTimeouts)
      }
    }, 10000)

    if (reconnectionTimeouts && reconnectionTimeouts.current) {
      reconnectionTimeouts.current.add(timeoutId)
    }
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
  try {
    if (conn.open) {
      conn.send(createHelloAckMessage({
        deviceId: deviceInfo.id,
        deviceName: deviceInfo.name,
      }))
    } else {
      console.warn('[usePeerSync] Connection closed before sending HELLO_ACK')
    }
  } catch (err) {
    console.error('[usePeerSync] Failed to send HELLO_ACK:', err)
  }

  // Start sync protocol
  await initiateSync(db, conn)
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

  // Start sync protocol
  await initiateSync(db, conn)
}

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

/**
 * Handle ERROR message from peer
 */
function handleErrorMessage(msg) {
  const { error, code } = msg
  console.error('[usePeerSync] Received error from peer:', error, code)
  syncError.value = `Peer error: ${error}`
  syncState.value = 'error'
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
