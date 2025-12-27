# Yjs Migration Plan: True P2P Sync Implementation

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace Fireproof with Yjs to achieve true peer-to-peer synchronization without cloud infrastructure dependencies.

**Architecture:** Yjs CRDT library with WebRTC provider for P2P sync, IndexedDB persistence, and device pairing over PeerJS for initial connection establishment.

**Tech Stack:** Yjs (CRDTs), y-webrtc (P2P provider), y-indexeddb (persistence), PeerJS (signaling for pairing only)

---

## Executive Summary

**Why Migrate:**
- Fireproof requires cloud-based connectors (PartyKit, IPFS) for proper CRDT block sync
- Current manual sync implementation causes infinite loops and block errors
- Yjs provides battle-tested P2P sync with zero cloud infrastructure
- Used in production by Notion, Linear, Figma, and others

**What Changes:**
- Database layer: Fireproof → Yjs
- Data model: JSON documents → Yjs shared types (Y.Map, Y.Array)
- Sync: Custom protocol → y-webrtc provider
- Storage: Fireproof → y-indexeddb

**What Stays:**
- Device pairing flow (QR codes, crypto verification)
- PeerJS for initial device discovery
- UI components (just change data layer)
- Security model (end-to-end encryption via pairing)

**Timeline:** ~1-2 days for core migration, 1 day for testing

---

## Current State Analysis

### What We Have (Fireproof)

**Files to Replace/Modify:**
```
src/hooks/useFireproof.js              (~200 lines) - Database initialization
src/hooks/usePeerSync.js               (~660 lines) - Manual sync protocol
src/services/bookmarks.js              (~180 lines) - Bookmark CRUD
src/services/device-registry.js        (~140 lines) - Device storage
src/components/BookmarkList.jsx        (~100 lines) - UI consuming Fireproof
```

**Dependencies to Remove:**
```json
{
  "@fireproof/core": "^0.19.0"
}
```

**Dependencies to Add:**
```json
{
  "yjs": "^13.6.10",
  "y-webrtc": "^10.3.0",
  "y-indexeddb": "^9.0.12"
}
```

### Problems Being Solved

1. ✅ **Block not in reader** - Yjs handles CRDT sync internally
2. ✅ **Infinite sync loops** - y-webrtc manages change propagation
3. ✅ **Cloud dependency** - Pure P2P with Yjs
4. ✅ **Complex sync code** - 660 lines → ~50 lines
5. ✅ **Merge conflicts** - Yjs CRDTs handle automatically

---

## Target Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                         Device A                            │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐ │
│  │              │    │              │    │              │ │
│  │  React UI    │◄──►│   Yjs Doc    │◄──►│  IndexedDB   │ │
│  │              │    │              │    │              │ │
│  └──────────────┘    └──────┬───────┘    └──────────────┘ │
│                              │                              │
└──────────────────────────────┼──────────────────────────────┘
                               │
                        y-webrtc Provider
                        (WebRTC P2P Sync)
                               │
┌──────────────────────────────┼──────────────────────────────┐
│                              │                              │
│  ┌──────────────┐    ┌──────▼───────┐    ┌──────────────┐ │
│  │              │    │              │    │              │ │
│  │  React UI    │◄──►│   Yjs Doc    │◄──►│  IndexedDB   │ │
│  │              │    │              │    │              │ │
│  └──────────────┘    └──────────────┘    └──────────────┘ │
│                         Device B                            │
└─────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

**Yjs Doc:**
- Shared state container (bookmarks, devices, settings)
- CRDT types: Y.Map (objects), Y.Array (lists), Y.Text (strings)
- Automatic conflict resolution
- Change history and undo/redo

**y-webrtc Provider:**
- WebRTC connection management
- Automatic peer discovery (via signaling server)
- Change propagation between peers
- Reconnection logic

**y-indexeddb Provider:**
- Local persistence
- Loads state on app start
- Saves changes automatically

**PeerJS (Still Used):**
- Only for device pairing QR code flow
- Ephemeral connection during pairing
- Not used for ongoing sync

---

## Data Model Migration

### Fireproof Schema → Yjs Schema

**Fireproof (Document-based):**
```javascript
// Each bookmark is a document
{
  _id: "bookmark:uuid",
  type: "bookmark",
  url: "https://...",
  title: "...",
  tags: ["tag1", "tag2"],
  createdAt: 1234567890,
  readLater: true
}
```

**Yjs (Shared Types):**
```javascript
// Root document structure
const ydoc = new Y.Doc()

// Bookmarks as Y.Map of Y.Map
const bookmarks = ydoc.getMap('bookmarks')
bookmarks.set('bookmark:uuid', new Y.Map([
  ['id', 'bookmark:uuid'],
  ['url', 'https://...'],
  ['title', '...'],
  ['tags', new Y.Array(['tag1', 'tag2'])],
  ['createdAt', 1234567890],
  ['readLater', true]
]))

// Devices as Y.Map
const devices = ydoc.getMap('devices')

// Settings as Y.Map
const settings = ydoc.getMap('settings')
```

### Key Differences

| Aspect | Fireproof | Yjs |
|--------|-----------|-----|
| **Data structure** | Flat documents | Nested shared types |
| **IDs** | String `_id` | Map keys |
| **Lists** | Arrays | Y.Array (CRDT) |
| **Updates** | `db.put(doc)` | `map.set(key, value)` |
| **Queries** | `db.allDocs()` | `map.entries()` |
| **Observe** | `db.subscribe()` | `map.observe()` |
| **Delete** | `db.del(id)` | `map.delete(key)` |

---

## Implementation Tasks

### Task 1: Setup Yjs Infrastructure

**Goal:** Install dependencies and create core Yjs hook

**Files:**
- Create: `src/hooks/useYjs.js`
- Modify: `package.json`

**Step 1: Install dependencies**
```bash
npm install yjs y-webrtc y-indexeddb
npm uninstall @fireproof/core
```

**Step 2: Create useYjs hook**

Create `src/hooks/useYjs.js`:
```javascript
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
```

**Step 3: Test initialization**

Add to `src/app.jsx` temporarily:
```javascript
import { useYjs } from './hooks/useYjs'

function App() {
  const { doc, synced, bookmarks } = useYjs()

  console.log('Yjs doc:', doc)
  console.log('Synced:', synced)
  console.log('Bookmarks:', bookmarks.size)

  // ... rest of app
}
```

Run app and verify:
- No errors in console
- IndexedDB database created (Application → IndexedDB → hypermark)
- Console shows "IndexedDB synced"

**Step 4: Commit**
```bash
git add src/hooks/useYjs.js package.json package-lock.json
git commit -m "feat: add Yjs infrastructure with WebRTC and IndexedDB providers"
```

---

### Task 2: Migrate Bookmark Service

**Goal:** Replace Fireproof bookmark operations with Yjs

**Files:**
- Replace: `src/services/bookmarks.js`

**Step 1: Rewrite bookmarks.js for Yjs**

```javascript
/**
 * Bookmark Service
 * CRUD operations for bookmarks using Yjs
 */

import * as Y from 'yjs'
import { ydoc } from '../hooks/useYjs'

/**
 * Get all bookmarks as array
 */
export function getAllBookmarks() {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmarks = []

  for (const [id, bookmark] of bookmarksMap.entries()) {
    bookmarks.push(bookmarkToObject(id, bookmark))
  }

  // Sort by createdAt descending
  return bookmarks.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Get single bookmark by ID
 */
export function getBookmark(id) {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) return null
  return bookmarkToObject(id, bookmark)
}

/**
 * Create new bookmark
 */
export function createBookmark(bookmarkData) {
  const { url, title, description = '', tags = [], readLater = false } = bookmarkData

  if (!url || !title) {
    throw new Error('URL and title are required')
  }

  const id = `bookmark:${generateId()}`
  const now = Date.now()

  // Create Y.Map for bookmark
  const bookmark = new Y.Map([
    ['id', id],
    ['url', url],
    ['title', title],
    ['description', description],
    ['tags', new Y.Array(tags)],
    ['readLater', readLater],
    ['createdAt', now],
    ['updatedAt', now],
  ])

  // Add to bookmarks map
  const bookmarksMap = ydoc.getMap('bookmarks')
  bookmarksMap.set(id, bookmark)

  console.log('[Bookmarks] Created:', id)
  return bookmarkToObject(id, bookmark)
}

/**
 * Update existing bookmark
 */
export function updateBookmark(id, updates) {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  // Update fields
  if (updates.title !== undefined) bookmark.set('title', updates.title)
  if (updates.url !== undefined) bookmark.set('url', updates.url)
  if (updates.description !== undefined) bookmark.set('description', updates.description)
  if (updates.readLater !== undefined) bookmark.set('readLater', updates.readLater)

  // Update tags (replace entire array)
  if (updates.tags !== undefined) {
    const tagsArray = bookmark.get('tags')
    tagsArray.delete(0, tagsArray.length) // Clear
    tagsArray.insert(0, updates.tags) // Insert new
  }

  bookmark.set('updatedAt', Date.now())

  console.log('[Bookmarks] Updated:', id)
  return bookmarkToObject(id, bookmark)
}

/**
 * Delete bookmark
 */
export function deleteBookmark(id) {
  const bookmarksMap = ydoc.getMap('bookmarks')

  if (!bookmarksMap.has(id)) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  bookmarksMap.delete(id)
  console.log('[Bookmarks] Deleted:', id)
}

/**
 * Toggle read-later status
 */
export function toggleReadLater(id) {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const current = bookmark.get('readLater')
  bookmark.set('readLater', !current)
  bookmark.set('updatedAt', Date.now())

  console.log('[Bookmarks] Toggled read-later:', id, !current)
  return !current
}

/**
 * Add tag to bookmark
 */
export function addTag(id, tag) {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const tags = bookmark.get('tags')
  if (!tags.toArray().includes(tag)) {
    tags.push([tag])
    bookmark.set('updatedAt', Date.now())
    console.log('[Bookmarks] Added tag:', id, tag)
  }
}

/**
 * Remove tag from bookmark
 */
export function removeTag(id, tag) {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const tags = bookmark.get('tags')
  const index = tags.toArray().indexOf(tag)
  if (index !== -1) {
    tags.delete(index, 1)
    bookmark.set('updatedAt', Date.now())
    console.log('[Bookmarks] Removed tag:', id, tag)
  }
}

/**
 * Search bookmarks
 */
export function searchBookmarks(query) {
  const all = getAllBookmarks()
  const lowerQuery = query.toLowerCase()

  return all.filter(bookmark => {
    return (
      bookmark.title.toLowerCase().includes(lowerQuery) ||
      bookmark.description.toLowerCase().includes(lowerQuery) ||
      bookmark.url.toLowerCase().includes(lowerQuery) ||
      bookmark.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  })
}

/**
 * Filter bookmarks by tag
 */
export function getBookmarksByTag(tag) {
  const all = getAllBookmarks()
  return all.filter(bookmark => bookmark.tags.includes(tag))
}

/**
 * Get all read-later bookmarks
 */
export function getReadLaterBookmarks() {
  const all = getAllBookmarks()
  return all.filter(bookmark => bookmark.readLater)
}

/**
 * Get all unique tags
 */
export function getAllTags() {
  const bookmarksMap = ydoc.getMap('bookmarks')
  const tagsSet = new Set()

  for (const [_, bookmark] of bookmarksMap.entries()) {
    const tags = bookmark.get('tags')
    if (tags) {
      tags.toArray().forEach(tag => tagsSet.add(tag))
    }
  }

  return Array.from(tagsSet).sort()
}

// Helper functions

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function bookmarkToObject(id, ymap) {
  return {
    id: id,
    url: ymap.get('url'),
    title: ymap.get('title'),
    description: ymap.get('description') || '',
    tags: ymap.get('tags')?.toArray() || [],
    readLater: ymap.get('readLater') || false,
    createdAt: ymap.get('createdAt'),
    updatedAt: ymap.get('updatedAt'),
  }
}
```

**Step 2: Test bookmark operations**

In browser console:
```javascript
import * as bookmarks from './src/services/bookmarks.js'

// Create
const bm = bookmarks.createBookmark({
  url: 'https://test.com',
  title: 'Test',
  tags: ['test']
})

// Get all
console.log(bookmarks.getAllBookmarks())

// Update
bookmarks.updateBookmark(bm.id, { title: 'Updated' })

// Delete
bookmarks.deleteBookmark(bm.id)
```

**Step 3: Commit**
```bash
git add src/services/bookmarks.js
git commit -m "refactor: migrate bookmark service to Yjs"
```

---

### Task 3: Update UI Components

**Goal:** Replace Fireproof hooks with Yjs observers in React components

**Files:**
- Modify: `src/components/BookmarkList.jsx`
- Modify: `src/components/BookmarkItem.jsx`
- Modify: `src/components/AddBookmark.jsx`

**Step 1: Update BookmarkList to observe Yjs**

```javascript
/**
 * BookmarkList Component
 * Displays list of bookmarks with real-time updates from Yjs
 */

import { useEffect, useState } from 'preact/hooks'
import { useYjs } from '../hooks/useYjs'
import { getAllBookmarks } from '../services/bookmarks'
import BookmarkItem from './BookmarkItem'

export default function BookmarkList({ filter = 'all' }) {
  const { bookmarks: bookmarksMap } = useYjs()
  const [bookmarks, setBookmarks] = useState([])

  // Load bookmarks and setup observer
  useEffect(() => {
    // Initial load
    loadBookmarks()

    // Observe changes to bookmarks map
    const observer = () => {
      console.log('[BookmarkList] Bookmarks changed, reloading')
      loadBookmarks()
    }

    bookmarksMap.observe(observer)

    return () => {
      bookmarksMap.unobserve(observer)
    }
  }, [bookmarksMap, filter])

  function loadBookmarks() {
    let loaded = getAllBookmarks()

    // Apply filter
    if (filter === 'read-later') {
      loaded = loaded.filter(bm => bm.readLater)
    } else if (filter === 'recent') {
      loaded = loaded.slice(0, 10)
    }

    setBookmarks(loaded)
  }

  if (!bookmarks.length) {
    return (
      <div class="empty-state">
        <p>No bookmarks yet. Add your first one!</p>
      </div>
    )
  }

  return (
    <div class="bookmark-list">
      {bookmarks.map(bookmark => (
        <BookmarkItem key={bookmark.id} bookmark={bookmark} />
      ))}
    </div>
  )
}
```

**Step 2: Update BookmarkItem**

```javascript
import { updateBookmark, deleteBookmark, toggleReadLater } from '../services/bookmarks'

export default function BookmarkItem({ bookmark }) {
  function handleToggleReadLater() {
    toggleReadLater(bookmark.id)
  }

  function handleDelete() {
    if (confirm('Delete this bookmark?')) {
      deleteBookmark(bookmark.id)
    }
  }

  return (
    <div class="bookmark-item">
      <h3>{bookmark.title}</h3>
      <a href={bookmark.url} target="_blank">{bookmark.url}</a>
      <div class="tags">
        {bookmark.tags.map(tag => (
          <span key={tag} class="tag">{tag}</span>
        ))}
      </div>
      <div class="actions">
        <button onClick={handleToggleReadLater}>
          {bookmark.readLater ? 'Remove from Read Later' : 'Read Later'}
        </button>
        <button onClick={handleDelete}>Delete</button>
      </div>
    </div>
  )
}
```

**Step 3: Update AddBookmark**

```javascript
import { useState } from 'preact/hooks'
import { createBookmark } from '../services/bookmarks'

export default function AddBookmark() {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [tags, setTags] = useState('')

  function handleSubmit(e) {
    e.preventDefault()

    if (!url || !title) {
      alert('URL and title are required')
      return
    }

    createBookmark({
      url,
      title,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
    })

    // Reset form
    setUrl('')
    setTitle('')
    setTags('')
  }

  return (
    <form onSubmit={handleSubmit} class="add-bookmark">
      <input
        type="url"
        placeholder="URL"
        value={url}
        onChange={e => setUrl(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Title"
        value={title}
        onChange={e => setTitle(e.target.value)}
        required
      />
      <input
        type="text"
        placeholder="Tags (comma-separated)"
        value={tags}
        onChange={e => setTags(e.target.value)}
      />
      <button type="submit">Add Bookmark</button>
    </form>
  )
}
```

**Step 4: Test UI updates**

1. Open two browser tabs
2. Add bookmark in Tab 1 → should appear in Tab 2 instantly
3. Edit bookmark in Tab 2 → should update in Tab 1 instantly
4. Delete in Tab 1 → should disappear in Tab 2 instantly

**Step 5: Commit**
```bash
git add src/components/BookmarkList.jsx src/components/BookmarkItem.jsx src/components/AddBookmark.jsx
git commit -m "refactor: update UI components to use Yjs observers"
```

---

### Task 4: Integrate Yjs with Device Pairing

**Goal:** Use shared pairing key as Yjs room password for secure P2P sync

**Files:**
- Modify: `src/components/pairing/PairingFlow.jsx`
- Modify: `src/services/device-registry.js`

**Step 1: Store device info in Yjs instead of Fireproof**

Update `src/services/device-registry.js`:
```javascript
/**
 * Device Registry
 * Store paired devices in Yjs
 */

import * as Y from 'yjs'
import { ydoc } from '../hooks/useYjs'

export function addPairedDevice(deviceInfo) {
  const { deviceId, deviceName, peerID, publicKey } = deviceInfo

  const devicesMap = ydoc.getMap('devices')

  const device = new Y.Map([
    ['deviceId', deviceId],
    ['deviceName', deviceName],
    ['peerID', peerID],
    ['publicKey', publicKey],
    ['pairedAt', Date.now()],
    ['lastSeen', Date.now()],
  ])

  devicesMap.set(deviceId, device)
  console.log('[DeviceRegistry] Device added:', deviceName)

  return deviceToObject(deviceId, device)
}

export function getAllPairedDevices() {
  const devicesMap = ydoc.getMap('devices')
  const devices = []

  for (const [id, device] of devicesMap.entries()) {
    devices.push(deviceToObject(id, device))
  }

  return devices
}

export function getDevice(deviceId) {
  const devicesMap = ydoc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (!device) return null
  return deviceToObject(deviceId, device)
}

export function updateDeviceLastSeen(deviceId) {
  const devicesMap = ydoc.getMap('devices')
  const device = devicesMap.get(deviceId)

  if (device) {
    device.set('lastSeen', Date.now())
  }
}

export function unpairDevice(deviceId) {
  const devicesMap = ydoc.getMap('devices')
  devicesMap.delete(deviceId)
  console.log('[DeviceRegistry] Device unpaired:', deviceId)
}

function deviceToObject(id, ymap) {
  return {
    deviceId: id,
    deviceName: ymap.get('deviceName'),
    peerID: ymap.get('peerID'),
    publicKey: ymap.get('publicKey'),
    pairedAt: ymap.get('pairedAt'),
    lastSeen: ymap.get('lastSeen'),
  }
}
```

**Step 2: Set Yjs room password after pairing**

Update `src/components/pairing/PairingFlow.jsx`:

Add import:
```javascript
import { setYjsRoomPassword, reconnectYjsWebRTC } from '../../hooks/useYjs'
```

In `handlePairingComplete` (responder) and `handlePairingAck` (initiator), after storing LEK:

```javascript
// After successful pairing and LEK import...

// Use LEK as Yjs room password for secure sync
const lekBase64 = await exportKey(lek)
setYjsRoomPassword(lekBase64)

// Reconnect WebRTC with new password
reconnectYjsWebRTC()

console.log('[PairingFlow] Yjs sync enabled with shared secret')
```

**Step 3: Test secure sync**

1. Open two tabs, complete pairing
2. Verify console shows "Yjs sync enabled with shared secret"
3. Add bookmark in Tab 1 → appears in Tab 2
4. Open third tab (unpaired) → should NOT see bookmarks from Tab 1/2

Expected: Only paired devices sync

**Step 4: Commit**
```bash
git add src/components/pairing/PairingFlow.jsx src/services/device-registry.js
git commit -m "feat: integrate Yjs with device pairing for secure P2P sync"
```

---

### Task 5: Remove Fireproof and Old Sync Code

**Goal:** Clean up deprecated code

**Files to Delete:**
```bash
src/hooks/useFireproof.js
src/hooks/usePeerSync.js
src/services/sync-messages.js
src/components/sync/ConnectionStatus.jsx  # Will rebuild simpler version
```

**Step 1: Remove files**
```bash
rm src/hooks/useFireproof.js
rm src/hooks/usePeerSync.js
rm src/services/sync-messages.js
rm src/components/sync/ConnectionStatus.jsx
```

**Step 2: Remove Fireproof from App.jsx**

Remove any references to:
- `useFireproof`
- `usePeerSync`
- `ConnectionStatus` (old version)

**Step 3: Verify app still works**

Test all features:
- Add/edit/delete bookmarks
- Tag management
- Read-later toggle
- Search
- Two-tab sync

**Step 4: Commit**
```bash
git add -A
git commit -m "refactor: remove Fireproof and old sync code"
```

---

### Task 6: Create New ConnectionStatus Component

**Goal:** Simple sync indicator for Yjs

**Files:**
- Create: `src/components/sync/ConnectionStatus.jsx`

```javascript
/**
 * ConnectionStatus Component
 * Shows Yjs WebRTC sync status
 */

import { useEffect, useState } from 'preact/hooks'
import { webrtcProvider } from '../../hooks/useYjs'

export default function ConnectionStatus() {
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)

  useEffect(() => {
    if (!webrtcProvider) return

    const handleStatus = ({ connected }) => {
      setConnected(connected)
    }

    const handlePeers = ({ webrtcPeers }) => {
      setPeerCount(webrtcPeers.length)
    }

    webrtcProvider.on('status', handleStatus)
    webrtcProvider.on('peers', handlePeers)

    // Get initial state
    setConnected(webrtcProvider.connected)
    setPeerCount(webrtcProvider.room?.webrtcConns.size || 0)

    return () => {
      webrtcProvider.off('status', handleStatus)
      webrtcProvider.off('peers', handlePeers)
    }
  }, [])

  const getBadgeStyle = () => {
    if (connected && peerCount > 0) return 'bg-green-100 text-green-800'
    if (connected) return 'bg-yellow-100 text-yellow-800'
    return 'bg-gray-100 text-gray-800'
  }

  const getStatusText = () => {
    if (connected && peerCount > 0) {
      return `Syncing (${peerCount} peer${peerCount !== 1 ? 's' : ''})`
    }
    if (connected) return 'Online (no peers)'
    return 'Offline'
  }

  return (
    <div
      class={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getBadgeStyle()}`}
      title={getStatusText()}
    >
      <span class="text-lg leading-none">
        {connected && peerCount > 0 ? '●' : '○'}
      </span>
      <span>{getStatusText()}</span>
    </div>
  )
}
```

Add to `src/app.jsx`:
```javascript
import ConnectionStatus from './components/sync/ConnectionStatus'

// In header
<ConnectionStatus />
```

**Commit:**
```bash
git add src/components/sync/ConnectionStatus.jsx src/app.jsx
git commit -m "feat: add Yjs connection status indicator"
```

---

### Task 7: Data Migration (Optional)

**Goal:** Migrate existing Fireproof data to Yjs format

**When:** Only if users have existing data

**Strategy:**

```javascript
// Migration script (run once in browser console)
async function migrateFireproofToYjs() {
  const { fireproof } = await import('@fireproof/core')
  const oldDb = fireproof('hypermark')

  const result = await oldDb.allDocs()
  const bookmarks = result.rows
    .map(row => row.value)
    .filter(doc => doc.type === 'bookmark')

  console.log(`Migrating ${bookmarks.length} bookmarks...`)

  const { createBookmark } = await import('./src/services/bookmarks.js')

  for (const bm of bookmarks) {
    createBookmark({
      url: bm.url,
      title: bm.title,
      description: bm.description,
      tags: bm.tags || [],
      readLater: bm.readLater || false,
    })
  }

  console.log('Migration complete!')
}

migrateFireproofToYjs()
```

---

### Task 8: Testing & Verification

**Manual Test Checklist:**

```
[ ] 1. Fresh start - app loads without errors
[ ] 2. Create bookmark - persists after refresh
[ ] 3. Edit bookmark - changes save
[ ] 4. Delete bookmark - removes from UI
[ ] 5. Add tags - tags appear and sync
[ ] 6. Search bookmarks - results filter correctly
[ ] 7. Read-later toggle - state updates
[ ] 8. Two tabs - changes sync instantly
[ ] 9. Close tab, reopen - data persists
[ ] 10. Pair devices - pairing flow completes
[ ] 11. Post-pairing sync - bookmarks sync P2P
[ ] 12. Three devices - full mesh sync works
[ ] 13. Offline mode - changes queue and sync on reconnect
[ ] 14. Concurrent edits - CRDTs merge correctly
[ ] 15. ConnectionStatus - shows correct peer count
```

**Concurrent Edit Test:**
1. Open Tab A and B (paired)
2. Simultaneously edit same bookmark in both tabs
3. Both edits should merge without data loss

**Offline Test:**
1. Tab A online, Tab B offline (DevTools Network)
2. Add bookmark in Tab B (offline)
3. Bring Tab B online
4. Bookmark appears in Tab A within seconds

---

### Task 9: Update Documentation

**Files:**
- Update: `README.md`
- Create: `docs/architecture/yjs-sync.md`

**README.md updates:**
```markdown
## Tech Stack

- **Frontend:** Preact, Signals
- **Database:** Yjs (CRDT-based)
- **Sync:** y-webrtc (P2P over WebRTC)
- **Storage:** y-indexeddb (local persistence)
- **Pairing:** PeerJS (signaling only)
- **Crypto:** Web Crypto API

## Sync Architecture

Hypermark uses Yjs CRDTs for true peer-to-peer synchronization:

- **Zero cloud infrastructure** for data storage/sync
- **Automatic conflict resolution** via CRDTs
- **Offline-first** with automatic catch-up
- **End-to-end encrypted** pairing flow
- **Mesh network** support (any number of devices)
```

**Create `docs/architecture/yjs-sync.md`:**
Document the Yjs architecture, data model, and sync protocol.

**Commit:**
```bash
git add README.md docs/architecture/yjs-sync.md
git commit -m "docs: update documentation for Yjs migration"
```

---

### Task 10: Final Cleanup and Beads

**Step 1: Run final tests**

Go through test checklist one more time.

**Step 2: Check git status**
```bash
git status
```

All changes should be committed.

**Step 3: Update beads**
```bash
# Close the Fireproof sync issues
bd close hypermark-co7 --reason="Migrated to Yjs for proper P2P sync"

# Create issue for any follow-up work
bd create --title="Polish Yjs sync UX" --type=task
```

**Step 4: Final commit**
```bash
git add .
git commit -m "feat: complete Yjs migration for true P2P sync"
```

**Step 5: Sync beads**
```bash
bd sync --from-main
```

---

## Success Criteria

✅ **App loads without Fireproof**
✅ **All bookmark operations work**
✅ **Two devices sync instantly (<1 sec)**
✅ **Offline changes sync on reconnect**
✅ **Concurrent edits merge correctly**
✅ **No infinite loops or errors**
✅ **Data persists across sessions**
✅ **Pairing flow still works**
✅ **Zero cloud infrastructure (except signaling)**

---

## Rollback Plan

If migration fails catastrophically:

```bash
# Revert all commits
git log --oneline  # Find commit before migration started
git reset --hard <commit-hash>

# Reinstall Fireproof
npm install @fireproof/core
```

Data loss risk: **Low** (IndexedDB for both systems, can export/import)

---

## Known Limitations

1. **Signaling server:** y-webrtc uses public signaling server (yjs.dev)
   - Could self-host if needed
   - Only used for WebRTC handshake, no data passes through

2. **Room discovery:** Devices must share room password from pairing
   - Already implemented via LEK sharing

3. **Large datasets:** Yjs loads full document into memory
   - Should be fine for thousands of bookmarks
   - For millions, would need pagination strategy

---

## Future Enhancements

- **Self-hosted signaling** - Deploy own WebRTC signaling server
- **Selective sync** - Only sync certain bookmark collections
- **Compression** - Use Y.encodeStateAsUpdate for efficient transfer
- **Undo/redo** - Leverage Yjs history tracking
- **Collaborative editing** - Real-time multi-user bookmark editing
- **Awareness** - Show which peer is viewing/editing

---

## Summary

This migration replaces Fireproof's cloud-dependent architecture with Yjs's proven P2P CRDT system. The result is:

- **Simpler codebase:** ~600 lines of sync code → ~50 lines
- **True P2P:** Zero cloud infrastructure for data
- **More reliable:** Battle-tested in production apps
- **Better DX:** Standard APIs, good documentation
- **Same UX:** Users see no difference, just working sync

**Estimated time:** 6-8 hours total work spread over 1-2 days.
