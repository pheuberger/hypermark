/**
 * useNostrSync React Hook
 *
 * Provides React integration for Nostr bookmark synchronization.
 * Manages NostrSyncService lifecycle, provides reactive status, and
 * automatically initializes when LEK becomes available.
 *
 * Features:
 * - Automatic initialization after device pairing (LEK available)
 * - Reactive connection status for UI components
 * - Clean lifecycle management and cleanup
 * - Error handling with user-friendly messages
 * - Integration with Yjs for bookmark change detection
 * - Performance optimizations for large bookmark collections (1000+)
 *   - Paginated initial sync to reduce memory pressure
 *   - Priority-based loading (recent/important bookmarks first)
 *   - Background sync for non-critical bookmarks after UI render
 *   - Network-aware batching and retry logic
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import * as Y from 'yjs'
import { NostrSyncService, CONNECTION_STATES } from '../services/nostr-sync'
import { retrieveLEK } from '../services/key-storage'
import { getYdocInstance, getUndoManager } from './useYjs'
import { getNostrDiagnostics } from '../services/nostr-diagnostics'
import {
  SyncPerformanceManager,
  PERFORMANCE_CONFIG,
  sortBookmarksByPriority,
  PRIORITY_LEVELS,
} from '../services/sync-performance'

// Global service instance (singleton pattern like useYjs)
let nostrSyncService = null
let nostrSyncListeners = []
let performanceManager = null
let initializationPromise = null // Guard against concurrent initialization
let processedEventIds = new Set() // Track processed events to prevent duplicates
let deletedBookmarkIds = new Set() // Track deleted bookmarks to skip duplicate delete events

/**
 * Convert a plain bookmark object to a Y.Map for Yjs storage
 * @param {Object} bookmarkData - Plain bookmark object from Nostr
 * @returns {Y.Map} - Y.Map instance
 */
function bookmarkDataToYMap(bookmarkData) {
  const ymap = new Y.Map()

  // Set all bookmark properties
  if (bookmarkData.url) ymap.set('url', bookmarkData.url)
  if (bookmarkData.title) ymap.set('title', bookmarkData.title)
  if (bookmarkData.description) ymap.set('description', bookmarkData.description)
  if (bookmarkData.favicon) ymap.set('favicon', bookmarkData.favicon)
  if (bookmarkData.preview) ymap.set('preview', bookmarkData.preview)
  if (bookmarkData.readLater !== undefined) ymap.set('readLater', bookmarkData.readLater)
  if (bookmarkData.createdAt) ymap.set('createdAt', bookmarkData.createdAt)
  if (bookmarkData.updatedAt) ymap.set('updatedAt', bookmarkData.updatedAt)

  // Handle tags array - convert to Y.Array
  if (bookmarkData.tags && Array.isArray(bookmarkData.tags) && bookmarkData.tags.length > 0) {
    const tagsArray = new Y.Array()
    // Filter out any undefined/null values before pushing
    const validTags = bookmarkData.tags.filter(t => t != null)
    if (validTags.length > 0) {
      tagsArray.push(validTags)
    }
    ymap.set('tags', tagsArray)
  } else {
    // Set empty tags array
    ymap.set('tags', new Y.Array())
  }

  return ymap
}

/**
 * Notify all listeners of service changes
 */
function notifyNostrSyncListeners() {
  nostrSyncListeners.forEach(cb => {
    try {
      cb(nostrSyncService)
    } catch (error) {
      console.error('[useNostrSync] Listener error:', error)
    }
  })
}

/**
 * Subscribe to NostrSyncService changes
 * @param {Function} callback - Called when service changes
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToNostrSync(callback) {
  nostrSyncListeners.push(callback)
  callback(nostrSyncService)
  return () => {
    nostrSyncListeners = nostrSyncListeners.filter(cb => cb !== callback)
  }
}

/**
 * Get the global NostrSyncService instance
 * @returns {NostrSyncService|null}
 */
export function getNostrSyncService() {
  return nostrSyncService
}

/**
 * Get the global performance manager instance
 * @returns {SyncPerformanceManager|null}
 */
export function getPerformanceManager() {
  return performanceManager
}

/**
 * Initialize Nostr sync service if not already initialized
 * @param {CryptoKey} lek - Ledger Encryption Key
 * @param {Object} options - Service options
 * @returns {Promise<NostrSyncService>}
 */
export async function initializeNostrSync(lek, options = {}) {
  // Already initialized - return existing service
  if (nostrSyncService?.isInitialized) {
    console.log('[useNostrSync] Service already initialized')
    return nostrSyncService
  }

  // Initialization in progress - wait for it to complete
  if (initializationPromise) {
    console.log('[useNostrSync] Initialization already in progress, waiting...')
    return initializationPromise
  }

  console.log('[useNostrSync] Initializing Nostr sync service')

  // Create initialization promise to prevent concurrent initialization
  initializationPromise = (async () => {
    try {
      nostrSyncService = new NostrSyncService({
        debug: true, // TEMP: enable debug for troubleshooting
        autoReconnect: options.autoReconnect !== false,
        ...options,
      })

      await nostrSyncService.initialize(lek)
      notifyNostrSyncListeners()

      // Debug: expose service on window for inspection
      if (typeof window !== 'undefined') {
        window.__nostrSyncService = nostrSyncService
      }

      return nostrSyncService
    } finally {
      initializationPromise = null
    }
  })()

  return initializationPromise
}

/**
 * Disconnect and cleanup Nostr sync service
 * @returns {Promise<void>}
 */
export async function disconnectNostrSync() {
  if (performanceManager) {
    console.log('[useNostrSync] Shutting down performance manager')
    performanceManager.shutdown()
    performanceManager = null
  }

  if (nostrSyncService) {
    console.log('[useNostrSync] Disconnecting Nostr sync service')
    await nostrSyncService.disconnect()
    nostrSyncService = null
    notifyNostrSyncListeners()
  }
}

/**
 * Add a custom relay to the service
 * @param {string} relayUrl - Relay URL to add
 * @returns {Promise<boolean>} - True if successfully added
 */
export async function addNostrRelay(relayUrl) {
  if (nostrSyncService?.isInitialized) {
    const result = await nostrSyncService.addRelay(relayUrl)
    notifyNostrSyncListeners()
    return result
  }
  return false
}

/**
 * Remove a relay from the service
 * @param {string} relayUrl - Relay URL to remove
 * @returns {Promise<boolean>} - True if successfully removed
 */
export async function removeNostrRelay(relayUrl) {
  if (nostrSyncService?.isInitialized) {
    const result = await nostrSyncService.removeRelay(relayUrl)
    notifyNostrSyncListeners()
    return result
  }
  return false
}

/**
 * Update the relay list
 * @param {string[]} relays - New list of relay URLs
 * @returns {Promise<void>}
 */
export async function updateNostrRelays(relays) {
  if (nostrSyncService?.isInitialized) {
    await nostrSyncService.updateRelays(relays)
    notifyNostrSyncListeners()
  }
}

/**
 * useNostrSync React Hook
 *
 * Manages Nostr sync lifecycle and provides reactive status.
 *
 * @param {Object} options - Hook options
 * @param {boolean} options.autoInitialize - Auto-initialize when LEK available (default: true)
 * @param {boolean} options.debug - Enable debug logging (default: false)
 * @param {boolean} options.enablePerformanceOptimizations - Enable performance features (default: true)
 * @returns {Object} Hook state and methods
 */
export function useNostrSync(options = {}) {
  const {
    autoInitialize = true,
    debug = false,
    enablePerformanceOptimizations = true,
  } = options

  // State
  const [isInitialized, setIsInitialized] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedRelays, setConnectedRelays] = useState(0)
  const [totalRelays, setTotalRelays] = useState(0)
  const [pendingUpdates, setPendingUpdates] = useState(0)
  const [relayErrors, setRelayErrors] = useState({}) // Track errors per relay
  const [initError, setInitError] = useState(null) // General initialization error
  const [lastSyncTime, setLastSyncTime] = useState(null)

  // Performance state
  const [syncProgress, setSyncProgress] = useState(null)
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false)
  const [performanceStats, setPerformanceStats] = useState(null)

  // Refs for cleanup
  const bookmarkSubscriptionRef = useRef(null)
  const connectionUnsubscribeRef = useRef(null)
  const yjsObserverRef = useRef(null)
  const receivedBookmarksRef = useRef(new Map()) // Track received bookmarks for batching

  /**
   * Update status from service
   */
  const updateStatus = useCallback(() => {
    if (nostrSyncService) {
      const status = nostrSyncService.getStatus()
      setIsInitialized(status.isInitialized)
      setConnectedRelays(status.relays.connected)
      setTotalRelays(status.relays.total)
      setPendingUpdates(status.pendingUpdates || 0)
    } else {
      setIsInitialized(false)
      setConnectedRelays(0)
      setTotalRelays(0)
      setPendingUpdates(0)
    }
  }, [])

  /**
   * Initialize the Nostr sync service
   */
  const initialize = useCallback(async () => {
    if (nostrSyncService?.isInitialized) {
      updateStatus()
      return
    }

    setIsConnecting(true)
    setRelayErrors({})
    setSyncProgress(null)

    try {
      const lek = await retrieveLEK()
      if (!lek) {
        console.log('[useNostrSync] No LEK available, device not paired')
        setIsConnecting(false)
        return
      }

      await initializeNostrSync(lek, { debug })

      // Initialize performance manager if optimizations are enabled
      if (enablePerformanceOptimizations && !performanceManager) {
        performanceManager = new SyncPerformanceManager({
          onBackgroundProgress: (progress) => {
            setSyncProgress(progress)
          },
          onBackgroundComplete: (stats) => {
            setIsBackgroundSyncing(false)
            setPerformanceStats(stats)
            console.log('[useNostrSync] Background sync complete:', stats)
          },
          onBackgroundError: (error) => {
            console.error('[useNostrSync] Background sync error:', error)
          },
        })
      }

      // Subscribe to connection changes
      if (nostrSyncService) {
        connectionUnsubscribeRef.current = () => {
          // Cleanup handler stored in ref
        }

        nostrSyncService.onConnectionChange((relayUrl, oldState, newState) => {
          updateStatus()

          // Record network latency for optimization
          if (performanceManager && newState === CONNECTION_STATES.CONNECTED) {
            // Simple latency estimation based on connection time
            performanceManager.recordNetworkLatency(500) // Default estimate
          }

          // Track errors per relay - don't overwrite other relay errors
          if (newState === CONNECTION_STATES.ERROR) {
            setRelayErrors(prev => ({ ...prev, [relayUrl]: true }))
          } else if (newState === CONNECTION_STATES.CONNECTED || newState === CONNECTION_STATES.CONNECTING) {
            // Only clear error for THIS relay when it connects/reconnects
            setRelayErrors(prev => {
              const next = { ...prev }
              delete next[relayUrl]
              return next
            })
          }
        })

        // Set up bookmark sync subscription with performance optimizations
        bookmarkSubscriptionRef.current = await nostrSyncService.subscribeToBookmarks(
          async (bookmarkId, bookmarkData, event) => {
            // Early validation - skip invalid/empty bookmarks immediately
            if (!bookmarkData || !bookmarkData.url || !bookmarkData.title) {
              return
            }

            // Deduplicate: skip if we've already processed this event
            if (event?.id && processedEventIds.has(event.id)) {
              return
            }
            if (event?.id) {
              processedEventIds.add(event.id)
              // Limit set size to prevent memory leak
              if (processedEventIds.size > 1000) {
                const idsToRemove = [...processedEventIds].slice(0, 500)
                idsToRemove.forEach(id => processedEventIds.delete(id))
              }
            }

            // Defer processing to not block the main thread
            setTimeout(() => {
              // Apply to Yjs document
              const ydoc = getYdocInstance()
              if (ydoc) {
                const bookmarksMap = ydoc.getMap('bookmarks')
                // Only apply if different from local (simple conflict avoidance)
                const existing = bookmarksMap.get(bookmarkId)
                // Handle both Y.Map (local) and plain object (legacy) formats
                const existingUpdatedAt = existing?.get ? existing.get('updatedAt') : existing?.updatedAt
                if (!existing || !existingUpdatedAt || existingUpdatedAt < bookmarkData.updatedAt) {
                  // Convert plain object to Y.Map for consistent Yjs storage
                  const bookmarkYMap = bookmarkDataToYMap(bookmarkData)
                  // Use transaction with 'nostr-sync' origin so observer knows not to re-publish
                  ydoc.transact(() => {
                    bookmarksMap.set(bookmarkId, bookmarkYMap)
                  }, 'nostr-sync')
                }
              }
              setLastSyncTime(Date.now())
            }, 0)

            setLastSyncTime(Date.now())
          },
          async (bookmarkId, event) => {
            // Deduplicate: skip if we've already processed this event
            if (event?.id && processedEventIds.has(event.id)) {
              return
            }
            if (event?.id) {
              processedEventIds.add(event.id)
            }

            // Deduplicate: skip if we've already deleted this bookmark
            if (deletedBookmarkIds.has(bookmarkId)) {
              return
            }

            // Defer to not block main thread
            setTimeout(() => {
              const ydoc = getYdocInstance()
              if (ydoc) {
                const bookmarksMap = ydoc.getMap('bookmarks')
                const existing = bookmarksMap.get(bookmarkId)

                // Check if local bookmark exists and is newer than deletion event
                // This handles the case where user undid a deletion - the restored
                // bookmark will have a newer updatedAt than the deletion event
                if (existing) {
                  const updatedAt = existing?.get ? existing.get('updatedAt') : existing?.updatedAt
                  // Nostr events use seconds, our timestamps use milliseconds
                  const deletionTime = event?.created_at ? event.created_at * 1000 : 0

                  if (updatedAt && updatedAt > deletionTime) {
                    console.log('[useNostrSync] Skipping deletion - local bookmark is newer:', bookmarkId, { updatedAt, deletionTime })
                    return
                  }
                }

                // Track this deletion
                deletedBookmarkIds.add(bookmarkId)
                // Limit set size
                if (deletedBookmarkIds.size > 500) {
                  const idsToRemove = [...deletedBookmarkIds].slice(0, 250)
                  idsToRemove.forEach(id => deletedBookmarkIds.delete(id))
                }

                // Use transaction with 'nostr-sync' origin so observer knows not to re-publish
                ydoc.transact(() => {
                  bookmarksMap.delete(bookmarkId)
                }, 'nostr-sync')
              }
              setLastSyncTime(Date.now())
            }, 0)
          }
        )

        // Set up Yjs observer for outbound sync
        const ydoc = getYdocInstance()
        if (ydoc) {
          const bookmarksMap = ydoc.getMap('bookmarks')

          // Initialize performance manager with bookmark count
          const bookmarkCount = bookmarksMap.size
          if (performanceManager) {
            performanceManager.initialize(bookmarkCount)
            console.log('[useNostrSync] Performance manager initialized for', bookmarkCount, 'bookmarks')

            // Check if this is a large collection and enable background sync
            if (bookmarkCount >= PERFORMANCE_CONFIG.LARGE_COLLECTION_THRESHOLD) {
              console.log('[useNostrSync] Large collection detected, performance optimizations enabled')
              setIsBackgroundSyncing(true)
            }
          }

          // Clean up existing observer before attaching new one
          // (prevents duplicate observers if initialize runs multiple times)
          if (yjsObserverRef.current) {
            bookmarksMap.unobserve(yjsObserverRef.current)
          }

          yjsObserverRef.current = (ymapEvent) => {
            // Skip publishing for changes that came from Nostr sync (avoid feedback loop)
            if (ymapEvent.transaction.origin === 'nostr-sync') {
              return
            }

            // Check if this is an undo/redo operation
            const undoManager = getUndoManager()
            const isUndoRedo = ymapEvent.transaction.origin === undoManager

            ymapEvent.changes.keys.forEach((change, key) => {
              if (nostrSyncService && nostrSyncService.isInitialized) {
                if (change.action === 'add' || change.action === 'update') {
                  const bookmarkYMap = bookmarksMap.get(key)
                  if (bookmarkYMap) {
                    // Convert Y.Map to plain object for publishing
                    let bookmarkData = bookmarkYMap.get ? {
                      url: bookmarkYMap.get('url'),
                      title: bookmarkYMap.get('title'),
                      description: bookmarkYMap.get('description') || '',
                      tags: bookmarkYMap.get('tags')?.toArray() || [],
                      readLater: bookmarkYMap.get('readLater') || false,
                      inbox: bookmarkYMap.get('inbox') || false,
                      favicon: bookmarkYMap.get('favicon') || null,
                      preview: bookmarkYMap.get('preview') || null,
                      createdAt: bookmarkYMap.get('createdAt'),
                      updatedAt: bookmarkYMap.get('updatedAt'),
                    } : { ...bookmarkYMap } // Already a plain object, clone it

                    // If this is an undo restoration (bookmark was deleted and now restored),
                    // bump updatedAt to ensure it's newer than any deletion events on relays.
                    // This prevents the deletion from being replayed on refresh.
                    if (isUndoRedo && change.action === 'add') {
                      const newUpdatedAt = Date.now()
                      console.log('[useNostrSync] Undo restoration detected, bumping updatedAt:', key, { old: bookmarkData.updatedAt, new: newUpdatedAt })
                      bookmarkData = { ...bookmarkData, updatedAt: newUpdatedAt }

                      // Persist the updated timestamp to IndexedDB
                      // Use 'nostr-sync' origin to avoid re-triggering this observer
                      ydoc.transact(() => {
                        bookmarksMap.set(key, bookmarkData)
                      }, 'nostr-sync')
                    }

                    // Queue for debounced publishing
                    nostrSyncService.queueBookmarkUpdate(key, bookmarkData)
                  }
                } else if (change.action === 'delete') {
                  console.log('[useNostrSync] Publishing bookmark deletion:', key)
                  // Publish deletion immediately (no debounce for deletions)
                  nostrSyncService.publishBookmarkDeletion(key)
                    .then((event) => {
                      if (event) {
                        try {
                          getNostrDiagnostics().recordPublish(event.id, key)
                        } catch (e) {
                          // Diagnostics recording should not break sync
                        }
                      }
                    })
                    .catch(err => {
                      console.error('[useNostrSync] Failed to publish deletion:', err)
                      try {
                        getNostrDiagnostics().recordError(err, { eventType: 'delete', bookmarkId: key })
                      } catch (e) {
                        // Diagnostics recording should not break sync
                      }
                    })
                }
              }
            })
          }

          bookmarksMap.observe(yjsObserverRef.current)
        }
      }

      updateStatus()
      setIsConnecting(false)

    } catch (err) {
      console.error('[useNostrSync] Initialization failed:', err)
      setInitError(err.message || 'Failed to initialize Nostr sync')
      setIsConnecting(false)

      // Record initialization error in diagnostics
      try {
        getNostrDiagnostics().recordError(err, { eventType: 'init' })
      } catch (e) {
        // Diagnostics recording should not break initialization
      }
    }
  }, [debug, updateStatus, enablePerformanceOptimizations])

  /**
   * Manually trigger sync (flush pending updates)
   */
  const syncNow = useCallback(async () => {
    if (nostrSyncService?.isInitialized) {
      const result = await nostrSyncService.flushNow()
      updateStatus()
      setLastSyncTime(Date.now())
      return result
    }
    return { published: 0, failed: 0 }
  }, [updateStatus])

  /**
   * Disconnect from Nostr relays
   */
  const disconnect = useCallback(async () => {
    // Cleanup Yjs observer
    if (yjsObserverRef.current) {
      const ydoc = getYdocInstance()
      if (ydoc) {
        const bookmarksMap = ydoc.getMap('bookmarks')
        bookmarksMap.unobserve(yjsObserverRef.current)
      }
      yjsObserverRef.current = null
    }

    // Cleanup bookmark subscription
    if (bookmarkSubscriptionRef.current && nostrSyncService) {
      await nostrSyncService.unsubscribe(bookmarkSubscriptionRef.current)
      bookmarkSubscriptionRef.current = null
    }

    // Clear received bookmarks tracking
    receivedBookmarksRef.current.clear()

    await disconnectNostrSync()
    updateStatus()
    setRelayErrors({})
    setInitError(null)
    setSyncProgress(null)
    setIsBackgroundSyncing(false)
    setPerformanceStats(null)
  }, [updateStatus])

  /**
   * Pause background sync operations (useful when app goes to background)
   */
  const pauseBackgroundSync = useCallback(() => {
    if (performanceManager) {
      performanceManager.pauseBackgroundOperations()
      setIsBackgroundSyncing(false)
    }
  }, [])

  /**
   * Resume background sync operations
   */
  const resumeBackgroundSync = useCallback(() => {
    if (performanceManager) {
      performanceManager.resumeBackgroundOperations()
      setIsBackgroundSyncing(true)
    }
  }, [])

  /**
   * Get recommended sync parameters based on current network/memory conditions
   */
  const getRecommendedParameters = useCallback(() => {
    if (performanceManager) {
      return performanceManager.getRecommendedParameters()
    }
    return null
  }, [])

  // Auto-initialize effect - deferred to not block initial render
  useEffect(() => {
    let timeoutId = null

    if (autoInitialize) {
      // Defer initialization to let the UI render first
      timeoutId = setTimeout(() => {
        initialize()
      }, 100)
    }

    // Cleanup on unmount
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
      if (yjsObserverRef.current) {
        const ydoc = getYdocInstance()
        if (ydoc) {
          const bookmarksMap = ydoc.getMap('bookmarks')
          bookmarksMap.unobserve(yjsObserverRef.current)
        }
      }
    }
  }, [autoInitialize, initialize])

  // Subscribe to service changes
  useEffect(() => {
    const unsubscribe = subscribeToNostrSync(() => {
      updateStatus()
    })
    return unsubscribe
  }, [updateStatus])

  // Compute error message for display
  const errorRelayUrls = Object.keys(relayErrors)
  const hasRelayErrors = errorRelayUrls.length > 0
  const error = initError
    ? initError
    : hasRelayErrors
      ? errorRelayUrls.length === 1
        ? `Connection error with ${errorRelayUrls[0]}`
        : `Connection errors with ${errorRelayUrls.length} relays`
      : null

  return {
    // Status
    isInitialized,
    isConnecting,
    isConnected: connectedRelays > 0,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    error,
    relayErrors, // Expose per-relay errors for detailed UI
    lastSyncTime,

    // Performance status
    syncProgress,
    isBackgroundSyncing,
    performanceStats,

    // Methods
    initialize,
    disconnect,
    syncNow,

    // Performance methods
    pauseBackgroundSync,
    resumeBackgroundSync,
    getRecommendedParameters,

    // Service access (for advanced use)
    getService: () => nostrSyncService,
    getPerformanceManager: () => performanceManager,
  }
}

// Re-export performance utilities for external use
export {
  PERFORMANCE_CONFIG,
  PRIORITY_LEVELS,
  sortBookmarksByPriority,
} from '../services/sync-performance'

export default useNostrSync
