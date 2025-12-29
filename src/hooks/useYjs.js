/**
 * useYjs Hook
 * Manages Yjs document, WebRTC sync, and IndexedDB persistence
 */

import { useEffect, useState } from 'preact/hooks'
import { signal } from '@preact/signals'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import { retrieveLEK } from '../services/key-storage'
import { exportLEK, arrayBufferToBase64 } from '../services/crypto'

// Singleton Yjs doc (shared across app)
let ydoc = null
const webrtcProviderSignal = signal(null)
let indexeddbProvider = null
let awareness = null

/**
 * Initialize Yjs document with providers
 */
function initializeYjs(roomName = 'hypermark') {
  if (ydoc) return ydoc

  // Create Yjs document
  ydoc = new Y.Doc()

  // Setup IndexedDB persistence
  indexeddbProvider = new IndexeddbPersistence(roomName, ydoc)

  indexeddbProvider.on('synced', () => {
    console.log('[Yjs] IndexedDB synced')
  })

  // Create awareness instance for presence/user info sharing
  awareness = new Awareness(ydoc)

  // WebRTC provider will be created later during device pairing
  // For now, just use local IndexedDB storage
  webrtcProviderSignal.value = null
  console.log('[Yjs] Initialized with IndexedDB only (WebRTC will be enabled after pairing)')

  // Initialize data structures
  if (!ydoc.getMap('bookmarks').size) {
    console.log('[Yjs] Initializing empty data structures')
  }

  return ydoc
}

/**
 * Auto-reconnect to WebRTC if device is already paired
 * Checks for LEK in storage and reconnects if found
 */
async function autoReconnectWebRTC() {
  try {
    // Check if WebRTC is already connected
    if (webrtcProviderSignal.value) {
      console.log('[Yjs] WebRTC already connected, skipping auto-reconnect')
      return
    }

    // Check if LEK exists (device is paired)
    const lek = await retrieveLEK()
    if (!lek) {
      console.log('[Yjs] No LEK found, device not yet paired')
      return
    }

    console.log('[Yjs] LEK found, auto-reconnecting to WebRTC...')

    // Export LEK and convert to base64 for Yjs room password
    const lekForYjs = await exportLEK(lek)
    const lekBase64 = arrayBufferToBase64(lekForYjs)

    // Reconnect to WebRTC with LEK as password
    reconnectYjsWebRTC(lekBase64)
  } catch (err) {
    console.error('[Yjs] Auto-reconnect failed:', err)
    // Don't throw - this is a best-effort operation
  }
}

/**
 * Hook to access Yjs document
 */
export function useYjs() {
  const [doc, setDoc] = useState(() => initializeYjs())
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    // Use whenSynced promise - resolves immediately if already synced
    indexeddbProvider?.whenSynced.then(() => {
      setSynced(true)
    })

    // Auto-reconnect to WebRTC if LEK exists (device is already paired)
    autoReconnectWebRTC()
  }, [])

  return {
    doc,
    synced,
    bookmarks: doc.getMap('bookmarks'),
    devices: doc.getMap('devices'),
    settings: doc.getMap('settings'),
  }
}

/**
 * Set WebRTC room password for secure P2P sync
 * Call this after device pairing with shared secret
 */
export function setYjsRoomPassword(password) {
  if (webrtcProviderSignal.value) {
    webrtcProviderSignal.value.password = password
    console.log('[Yjs] Room password set')
  }
}

/**
 * Disconnect from WebRTC (for pairing flow)
 */
export function disconnectYjsWebRTC() {
  if (webrtcProviderSignal.value) {
    webrtcProviderSignal.value.disconnect()
  }
}

/**
 * Reconnect to WebRTC (after pairing)
 * Creates provider if it doesn't exist yet
 * @param {string} password - Optional room password (for initial creation)
 */
export function reconnectYjsWebRTC(password = null) {
  if (!webrtcProviderSignal.value && ydoc && awareness) {
    // Create WebRTC provider for the first time
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
    console.log('[Yjs] Creating WebRTC provider with password:', password ? `${password.substring(0, 20)}...` : 'null')
    console.log('[Yjs] Password type:', typeof password, 'length:', password?.length)
    console.log('[Yjs] Signaling server:', signalingUrl)
    const provider = new WebrtcProvider('hypermark', ydoc, {
      signaling: [signalingUrl],
      password: password, // Use provided password if available
      awareness: awareness,
      maxConns: 20,
      filterBcConns: true,
    })

    provider.on('status', ({ connected }) => {
      console.log('[Yjs] WebRTC status:', connected ? 'connected' : 'disconnected')
    })

    provider.on('peers', ({ added, removed }) => {
      if (added.length) console.log('[Yjs] Peers added:', added)
      if (removed.length) console.log('[Yjs] Peers removed:', removed)
    })

    // Add error handler to catch connection issues
    provider.on('synced', ({ synced }) => {
      console.log('[Yjs] WebRTC synced:', synced)
    })

    // Update signal to trigger reactivity
    webrtcProviderSignal.value = provider
    console.log('[Yjs] WebRTC provider created and connecting')
  } else if (webrtcProviderSignal.value && !webrtcProviderSignal.value.connected) {
    webrtcProviderSignal.value.connect()
    console.log('[Yjs] WebRTC reconnecting')
  }
}

/**
 * Get the current ydoc instance
 * Returns null if not initialized
 */
export function getYdocInstance() {
  return ydoc
}

export { ydoc, webrtcProviderSignal, indexeddbProvider, awareness }
