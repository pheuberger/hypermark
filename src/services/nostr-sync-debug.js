/**
 * Nostr Sync Debug Utilities
 *
 * Provides debugging tools for Nostr bookmark synchronization.
 * Exposes utilities on `window.__syncDebug` for runtime inspection.
 *
 * Extracted from useNostrSync.js for separation of concerns.
 */

import { getYdocInstance } from '../hooks/useYjs'

const DEBUG_SYNC = true // Set to false to disable verbose logging

/**
 * Singleton debug utilities object for Nostr sync troubleshooting.
 * Tracks events, bookmark state snapshots, and provides republishing tools.
 */
export const syncDebug = {
  eventLog: [], // Chronological log of all events
  bookmarkSnapshots: new Map(), // bookmarkId -> array of state snapshots

  log(type, data) {
    const entry = {
      time: new Date().toISOString(),
      timestamp: Date.now(),
      type,
      ...data
    }
    this.eventLog.push(entry)
    if (DEBUG_SYNC) {
      const prefix = type.includes('DELETE') ? '🗑️' : type.includes('BOOKMARK') ? '📖' : 'ℹ️'
      console.log(`[SyncDebug] ${prefix} ${type}`, data)
    }
  },

  snapshot(bookmarkId, state, source) {
    if (!this.bookmarkSnapshots.has(bookmarkId)) {
      this.bookmarkSnapshots.set(bookmarkId, [])
    }
    this.bookmarkSnapshots.get(bookmarkId).push({
      time: new Date().toISOString(),
      timestamp: Date.now(),
      source,
      state: JSON.parse(JSON.stringify(state))
    })
  },

  // Get timeline for a specific bookmark
  getTimeline(bookmarkId) {
    return this.bookmarkSnapshots.get(bookmarkId) || []
  },

  // Get all events for a bookmark
  getEventsFor(bookmarkId) {
    return this.eventLog.filter(e => e.bookmarkId === bookmarkId)
  },

  // Print summary
  printSummary() {
    console.log('=== SYNC DEBUG SUMMARY ===')
    console.log(`Total events: ${this.eventLog.length}`)
    console.log(`Bookmarks tracked: ${this.bookmarkSnapshots.size}`)
    console.log('\nEvent breakdown:')
    const counts = {}
    this.eventLog.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1 })
    Object.entries(counts).forEach(([type, count]) => console.log(`  ${type}: ${count}`))
  },

  // Republish a bookmark with fresh timestamp (to fix "doomed" bookmarks)
  async republishBookmark(bookmarkId, { getNostrSyncService, getYdocInstance: getYdoc }) {
    const ydoc = getYdoc()
    if (!ydoc) {
      console.error('Ydoc not available')
      return
    }
    const bookmarksMap = ydoc.getMap('bookmarks')
    const bookmark = bookmarksMap.get(bookmarkId)
    if (!bookmark) {
      console.error(`Bookmark ${bookmarkId} not found locally. It may have been deleted.`)
      console.log('Tip: Call this right after you see the bookmark flash, or check syncDebug.eventLog for the bookmark data')
      return
    }

    const data = bookmark.get ? {
      url: bookmark.get('url'),
      title: bookmark.get('title'),
      description: bookmark.get('description') || '',
      tags: bookmark.get('tags')?.toArray?.() || bookmark.get('tags') || [],
      readLater: bookmark.get('readLater') || false,
      favicon: bookmark.get('favicon') || null,
      preview: bookmark.get('preview') || null,
      createdAt: bookmark.get('createdAt'),
      updatedAt: Date.now(), // Fresh timestamp!
    } : { ...bookmark, updatedAt: Date.now() }

    // Save locally with fresh timestamp
    ydoc.transact(() => {
      bookmarksMap.set(bookmarkId, data)
    }, 'local')

    // Publish to Nostr
    const service = getNostrSyncService()
    if (service && service.isInitialized) {
      await service.queueBookmarkUpdate(bookmarkId, data)
      console.log(`✅ Republished ${bookmarkId} with fresh timestamp: ${data.updatedAt}`)
    } else {
      console.log(`⚠️ Saved locally but Nostr not connected. Will sync when connected.`)
    }
  },

  // Republish from cached event data (for bookmarks that flash and disappear)
  async republishFromCache(bookmarkId, { getNostrSyncService, getYdocInstance: getYdoc }) {
    const events = this.getEventsFor(bookmarkId)
    const bookmarkEvent = events.find(e => e.type === 'BOOKMARK_RECEIVED' && e.bookmarkData)
    if (!bookmarkEvent) {
      console.error(`No cached bookmark data for ${bookmarkId}`)
      console.log('Available bookmark IDs in cache:', [...new Set(this.eventLog.filter(e => e.bookmarkData).map(e => e.bookmarkId))])
      return
    }

    const ydoc = getYdoc()
    const bookmarksMap = ydoc.getMap('bookmarks')
    const freshData = { ...bookmarkEvent.bookmarkData, updatedAt: Date.now() }

    // Save locally
    ydoc.transact(() => {
      bookmarksMap.set(bookmarkId, freshData)
    }, 'local')

    // Publish to Nostr
    const service = getNostrSyncService()
    if (service && service.isInitialized) {
      await service.queueBookmarkUpdate(bookmarkId, freshData)
      console.log(`✅ Republished ${bookmarkId} from cache with fresh timestamp: ${freshData.updatedAt}`)
    } else {
      console.log(`⚠️ Saved locally but Nostr not connected.`)
    }
  }
}

/**
 * Expose debug utilities on the window object for runtime debugging.
 * @param {Function} getNostrSyncService - getter for the sync service instance
 */
export function exposeDebugUtilities(getNostrSyncService) {
  if (typeof window !== 'undefined') {
    // Wrap republish methods so callers don't need to pass deps
    const deps = { getNostrSyncService, getYdocInstance }
    window.__syncDebug = {
      ...syncDebug,
      republishBookmark: (id) => syncDebug.republishBookmark(id, deps),
      republishFromCache: (id) => syncDebug.republishFromCache(id, deps),
    }
    window.__getYdoc = getYdocInstance
    window.__getNostrSync = getNostrSyncService
    console.log(`
🔧 NOSTR SYNC DEBUG UTILITIES AVAILABLE:
   window.__syncDebug.printSummary()           - Print event summary
   window.__syncDebug.eventLog                 - All events (chronological)
   window.__syncDebug.getEventsFor(id)         - Events for specific bookmark
   window.__syncDebug.getTimeline(id)          - State snapshots for bookmark
   window.__syncDebug.republishBookmark(id)    - Fix a doomed bookmark (if visible)
   window.__syncDebug.republishFromCache(id)   - Fix from cached data (after flash)
   window.__getYdoc()                          - Get Yjs document
   window.__getNostrSync()                     - Get NostrSyncService instance
  `)
  }
}
