import { useEffect, useState } from 'react'
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'
import { IndexeddbPersistence } from 'y-indexeddb'
import { Awareness } from 'y-protocols/awareness'
import { retrieveLEK } from '../services/key-storage'
import { deriveYjsPassword } from '../services/crypto'

let ydoc = null
let webrtcProvider = null
let indexeddbProvider = null
let awareness = null
let webrtcProviderListeners = []

function notifyWebrtcListeners() {
  webrtcProviderListeners.forEach(cb => cb(webrtcProvider))
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
    console.log('[Yjs] IndexedDB synced')
  })

  awareness = new Awareness(ydoc)
  webrtcProvider = null
  console.log('[Yjs] Initialized with IndexedDB only (WebRTC will be enabled after pairing)')

  if (!ydoc.getMap('bookmarks').size) {
    console.log('[Yjs] Initializing empty data structures')
  }

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
  // If password provided and provider exists, destroy old one to create new with password
  if (password && webrtcProvider) {
    console.log('[Yjs] Destroying old provider to reconnect with password')
    webrtcProvider.destroy()
    webrtcProvider = null
    notifyWebrtcListeners()
  }

  if (!webrtcProvider && ydoc && awareness) {
    const signalingUrl = import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
    console.log('[Yjs] Creating WebRTC provider with password:', password ? `${password.substring(0, 20)}...` : 'null')
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
