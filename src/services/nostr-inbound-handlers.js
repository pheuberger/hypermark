/**
 * Nostr Inbound Sync Handlers
 *
 * Handles incoming bookmark and deletion events from Nostr relays.
 * Applies CRDT-friendly conflict resolution before writing to Yjs.
 *
 * Extracted from useNostrSync.js to reduce hook complexity and nesting.
 */

import { syncDebug } from './nostr-sync-debug'
import { bookmarkDataToYMap } from '../utils/bookmark-transform'
import { getYdocInstance } from '../hooks/useYjs'

// Track processed events to prevent duplicates (module-level singletons)
export const processedEventIds = new Set()
export const deletedBookmarkIds = new Set()

/**
 * Prune a Set to prevent unbounded memory growth.
 * Removes the oldest half of entries when the set exceeds maxSize.
 */
function pruneSet(set, maxSize, pruneCount) {
  if (set.size > maxSize) {
    const idsToRemove = [...set].slice(0, pruneCount)
    idsToRemove.forEach(id => set.delete(id))
  }
}

/**
 * Handle an inbound bookmark event from a Nostr relay.
 * Validates, deduplicates, and applies to the local Yjs document.
 *
 * @param {string} bookmarkId - Bookmark identifier
 * @param {Object} bookmarkData - Decrypted bookmark data
 * @param {Object} event - Raw Nostr event
 * @param {Function} onSyncTimeUpdate - Callback to update last sync time
 */
export function handleInboundBookmark(bookmarkId, bookmarkData, event, onSyncTimeUpdate) {
  // Log incoming bookmark event
  syncDebug.log('BOOKMARK_RECEIVED', {
    bookmarkId,
    eventId: event?.id?.substring(0, 12),
    eventCreatedAt: event?.created_at,
    eventCreatedAtDate: event?.created_at ? new Date(event.created_at * 1000).toISOString() : null,
    bookmarkUpdatedAt: bookmarkData?.updatedAt,
    bookmarkUpdatedAtDate: bookmarkData?.updatedAt ? new Date(bookmarkData.updatedAt).toISOString() : null,
    bookmarkTitle: bookmarkData?.title,
    bookmarkData: bookmarkData, // Cache full data for republishing
  })

  // Early validation - skip invalid/empty bookmarks immediately
  if (!bookmarkData || !bookmarkData.url || !bookmarkData.title) {
    syncDebug.log('BOOKMARK_SKIPPED_INVALID', { bookmarkId, reason: 'missing url or title' })
    return
  }

  // Deduplicate: skip if we've already processed this event
  if (event?.id && processedEventIds.has(event.id)) {
    syncDebug.log('BOOKMARK_SKIPPED_DUPLICATE', { bookmarkId, eventId: event.id.substring(0, 12) })
    return
  }
  if (event?.id) {
    processedEventIds.add(event.id)
    pruneSet(processedEventIds, 1000, 500)
  }

  // Defer processing to not block the main thread
  setTimeout(() => {
    const ydoc = getYdocInstance()
    if (ydoc) {
      const bookmarksMap = ydoc.getMap('bookmarks')
      const existing = bookmarksMap.get(bookmarkId)
      const existingUpdatedAt = existing?.get ? existing.get('updatedAt') : existing?.updatedAt

      syncDebug.log('BOOKMARK_APPLY_CHECK', {
        bookmarkId,
        hasExisting: !!existing,
        existingUpdatedAt,
        existingUpdatedAtDate: existingUpdatedAt ? new Date(existingUpdatedAt).toISOString() : null,
        incomingUpdatedAt: bookmarkData.updatedAt,
        incomingUpdatedAtDate: new Date(bookmarkData.updatedAt).toISOString(),
        willApply: !existing || !existingUpdatedAt || existingUpdatedAt < bookmarkData.updatedAt,
        reason: !existing ? 'no local copy' : !existingUpdatedAt ? 'no local timestamp' : existingUpdatedAt < bookmarkData.updatedAt ? 'incoming is newer' : 'local is same or newer',
      })

      if (!existing || !existingUpdatedAt || existingUpdatedAt < bookmarkData.updatedAt) {
        const bookmarkYMap = bookmarkDataToYMap(bookmarkData)
        ydoc.transact(() => {
          bookmarksMap.set(bookmarkId, bookmarkYMap)
        }, 'nostr-sync')
        syncDebug.log('BOOKMARK_APPLIED', { bookmarkId, updatedAt: bookmarkData.updatedAt })
        syncDebug.snapshot(bookmarkId, bookmarkData, 'nostr-incoming')
      } else {
        syncDebug.log('BOOKMARK_SKIPPED_OLDER', { bookmarkId, existingUpdatedAt, incomingUpdatedAt: bookmarkData.updatedAt })
      }
    }
    onSyncTimeUpdate(Date.now())
  }, 0)

  onSyncTimeUpdate(Date.now())
}

/**
 * Handle an inbound deletion event from a Nostr relay.
 * Validates timestamp ordering before deleting local bookmark.
 *
 * @param {string} bookmarkId - Bookmark identifier to delete
 * @param {Object} event - Raw Nostr event
 * @param {Function} onSyncTimeUpdate - Callback to update last sync time
 */
export function handleInboundDeletion(bookmarkId, event, onSyncTimeUpdate) {
  const deletionTime = event?.created_at ? event.created_at * 1000 : 0
  syncDebug.log('DELETE_RECEIVED', {
    bookmarkId,
    eventId: event?.id?.substring(0, 12),
    eventCreatedAt: event?.created_at,
    eventCreatedAtDate: event?.created_at ? new Date(event.created_at * 1000).toISOString() : null,
    deletionTimeMs: deletionTime,
  })

  // Deduplicate: skip if we've already processed this event
  if (event?.id && processedEventIds.has(event.id)) {
    syncDebug.log('DELETE_SKIPPED_DUPLICATE_EVENT', { bookmarkId, eventId: event.id.substring(0, 12) })
    return
  }
  if (event?.id) {
    processedEventIds.add(event.id)
  }

  // Deduplicate: skip if we've already deleted this bookmark
  if (deletedBookmarkIds.has(bookmarkId)) {
    syncDebug.log('DELETE_SKIPPED_ALREADY_DELETED', { bookmarkId })
    return
  }

  // Defer to not block main thread
  setTimeout(() => {
    const ydoc = getYdocInstance()
    if (ydoc) {
      const bookmarksMap = ydoc.getMap('bookmarks')
      const existing = bookmarksMap.get(bookmarkId)

      if (existing) {
        const updatedAt = existing?.get ? existing.get('updatedAt') : existing?.updatedAt
        const deletionTimeMs = event?.created_at ? event.created_at * 1000 : 0

        syncDebug.log('DELETE_APPLY_CHECK', {
          bookmarkId,
          localUpdatedAt: updatedAt,
          localUpdatedAtDate: updatedAt ? new Date(updatedAt).toISOString() : null,
          deletionTimeMs,
          deletionTimeDate: new Date(deletionTimeMs).toISOString(),
          localIsNewer: updatedAt && updatedAt > deletionTimeMs,
          willDelete: !(updatedAt && updatedAt > deletionTimeMs),
        })

        if (updatedAt && updatedAt > deletionTimeMs) {
          syncDebug.log('DELETE_SKIPPED_LOCAL_NEWER', { bookmarkId, localUpdatedAt: updatedAt, deletionTimeMs })
          return
        }
      } else {
        syncDebug.log('DELETE_NO_LOCAL_COPY', { bookmarkId, willDelete: false })
      }

      // Track this deletion
      deletedBookmarkIds.add(bookmarkId)
      pruneSet(deletedBookmarkIds, 500, 250)

      // Use transaction with 'nostr-sync' origin so observer knows not to re-publish
      ydoc.transact(() => {
        bookmarksMap.delete(bookmarkId)
      }, 'nostr-sync')
      syncDebug.log('DELETE_APPLIED', { bookmarkId })
      syncDebug.snapshot(bookmarkId, { deleted: true }, 'nostr-deletion')
    }
    onSyncTimeUpdate(Date.now())
  }, 0)
}
