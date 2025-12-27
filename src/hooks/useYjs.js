/**
 * useYjs Hook
 * Manages Yjs document, WebRTC sync, and IndexedDB persistence
 */

import { useEffect, useState } from 'preact/hooks'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'

// Singleton Yjs doc (shared across app)
let ydoc = null
let webrtcProvider = null
let indexeddbProvider = null

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

  // Setup WebRTC provider for P2P sync
  // Note: We'll disable this initially and enable only for paired devices
  webrtcProvider = new WebrtcProvider(roomName, ydoc, {
    signaling: ['wss://signaling.yjs.dev'], // Public signaling server
    password: null, // We'll set this per-room for security
    awareness: {
      // Share device info with peers
      deviceId: null, // Set after pairing
      deviceName: null,
    },
    maxConns: 20, // Max peer connections
    filterBcConns: true, // Only connect to peers in same room
  })

  webrtcProvider.on('status', ({ connected }) => {
    console.log('[Yjs] WebRTC status:', connected ? 'connected' : 'disconnected')
  })

  webrtcProvider.on('peers', ({ added, removed }) => {
    if (added.length) console.log('[Yjs] Peers added:', added)
    if (removed.length) console.log('[Yjs] Peers removed:', removed)
  })

  // Initialize data structures
  if (!ydoc.getMap('bookmarks').size) {
    console.log('[Yjs] Initializing empty data structures')
  }

  return ydoc
}

/**
 * Hook to access Yjs document
 */
export function useYjs() {
  const [doc, setDoc] = useState(() => initializeYjs())
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    // Wait for IndexedDB to sync
    const handleSynced = () => setSynced(true)
    indexeddbProvider?.on('synced', handleSynced)

    return () => {
      indexeddbProvider?.off('synced', handleSynced)
    }
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
  if (webrtcProvider) {
    webrtcProvider.password = password
    console.log('[Yjs] Room password set')
  }
}

/**
 * Disconnect from WebRTC (for pairing flow)
 */
export function disconnectYjsWebRTC() {
  if (webrtcProvider) {
    webrtcProvider.disconnect()
  }
}

/**
 * Reconnect to WebRTC (after pairing)
 */
export function reconnectYjsWebRTC() {
  if (webrtcProvider) {
    webrtcProvider.connect()
  }
}

export { ydoc, webrtcProvider, indexeddbProvider }
