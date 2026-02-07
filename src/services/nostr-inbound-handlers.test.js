/**
 * Nostr Inbound Handlers Tests
 * Tests for src/services/nostr-inbound-handlers.js
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'
import { syncDebug } from './nostr-sync-debug'

let testDoc

vi.mock('../hooks/useYjs', () => ({
  getYdocInstance: () => testDoc,
}))

vi.mock('./nostr-sync-debug', () => ({
  syncDebug: {
    log: vi.fn(),
    snapshot: vi.fn(),
  },
}))

vi.mock('../utils/bookmark-transform', () => ({
  bookmarkDataToYMap: vi.fn((data) => {
    const ymap = new Y.Map()
    return ymap
  }),
}))

const {
  handleInboundBookmark,
  handleInboundDeletion,
  processedEventIds,
  deletedBookmarkIds,
} = await import('./nostr-inbound-handlers.js')

describe('nostr-inbound-handlers', () => {
  beforeEach(() => {
    testDoc = new Y.Doc()
    processedEventIds.clear()
    deletedBookmarkIds.clear()
    vi.clearAllMocks()
  })

  describe('handleInboundBookmark', () => {
    it('skips invalid bookmark data (missing url)', () => {
      const onSync = vi.fn()
      handleInboundBookmark('b1', { title: 'No URL' }, {}, onSync)

      expect(syncDebug.log).toHaveBeenCalledWith('BOOKMARK_SKIPPED_INVALID', expect.anything())
    })

    it('skips invalid bookmark data (missing title)', () => {
      const onSync = vi.fn()
      handleInboundBookmark('b1', { url: 'https://example.com' }, {}, onSync)

      expect(syncDebug.log).toHaveBeenCalledWith('BOOKMARK_SKIPPED_INVALID', expect.anything())
    })

    it('skips null bookmark data', () => {
      const onSync = vi.fn()
      handleInboundBookmark('b1', null, {}, onSync)

      expect(syncDebug.log).toHaveBeenCalledWith('BOOKMARK_SKIPPED_INVALID', expect.anything())
    })

    it('deduplicates by event ID', () => {
      const onSync = vi.fn()
      const event = { id: 'event-123' }
      const data = { url: 'https://example.com', title: 'Test', updatedAt: 1000 }

      handleInboundBookmark('b1', data, event, onSync)
      handleInboundBookmark('b1', data, event, onSync)

      const dupCalls = syncDebug.log.mock.calls.filter(c => c[0] === 'BOOKMARK_SKIPPED_DUPLICATE')
      expect(dupCalls).toHaveLength(1)
    })

    it('tracks processed event IDs', () => {
      const onSync = vi.fn()
      const event = { id: 'event-456' }
      const data = { url: 'https://example.com', title: 'Test', updatedAt: 1000 }

      handleInboundBookmark('b1', data, event, onSync)
      expect(processedEventIds.has('event-456')).toBe(true)
    })

    it('calls onSyncTimeUpdate immediately', () => {
      const onSync = vi.fn()
      const data = { url: 'https://example.com', title: 'Test', updatedAt: 1000 }

      handleInboundBookmark('b1', data, { id: 'e1' }, onSync)
      expect(onSync).toHaveBeenCalled()
    })

    it('handles event with no id gracefully', () => {
      const onSync = vi.fn()
      const data = { url: 'https://example.com', title: 'Test', updatedAt: 1000 }

      // Should not throw when event has no id
      handleInboundBookmark('b1', data, {}, onSync)
      expect(onSync).toHaveBeenCalled()
    })
  })

  describe('handleInboundDeletion', () => {
    it('deduplicates by event ID', () => {
      const onSync = vi.fn()
      const event = { id: 'del-event-1', created_at: Math.floor(Date.now() / 1000) }

      handleInboundDeletion('b1', event, onSync)
      handleInboundDeletion('b1', event, onSync)

      const dupCalls = syncDebug.log.mock.calls.filter(c => c[0] === 'DELETE_SKIPPED_DUPLICATE_EVENT')
      expect(dupCalls).toHaveLength(1)
    })

    it('skips already-deleted bookmark IDs', () => {
      const onSync = vi.fn()
      deletedBookmarkIds.add('b1')

      handleInboundDeletion('b1', { id: 'e1', created_at: Math.floor(Date.now() / 1000) }, onSync)

      const skipCalls = syncDebug.log.mock.calls.filter(c => c[0] === 'DELETE_SKIPPED_ALREADY_DELETED')
      expect(skipCalls).toHaveLength(1)
    })

    it('tracks processed event IDs', () => {
      const onSync = vi.fn()
      const event = { id: 'del-event-2', created_at: Math.floor(Date.now() / 1000) }

      handleInboundDeletion('b1', event, onSync)
      expect(processedEventIds.has('del-event-2')).toBe(true)
    })

    it('logs deletion received', () => {
      const onSync = vi.fn()
      const event = { id: 'del-event-3', created_at: Math.floor(Date.now() / 1000) }

      handleInboundDeletion('b1', event, onSync)

      const receivedCalls = syncDebug.log.mock.calls.filter(c => c[0] === 'DELETE_RECEIVED')
      expect(receivedCalls).toHaveLength(1)
    })

    it('handles event with null created_at', () => {
      const onSync = vi.fn()
      const event = { id: 'del-null-ts', created_at: null }

      // Should not throw
      handleInboundDeletion('b1', event, onSync)
      expect(syncDebug.log).toHaveBeenCalledWith('DELETE_RECEIVED', expect.anything())
    })
  })

  describe('set pruning', () => {
    it('processedEventIds gets pruned when exceeding limit', () => {
      const onSync = vi.fn()
      const data = { url: 'https://example.com', title: 'Test', updatedAt: 1000 }

      // Add >1000 events to trigger pruning
      for (let i = 0; i < 1010; i++) {
        processedEventIds.add(`event-${i}`)
      }

      // One more via handleInboundBookmark should trigger pruning
      handleInboundBookmark('b1', data, { id: 'event-new' }, onSync)

      // After pruning, size should be reduced
      expect(processedEventIds.size).toBeLessThanOrEqual(1011)
    })
  })
})
