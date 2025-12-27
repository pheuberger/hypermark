/**
 * useYjs Hook
 * Manages Yjs document, WebRTC sync, and IndexedDB persistence
 */

import { useEffect, useState } from 'preact/hooks'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'

// Singleton Yjs doc (shared across app)
let ydoc = null
let webrtcProvider = null
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
  webrtcProvider = null
  console.log('[Yjs] Initialized with IndexedDB only (WebRTC will be enabled after pairing)')

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
 * Creates provider if it doesn't exist yet
 */
export function reconnectYjsWebRTC() {
  if (!webrtcProvider && ydoc && awareness) {
    // Create WebRTC provider for the first time
    webrtcProvider = new WebrtcProvider('hypermark', ydoc, {
      signaling: ['wss://signaling.yjs.dev'],
      password: null, // Will be set by setYjsRoomPassword
      awareness: awareness,
      maxConns: 20,
      filterBcConns: true,
    })

    webrtcProvider.on('status', ({ connected }) => {
      console.log('[Yjs] WebRTC status:', connected ? 'connected' : 'disconnected')
    })

    webrtcProvider.on('peers', ({ added, removed }) => {
      if (added.length) console.log('[Yjs] Peers added:', added)
      if (removed.length) console.log('[Yjs] Peers removed:', removed)
    })

    console.log('[Yjs] WebRTC provider created and connecting')
  } else if (webrtcProvider && !webrtcProvider.connected) {
    webrtcProvider.connect()
    console.log('[Yjs] WebRTC reconnecting')
  }
}

export { ydoc, webrtcProvider, indexeddbProvider, awareness }
