import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import { retrieveLEK } from '../services/key-storage'
import { deriveYjsPassword } from '../services/crypto'

// ============================================================================
// DEBUG FLAG - Set to true to enable verbose logging for bookmark persistence
// ============================================================================
const DEBUG_YJS = true

let ydoc = null
let webrtcProvider = null
let indexeddbProvider = null
let awareness = null
let webrtcProviderListeners = []
let undoManager = null
let undoManagerListeners = []

// Origin used for local bookmark operations (tracked by UndoManager)
export const LOCAL_ORIGIN = 'local'

function notifyWebrtcListeners() {
  webrtcProviderListeners.forEach(cb => cb(webrtcProvider))
}

function notifyUndoManagerListeners(event) {
  undoManagerListeners.forEach(cb => cb(event))
}

export function subscribeToUndoManager(callback) {
  undoManagerListeners.push(callback)
  return () => {
    undoManagerListeners = undoManagerListeners.filter(cb => cb !== callback)
  }
}

export function getUndoManager() {
  return undoManager
}

export function undo() {
  if (undoManager && undoManager.canUndo()) {
    undoManager.undo()
    return true
  }
  return false
}

export function redo() {
  if (undoManager && undoManager.canRedo()) {
    undoManager.redo()
    return true
  }
  return false
}

export function canUndo() {
  return undoManager?.canUndo() ?? false
}

export function canRedo() {
  return undoManager?.canRedo() ?? false
}

export function subscribeToWebrtcProvider(callback) {
  webrtcProviderListeners.push(callback)
  callback(webrtcProvider)
  return () => {
    webrtcProviderListeners = webrtcProviderListeners.filter(cb => cb !== callback)
  }
}

export function getWebrtcProvider() {
  return webrtcProvider
}

function initializeYjs(roomName = 'hypermark') {
  if (ydoc) return ydoc

  ydoc = new Y.Doc()
  indexeddbProvider = new IndexeddbPersistence(roomName, ydoc)

  indexeddbProvider.on('synced', () => {
    const bookmarksMap = ydoc.getMap('bookmarks')
    const bookmarkCount = bookmarksMap.size
    console.log('[Yjs] IndexedDB synced - loaded', bookmarkCount, 'bookmarks')

    if (DEBUG_YJS && bookmarkCount > 0) {
      console.log('[Yjs] IndexedDB bookmark summary:')
      bookmarksMap.forEach((bookmark, id) => {
        const updatedAt = bookmark?.get ? bookmark.get('updatedAt') : bookmark?.updatedAt
        const title = bookmark?.get ? bookmark.get('title') : bookmark?.title
        console.log(`  📖 ${id}: "${title}" (updatedAt: ${updatedAt} = ${updatedAt ? new Date(updatedAt).toISOString() : 'N/A'})`)
      })
    }
  })

  awareness = new Awareness(ydoc)
  webrtcProvider = null
  console.log('[Yjs] Initialized with IndexedDB only (WebRTC will be enabled after pairing)')

  if (!ydoc.getMap('bookmarks').size) {
    console.log('[Yjs] Initializing empty data structures')
  }

  // Initialize UndoManager for bookmarks
  const bookmarksMap = ydoc.getMap('bookmarks')
  undoManager = new Y.UndoManager(bookmarksMap, {
    trackedOrigins: new Set([LOCAL_ORIGIN]),
    captureTimeout: 500, // Group rapid changes within 500ms
  })

  undoManager.on('stack-item-added', (event) => {
    console.log('[Yjs] Undo stack item added:', event.type)
    if (DEBUG_YJS) {
      // Log what changed
      const meta = event.stackItem?.meta
      const deletions = event.stackItem?.deletions
      const insertions = event.stackItem?.insertions
      console.log('[Yjs] Stack item details:', {
        type: event.type,
        meta: meta ? Object.fromEntries(meta) : {},
        hasDeletions: deletions?.clients?.size > 0,
        hasInsertions: insertions?.clients?.size > 0,
      })
    }
    notifyUndoManagerListeners({ type: 'stack-item-added', ...event })
  })

  undoManager.on('stack-item-popped', (event) => {
    console.log('[Yjs] Undo stack item popped:', event.type)
    if (DEBUG_YJS) {
      // Log state after undo/redo
      console.log('[Yjs] After undo/redo - bookmark count:', bookmarksMap.size)
      console.log('[Yjs] Bookmarks after', event.type + ':')
      bookmarksMap.forEach((bookmark, id) => {
        const updatedAt = bookmark?.get ? bookmark.get('updatedAt') : bookmark?.updatedAt
        const title = bookmark?.get ? bookmark.get('title') : bookmark?.title
        console.log(`  📖 ${id}: "${title}" (updatedAt: ${updatedAt} = ${updatedAt ? new Date(updatedAt).toISOString() : 'N/A'})`)
      })
    }
    notifyUndoManagerListeners({ type: 'stack-item-popped', ...event })
  })

  console.log('[Yjs] UndoManager initialized')

  return ydoc
}

async function autoReconnectWebRTC() {
  try {
    if (webrtcProvider) {
      console.log('[Yjs] WebRTC already connected, skipping auto-reconnect')
      return
    }

    const lek = await retrieveLEK()
    if (!lek) {
      console.log('[Yjs] No LEK found, device not yet paired')
      return
    }

    console.log('[Yjs] LEK found, auto-reconnecting to WebRTC...')
    const yjsPassword = await deriveYjsPassword(lek)
    reconnectYjsWebRTC(yjsPassword)
  } catch (err) {
    console.error('[Yjs] Auto-reconnect failed:', err)
  }
}

export function useYjs() {
  const [doc, setDoc] = useState(() => initializeYjs())
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    indexeddbProvider?.whenSynced.then(() => {
      setSynced(true)
    })
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

export function setYjsRoomPassword(password) {
  if (webrtcProvider) {
    webrtcProvider.password = password
    console.log('[Yjs] Room password set')
  }
}

export function disconnectYjsWebRTC() {
  if (webrtcProvider) {
    webrtcProvider.disconnect()
  }
}

export function reconnectYjsWebRTC(password = null) {
  if (!webrtcProvider && ydoc && awareness) {
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
    console.log('[Yjs] Creating WebRTC provider with password:', password ? `${password.substring(0, 20)}...` : 'null')
    console.log('[Yjs] Password type:', typeof password, 'length:', password?.length)
    console.log('[Yjs] Signaling server:', signalingUrl)
    
    const provider = new WebrtcProvider('hypermark', ydoc, {
      signaling: [signalingUrl],
      password: password,
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

    provider.on('synced', ({ synced }) => {
      console.log('[Yjs] WebRTC synced:', synced)
    })

    webrtcProvider = provider
    notifyWebrtcListeners()
    console.log('[Yjs] WebRTC provider created and connecting')
  } else if (webrtcProvider && !webrtcProvider.connected) {
    webrtcProvider.connect()
    console.log('[Yjs] WebRTC reconnecting')
  }
}

export function getYdocInstance() {
  return ydoc
}

export { ydoc, indexeddbProvider, awareness }
