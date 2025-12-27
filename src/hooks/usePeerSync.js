/**
 * usePeerSync Hook
 * Manages PeerJS connections and sync protocol with paired devices
 */

import { signal } from '@preact/signals'
import { useEffect } from 'preact/hooks'
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
