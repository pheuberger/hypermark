/**
 * Nostr Sync Debug Tests
 * Tests for src/services/nostr-sync-debug.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'

vi.mock('../hooks/useYjs', () => ({
  getYdocInstance: vi.fn(() => null),
}))

const { syncDebug, exposeDebugUtilities } = await import('./nostr-sync-debug.js')

describe('nostr-sync-debug', () => {
  beforeEach(() => {
    syncDebug.eventLog = []
    syncDebug.bookmarkSnapshots = new Map()
  })

  describe('syncDebug.log', () => {
    it('adds entries to eventLog', () => {
      syncDebug.log('TEST_EVENT', { bookmarkId: 'b1', detail: 'test' })

      expect(syncDebug.eventLog).toHaveLength(1)
      expect(syncDebug.eventLog[0].type).toBe('TEST_EVENT')
      expect(syncDebug.eventLog[0].bookmarkId).toBe('b1')
      expect(syncDebug.eventLog[0].time).toBeDefined()
      expect(syncDebug.eventLog[0].timestamp).toBeDefined()
    })

    it('logs multiple events chronologically', () => {
      syncDebug.log('FIRST', {})
      syncDebug.log('SECOND', {})
      syncDebug.log('THIRD', {})

      expect(syncDebug.eventLog).toHaveLength(3)
      expect(syncDebug.eventLog[0].type).toBe('FIRST')
      expect(syncDebug.eventLog[2].type).toBe('THIRD')
    })
  })

  describe('syncDebug.snapshot', () => {
    it('stores state snapshots per bookmark', () => {
      syncDebug.snapshot('b1', { title: 'Test', url: 'https://example.com' }, 'nostr-incoming')

      expect(syncDebug.bookmarkSnapshots.has('b1')).toBe(true)
      const snapshots = syncDebug.bookmarkSnapshots.get('b1')
      expect(snapshots).toHaveLength(1)
      expect(snapshots[0].source).toBe('nostr-incoming')
      expect(snapshots[0].state.title).toBe('Test')
    })

    it('accumulates multiple snapshots for same bookmark', () => {
      syncDebug.snapshot('b1', { title: 'V1' }, 'source-a')
      syncDebug.snapshot('b1', { title: 'V2' }, 'source-b')

      const snapshots = syncDebug.bookmarkSnapshots.get('b1')
      expect(snapshots).toHaveLength(2)
      expect(snapshots[0].state.title).toBe('V1')
      expect(snapshots[1].state.title).toBe('V2')
    })

    it('deep-clones state to avoid mutation', () => {
      const state = { title: 'Original', nested: { value: 1 } }
      syncDebug.snapshot('b1', state, 'test')

      // Mutate original
      state.title = 'Mutated'
      state.nested.value = 999

      const stored = syncDebug.bookmarkSnapshots.get('b1')[0].state
      expect(stored.title).toBe('Original')
      expect(stored.nested.value).toBe(1)
    })
  })

  describe('syncDebug.getTimeline', () => {
    it('returns snapshots for a bookmark', () => {
      syncDebug.snapshot('b1', { title: 'Test' }, 'source')

      const timeline = syncDebug.getTimeline('b1')
      expect(timeline).toHaveLength(1)
    })

    it('returns empty array for unknown bookmark', () => {
      expect(syncDebug.getTimeline('nonexistent')).toEqual([])
    })
  })

  describe('syncDebug.getEventsFor', () => {
    it('filters events by bookmarkId', () => {
      syncDebug.log('EVT', { bookmarkId: 'b1' })
      syncDebug.log('EVT', { bookmarkId: 'b2' })
      syncDebug.log('EVT', { bookmarkId: 'b1' })

      const events = syncDebug.getEventsFor('b1')
      expect(events).toHaveLength(2)
    })

    it('returns empty array for unknown bookmark', () => {
      expect(syncDebug.getEventsFor('nonexistent')).toEqual([])
    })
  })

  describe('syncDebug.printSummary', () => {
    it('logs summary without errors', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      syncDebug.log('BOOKMARK_RECEIVED', { bookmarkId: 'b1' })
      syncDebug.log('BOOKMARK_APPLIED', { bookmarkId: 'b1' })
      syncDebug.log('DELETE_RECEIVED', { bookmarkId: 'b2' })

      syncDebug.printSummary()

      expect(consoleSpy).toHaveBeenCalledWith('=== SYNC DEBUG SUMMARY ===')
    })
  })

  describe('syncDebug.republishBookmark', () => {
    it('handles missing ydoc', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const deps = {
        getNostrSyncService: () => null,
        getYdocInstance: () => null,
      }

      await syncDebug.republishBookmark('b1', deps)
      expect(consoleSpy).toHaveBeenCalledWith('Ydoc not available')
    })

    it('handles missing bookmark', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const doc = new Y.Doc()
      const deps = {
        getNostrSyncService: () => null,
        getYdocInstance: () => doc,
      }

      await syncDebug.republishBookmark('b-missing', deps)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Bookmark b-missing not found')
      )
    })

    it('republishes existing plain object bookmark', async () => {
      const doc = new Y.Doc()
      const bookmarksMap = doc.getMap('bookmarks')
      bookmarksMap.set('b1', {
        url: 'https://example.com',
        title: 'Test',
        updatedAt: 1000,
      })

      const queueMock = vi.fn().mockResolvedValue()
      const deps = {
        getNostrSyncService: () => ({ isInitialized: true, queueBookmarkUpdate: queueMock }),
        getYdocInstance: () => doc,
      }

      await syncDebug.republishBookmark('b1', deps)
      expect(queueMock).toHaveBeenCalledWith('b1', expect.objectContaining({
        url: 'https://example.com',
        title: 'Test',
      }))
    })

    it('logs warning when Nostr not connected', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const doc = new Y.Doc()
      const bookmarksMap = doc.getMap('bookmarks')
      bookmarksMap.set('b1', { url: 'https://example.com', title: 'Test', updatedAt: 1000 })

      const deps = {
        getNostrSyncService: () => null,
        getYdocInstance: () => doc,
      }

      await syncDebug.republishBookmark('b1', deps)
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Saved locally but Nostr not connected')
      )
    })
  })

  describe('syncDebug.republishFromCache', () => {
    it('handles missing cached data', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const deps = {
        getNostrSyncService: () => null,
        getYdocInstance: () => new Y.Doc(),
      }

      await syncDebug.republishFromCache('b-missing', deps)
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('No cached bookmark data'))
    })

    it('republishes from cached event data', async () => {
      // Simulate a cached BOOKMARK_RECEIVED event
      syncDebug.log('BOOKMARK_RECEIVED', {
        bookmarkId: 'b1',
        bookmarkData: { url: 'https://example.com', title: 'Cached', updatedAt: 500 },
      })

      const queueMock = vi.fn().mockResolvedValue()
      const doc = new Y.Doc()
      const deps = {
        getNostrSyncService: () => ({ isInitialized: true, queueBookmarkUpdate: queueMock }),
        getYdocInstance: () => doc,
      }

      await syncDebug.republishFromCache('b1', deps)
      expect(queueMock).toHaveBeenCalledWith('b1', expect.objectContaining({
        url: 'https://example.com',
        title: 'Cached',
      }))
    })
  })

  describe('exposeDebugUtilities', () => {
    it('exposes utilities on window object', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
      const mockService = () => ({ isInitialized: true })

      exposeDebugUtilities(mockService)

      expect(window.__syncDebug).toBeDefined()
      expect(window.__getYdoc).toBeDefined()
      expect(window.__getNostrSync).toBeDefined()
      expect(typeof window.__syncDebug.republishBookmark).toBe('function')
      expect(typeof window.__syncDebug.republishFromCache).toBe('function')

      // Clean up
      delete window.__syncDebug
      delete window.__getYdoc
      delete window.__getNostrSync
    })
  })
})
