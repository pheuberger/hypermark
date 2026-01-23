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
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { NostrSyncService, CONNECTION_STATES } from '../services/nostr-sync'
import { retrieveLEK } from '../services/key-storage'
import { getYdocInstance } from './useYjs'

// Global service instance (singleton pattern like useYjs)
let nostrSyncService = null
let nostrSyncListeners = []

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
 * Initialize Nostr sync service if not already initialized
 * @param {CryptoKey} lek - Ledger Encryption Key
 * @param {Object} options - Service options
 * @returns {Promise<NostrSyncService>}
 */
export async function initializeNostrSync(lek, options = {}) {
  if (nostrSyncService?.isInitialized) {
    console.log('[useNostrSync] Service already initialized')
    return nostrSyncService
  }

  console.log('[useNostrSync] Initializing Nostr sync service')

  nostrSyncService = new NostrSyncService({
    debug: options.debug || false,
    autoReconnect: options.autoReconnect !== false,
    ...options,
  })

  await nostrSyncService.initialize(lek)
  notifyNostrSyncListeners()

  return nostrSyncService
}

/**
 * Disconnect and cleanup Nostr sync service
 * @returns {Promise<void>}
 */
export async function disconnectNostrSync() {
  if (nostrSyncService) {
    console.log('[useNostrSync] Disconnecting Nostr sync service')
    await nostrSyncService.disconnect()
    nostrSyncService = null
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
 * @returns {Object} Hook state and methods
 */
export function useNostrSync(options = {}) {
  const { autoInitialize = true, debug = false } = options

  // State
  const [isInitialized, setIsInitialized] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [connectedRelays, setConnectedRelays] = useState(0)
  const [totalRelays, setTotalRelays] = useState(0)
  const [pendingUpdates, setPendingUpdates] = useState(0)
  const [error, setError] = useState(null)
  const [lastSyncTime, setLastSyncTime] = useState(null)

  // Refs for cleanup
  const bookmarkSubscriptionRef = useRef(null)
  const connectionUnsubscribeRef = useRef(null)
  const yjsObserverRef = useRef(null)

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
    setError(null)

    try {
      const lek = await retrieveLEK()
      if (!lek) {
        console.log('[useNostrSync] No LEK available, device not paired')
        setIsConnecting(false)
        return
      }

      await initializeNostrSync(lek, { debug })

      // Subscribe to connection changes
      if (nostrSyncService) {
        connectionUnsubscribeRef.current = () => {
          // Cleanup handler stored in ref
        }

        nostrSyncService.onConnectionChange((relayUrl, oldState, newState) => {
          updateStatus()

          if (newState === CONNECTION_STATES.ERROR) {
            setError(`Connection error with ${relayUrl}`)
          } else if (newState === CONNECTION_STATES.CONNECTED) {
            setError(null)
          }
        })

        // Set up bookmark sync subscription
        bookmarkSubscriptionRef.current = await nostrSyncService.subscribeToBookmarks(
          async (bookmarkId, bookmarkData, event) => {
            // Handle incoming bookmark updates
            console.log('[useNostrSync] Received bookmark update:', bookmarkId)
            setLastSyncTime(Date.now())

            // Apply to Yjs document
            const ydoc = getYdocInstance()
            if (ydoc) {
              const bookmarksMap = ydoc.getMap('bookmarks')
              // Only apply if different from local (simple conflict avoidance)
              const existing = bookmarksMap.get(bookmarkId)
              if (!existing || existing.updatedAt < bookmarkData.updatedAt) {
                bookmarksMap.set(bookmarkId, bookmarkData)
              }
            }
          },
          async (bookmarkId, event) => {
            // Handle bookmark deletions
            console.log('[useNostrSync] Received bookmark deletion:', bookmarkId)
            setLastSyncTime(Date.now())

            const ydoc = getYdocInstance()
            if (ydoc) {
              const bookmarksMap = ydoc.getMap('bookmarks')
              bookmarksMap.delete(bookmarkId)
            }
          }
        )

        // Set up Yjs observer for outbound sync
        const ydoc = getYdocInstance()
        if (ydoc) {
          const bookmarksMap = ydoc.getMap('bookmarks')

          yjsObserverRef.current = (ymapEvent) => {
            ymapEvent.changes.keys.forEach((change, key) => {
              if (nostrSyncService && nostrSyncService.isInitialized) {
                if (change.action === 'add' || change.action === 'update') {
                  const bookmarkData = bookmarksMap.get(key)
                  if (bookmarkData) {
                    // Queue for debounced publishing
                    nostrSyncService.queueBookmarkUpdate(key, bookmarkData)
                  }
                } else if (change.action === 'delete') {
                  // Publish deletion immediately (no debounce for deletions)
                  nostrSyncService.publishBookmarkDeletion(key).catch(err => {
                    console.error('[useNostrSync] Failed to publish deletion:', err)
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
      setError(err.message || 'Failed to initialize Nostr sync')
      setIsConnecting(false)
    }
  }, [debug, updateStatus])

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

    await disconnectNostrSync()
    updateStatus()
    setError(null)
  }, [updateStatus])

  // Auto-initialize effect
  useEffect(() => {
    if (autoInitialize) {
      initialize()
    }

    // Cleanup on unmount
    return () => {
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

  return {
    // Status
    isInitialized,
    isConnecting,
    isConnected: connectedRelays > 0,
    connectedRelays,
    totalRelays,
    pendingUpdates,
    error,
    lastSyncTime,

    // Methods
    initialize,
    disconnect,
    syncNow,

    // Service access (for advanced use)
    getService: () => nostrSyncService,
  }
}

export default useNostrSync
