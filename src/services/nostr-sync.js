/**
 * Nostr Sync Service
 *
 * Core NostrSyncService class providing relay connection management, event publishing,
 * and subscription infrastructure for Nostr-based bookmark synchronization.
 *
 * Features:
 * - Multiple relay connection management with failover
 * - Exponential backoff retry logic for failed connections
 * - Parameterized replaceable events (kind 30053) support
 * - Graceful degradation when relays are unavailable
 * - Event publishing and subscription management
 * - Dependency injection for easy testing
 *
 * Security model:
 * - Uses deterministic keypairs derived from LEK via nostr-crypto service
 * - Encrypts all event content before publishing
 * - No sensitive data exposed in plain text
 * - Maintains zero-trust architecture
 */

import {
  deriveNostrKeypair,
  createSignedNostrEvent,
  verifyNostrEventSignature,
  getXOnlyPubkey,
} from './nostr-crypto'
import {
  encryptData,
  decryptData,
  arrayBufferToBase64,
  base64ToArrayBuffer,
} from './crypto.js'

// Nostr event kinds
export const NOSTR_KINDS = {
  REPLACEABLE_EVENT: 30053, // Parameterized replaceable event for bookmark state
  TEXT_NOTE: 1,             // Standard text note (not used for bookmarks)
  DELETE: 5,                // Delete event (for explicit deletions)
}

// Default relay configuration
export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
  'wss://nostr-pub.wellorder.net',
  'wss://relay.current.fyi',
]

// Connection states
export const CONNECTION_STATES = {
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
  RECONNECTING: 'reconnecting',
}

// Retry configuration
const RETRY_CONFIG = {
  baseDelay: 1000,      // 1 second base delay
  maxDelay: 30000,      // 30 second max delay
  backoffFactor: 2,     // Double delay each retry
  maxRetries: 6,        // Max 6 retries before giving up
  jitterFactor: 0.1,    // 10% jitter to prevent thundering herd
}

/**
 * NostrSyncService - Core coordination service for Nostr operations
 *
 * Manages multiple relay connections, handles event publishing/subscribing,
 * and provides graceful degradation when relays are unavailable.
 */
export class NostrSyncService {
  constructor(options = {}) {
    // Configuration
    this.relays = options.relays || DEFAULT_RELAYS
    this.autoReconnect = options.autoReconnect !== false
    this.debug = options.debug || false

    // State
    this.connections = new Map() // relay URL -> connection info
    this.subscriptions = new Map() // subscription ID -> subscription info
    this.eventQueue = [] // Queued events for when connections are restored
    this.isInitialized = false
    this.nostrKeypair = null
    this.lek = null // Store LEK for content encryption/decryption

    // Debounced publishing infrastructure
    this.pendingUpdates = new Map() // bookmarkId -> { data, timestamp }
    this.debounceTimeoutId = null
    this.debounceDelay = options.debounceDelay || 1500 // 1.5 second default
    this.isShuttingDown = false

    // Event handlers
    this.eventHandlers = new Map() // event type -> handler function
    this.connectionHandlers = [] // Connection state change handlers

    // Bind methods for event handlers
    this._handleWebSocketOpen = this._handleWebSocketOpen.bind(this)
    this._handleWebSocketClose = this._handleWebSocketClose.bind(this)
    this._handleWebSocketError = this._handleWebSocketError.bind(this)
    this._handleWebSocketMessage = this._handleWebSocketMessage.bind(this)
    this._flushPendingUpdates = this._flushPendingUpdates.bind(this)

    this._log('NostrSyncService initialized', { relayCount: this.relays.length })
  }

  /**
   * Initialize the service with LEK-derived keypair
   * Must be called before using other methods
   */
  async initialize(lek) {
    if (!lek) {
      throw new Error('LEK is required for Nostr sync initialization')
    }

    try {
      // Store LEK for content encryption/decryption
      this.lek = lek

      // Derive deterministic Nostr keypair from LEK
      this.nostrKeypair = await deriveNostrKeypair(lek)
      this.isInitialized = true

      this._log('Service initialized with Nostr keypair', {
        publicKey: this.nostrKeypair?.publicKeyHex ?
          this.nostrKeypair.publicKeyHex.substring(0, 8) + '...' :
          'undefined'
      })

      // Auto-connect to relays if configured
      if (this.autoReconnect) {
        await this.connectToRelays()
      }

    } catch (error) {
      this._logError('Failed to initialize NostrSyncService', error)
      throw error
    }
  }

  /**
   * Connect to all configured relays
   */
  async connectToRelays() {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before connecting to relays')
    }

    this._log('Connecting to relays', { count: this.relays.length })

    const connectionPromises = this.relays.map(relayUrl =>
      this._connectToRelay(relayUrl)
    )

    // Don't wait for all connections to succeed - some may fail
    await Promise.allSettled(connectionPromises)

    // Check if at least one connection succeeded
    const connectedCount = Array.from(this.connections.values())
      .filter(conn => conn.state === CONNECTION_STATES.CONNECTED).length

    this._log(`Connected to ${connectedCount}/${this.relays.length} relays`)

    // Process any queued events
    if (this.eventQueue.length > 0) {
      this._log(`Processing ${this.eventQueue.length} queued events`)
      const queuedEvents = [...this.eventQueue]
      this.eventQueue = []

      for (const event of queuedEvents) {
        await this.publishEvent(event)
      }
    }
  }

  /**
   * Disconnect from all relays
   *
   * Flushes any pending bookmark updates before disconnecting to prevent data loss.
   */
  async disconnect() {
    this._log('Disconnecting from all relays')

    // Mark as shutting down to prevent re-queueing of failed updates
    this.isShuttingDown = true

    // Flush any pending bookmark updates
    if (this.pendingUpdates.size > 0) {
      this._log('Flushing pending updates before disconnect')
      await this.flushNow()
    }

    // Cancel any remaining debounce timer
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId)
      this.debounceTimeoutId = null
    }

    const disconnectPromises = Array.from(this.connections.keys()).map(relayUrl =>
      this._disconnectFromRelay(relayUrl)
    )

    await Promise.allSettled(disconnectPromises)
    this.connections.clear()
    this.subscriptions.clear()

    this.isShuttingDown = false
    this._log('Disconnected from all relays')
  }

  /**
   * Publish a Nostr event to all connected relays
   * @param {Object} eventData - Event data (will be signed automatically)
   * @returns {Promise<Object>} Published event with signature
   */
  async publishEvent(eventData) {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before publishing events')
    }

    // Get connected relays
    const connectedRelays = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === CONNECTION_STATES.CONNECTED)

    if (connectedRelays.length === 0) {
      // No connected relays - queue the event for later
      this._log('No connected relays, queueing event', { kind: eventData.kind })
      this.eventQueue.push(eventData)
      return null
    }

    try {
      // Sign the event
      const signedEvent = await this._signEvent(eventData)

      // Publish to all connected relays
      const publishPromises = connectedRelays.map(([relayUrl, conn]) =>
        this._publishToRelay(conn.ws, signedEvent)
      )

      const results = await Promise.allSettled(publishPromises)

      // Log results
      const successCount = results.filter(r => r.status === 'fulfilled').length
      this._log(`Published event to ${successCount}/${connectedRelays.length} relays`, {
        eventId: signedEvent.id,
        kind: signedEvent.kind
      })

      return signedEvent

    } catch (error) {
      this._logError('Failed to publish event', error)
      throw error
    }
  }

  /**
   * Subscribe to events from all connected relays
   * @param {Array} filters - Nostr filter objects
   * @param {Function} onEvent - Event handler callback
   * @returns {String} Subscription ID for unsubscribing
   */
  async subscribe(filters, onEvent) {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before subscribing')
    }

    const subscriptionId = this._generateSubscriptionId()

    // Store subscription info
    this.subscriptions.set(subscriptionId, {
      filters,
      onEvent,
      relays: new Set(),
      createdAt: Date.now()
    })

    // Get connected relays
    const connectedRelays = Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === CONNECTION_STATES.CONNECTED)

    if (connectedRelays.length === 0) {
      this._log('No connected relays for subscription', { subscriptionId })
      return subscriptionId
    }

    // Send REQ message to all connected relays
    const subscription = this.subscriptions.get(subscriptionId)
    for (const [relayUrl, conn] of connectedRelays) {
      try {
        await this._subscribeToRelay(conn.ws, subscriptionId, filters)
        subscription.relays.add(relayUrl)
      } catch (error) {
        this._logError(`Failed to subscribe to ${relayUrl}`, error)
      }
    }

    this._log(`Subscribed to ${subscription.relays.size} relays`, { subscriptionId })
    return subscriptionId
  }

  /**
   * Unsubscribe from events
   * @param {String} subscriptionId - Subscription ID to close
   */
  async unsubscribe(subscriptionId) {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) {
      this._log('Subscription not found', { subscriptionId })
      return
    }

    // Send CLOSE message to relays
    for (const relayUrl of subscription.relays) {
      const conn = this.connections.get(relayUrl)
      if (conn && conn.state === CONNECTION_STATES.CONNECTED) {
        try {
          await this._unsubscribeFromRelay(conn.ws, subscriptionId)
        } catch (error) {
          this._logError(`Failed to unsubscribe from ${relayUrl}`, error)
        }
      }
    }

    // Remove subscription
    this.subscriptions.delete(subscriptionId)
    this._log('Unsubscribed', { subscriptionId })
  }

  // ========================================================================
  // Content Encryption/Decryption for Bookmark Data
  // ========================================================================

  /**
   * Encrypt bookmark data for publishing to Nostr relays
   *
   * Uses AES-GCM encryption with the LEK to protect bookmark content.
   * The encrypted content can only be decrypted by devices with the same LEK.
   *
   * @param {Object} bookmarkData - Plain bookmark data object
   * @returns {Promise<string>} - Base64 encoded encrypted content (iv:ciphertext)
   */
  async encryptBookmarkContent(bookmarkData) {
    if (!this.lek) {
      throw new Error('LEK not available for encryption')
    }

    const plaintext = JSON.stringify(bookmarkData)
    const { ciphertext, iv } = await encryptData(this.lek, plaintext)

    // Combine IV and ciphertext for storage
    // Format: base64(iv):base64(ciphertext)
    const ivBase64 = arrayBufferToBase64(iv)
    const ciphertextBase64 = arrayBufferToBase64(ciphertext)

    return `${ivBase64}:${ciphertextBase64}`
  }

  /**
   * Decrypt bookmark content from Nostr event
   *
   * @param {string} encryptedContent - Base64 encoded encrypted content (iv:ciphertext)
   * @returns {Promise<Object>} - Decrypted bookmark data object
   */
  async decryptBookmarkContent(encryptedContent) {
    if (!this.lek) {
      throw new Error('LEK not available for decryption')
    }

    // Parse IV and ciphertext
    const [ivBase64, ciphertextBase64] = encryptedContent.split(':')
    if (!ivBase64 || !ciphertextBase64) {
      throw new Error('Invalid encrypted content format')
    }

    const iv = new Uint8Array(base64ToArrayBuffer(ivBase64))
    const ciphertext = new Uint8Array(base64ToArrayBuffer(ciphertextBase64))

    const plaintext = await decryptData(this.lek, ciphertext, iv)
    return JSON.parse(plaintext)
  }

  /**
   * Publish an encrypted bookmark state to Nostr relays
   *
   * Creates a parameterized replaceable event (kind 30053) with:
   * - 'd' tag: bookmark ID for replacement
   * - 'app' tag: hypermark identifier
   * - 'v' tag: version for future compatibility
   * - Encrypted content: LEK-encrypted bookmark data
   *
   * @param {string} bookmarkId - Unique bookmark identifier
   * @param {Object} bookmarkData - Full bookmark data object
   * @returns {Promise<Object|null>} - Published event or null if queued
   */
  async publishBookmarkState(bookmarkId, bookmarkData) {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before publishing')
    }

    // Encrypt the bookmark content
    const encryptedContent = await this.encryptBookmarkContent(bookmarkData)

    // Build event with proper tags
    const eventData = {
      kind: NOSTR_KINDS.REPLACEABLE_EVENT,
      content: encryptedContent,
      tags: [
        ['d', bookmarkId],           // Parameterized replaceable identifier
        ['app', 'hypermark'],         // Application identifier
        ['v', '1'],                    // Protocol version
        ['t', 'bookmark'],             // Type tag
      ],
    }

    // Add bookmark-specific tags for filtering
    if (bookmarkData.tags && Array.isArray(bookmarkData.tags)) {
      for (const tag of bookmarkData.tags) {
        eventData.tags.push(['tag', tag])
      }
    }

    return this.publishEvent(eventData)
  }

  /**
   * Publish a bookmark deletion event
   *
   * Creates a deletion event (kind 5) referencing the bookmark's replaceable event.
   *
   * @param {string} bookmarkId - ID of bookmark to delete
   * @returns {Promise<Object|null>} - Published delete event or null if queued
   */
  async publishBookmarkDeletion(bookmarkId) {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before publishing')
    }

    const eventData = {
      kind: NOSTR_KINDS.DELETE,
      content: 'Bookmark deleted',
      tags: [
        ['a', `${NOSTR_KINDS.REPLACEABLE_EVENT}:${getXOnlyPubkey(this.nostrKeypair.publicKeyBytes)}:${bookmarkId}`],
        ['app', 'hypermark'],
      ],
    }

    return this.publishEvent(eventData)
  }

  /**
   * Subscribe to bookmark updates for this user
   *
   * @param {Function} onBookmarkUpdate - Callback for bookmark updates (bookmarkId, bookmarkData)
   * @param {Function} onBookmarkDelete - Callback for bookmark deletions (bookmarkId)
   * @returns {Promise<string>} - Subscription ID
   */
  async subscribeToBookmarks(onBookmarkUpdate, onBookmarkDelete) {
    if (!this.isInitialized) {
      throw new Error('Service must be initialized before subscribing')
    }

    const xOnlyPubkey = getXOnlyPubkey(this.nostrKeypair.publicKeyBytes)

    const filters = [
      {
        kinds: [NOSTR_KINDS.REPLACEABLE_EVENT],
        authors: [xOnlyPubkey],
        '#app': ['hypermark'],
      },
      {
        kinds: [NOSTR_KINDS.DELETE],
        authors: [xOnlyPubkey],
        '#app': ['hypermark'],
      },
    ]

    return this.subscribe(filters, async (event, relayUrl) => {
      try {
        if (event.kind === NOSTR_KINDS.REPLACEABLE_EVENT) {
          // Extract bookmark ID from 'd' tag
          const dTag = event.tags.find(t => t[0] === 'd')
          if (!dTag) {
            this._log('Bookmark event missing d tag', { eventId: event.id })
            return
          }

          const bookmarkId = dTag[1]

          // Decrypt content
          const bookmarkData = await this.decryptBookmarkContent(event.content)

          // Call update handler
          if (onBookmarkUpdate) {
            await onBookmarkUpdate(bookmarkId, bookmarkData, event)
          }

        } else if (event.kind === NOSTR_KINDS.DELETE) {
          // Extract bookmark ID from 'a' tag
          const aTag = event.tags.find(t => t[0] === 'a')
          if (!aTag) return

          // Parse addressable event reference (kind:pubkey:d-tag)
          const parts = aTag[1].split(':')
          if (parts.length >= 3) {
            const bookmarkId = parts[2]
            if (onBookmarkDelete) {
              await onBookmarkDelete(bookmarkId, event)
            }
          }
        }
      } catch (error) {
        this._logError('Error processing bookmark event', error)
      }
    })
  }

  // ========================================================================
  // Debounced Publishing Infrastructure (BEAD 2.2)
  // ========================================================================

  /**
   * Queue a bookmark update for debounced publishing
   *
   * Multiple rapid changes to the same bookmark will be deduplicated,
   * with only the final state being published after the debounce period.
   *
   * @param {string} bookmarkId - Bookmark identifier
   * @param {Object} bookmarkData - Current bookmark state
   */
  queueBookmarkUpdate(bookmarkId, bookmarkData) {
    // Update pending updates map (overwrites previous pending state)
    this.pendingUpdates.set(bookmarkId, {
      data: bookmarkData,
      timestamp: Date.now(),
    })

    this._log('Queued bookmark update', {
      bookmarkId,
      pendingCount: this.pendingUpdates.size,
    })

    // Reset debounce timer
    this._scheduleFlush()
  }

  /**
   * Schedule a flush of pending updates
   * @private
   */
  _scheduleFlush() {
    // Clear existing timeout
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId)
    }

    // Schedule new flush
    this.debounceTimeoutId = setTimeout(
      this._flushPendingUpdates,
      this.debounceDelay
    )
  }

  /**
   * Flush all pending bookmark updates to Nostr relays
   *
   * Called automatically after debounce period, or manually during shutdown.
   *
   * @returns {Promise<Object>} - Results of flush operation
   */
  async _flushPendingUpdates() {
    if (this.pendingUpdates.size === 0) {
      return { published: 0, failed: 0 }
    }

    const updates = Array.from(this.pendingUpdates.entries())
    this.pendingUpdates.clear()
    this.debounceTimeoutId = null

    this._log('Flushing pending updates', { count: updates.length })

    let published = 0
    let failed = 0

    for (const [bookmarkId, { data }] of updates) {
      try {
        await this.publishBookmarkState(bookmarkId, data)
        published++
      } catch (error) {
        failed++
        this._logError(`Failed to publish bookmark ${bookmarkId}`, error)

        // Re-queue failed updates if not shutting down
        if (!this.isShuttingDown) {
          this.pendingUpdates.set(bookmarkId, { data, timestamp: Date.now() })
        }
      }
    }

    this._log('Flush complete', { published, failed })

    // If there are re-queued failures and not shutting down, schedule another flush
    if (this.pendingUpdates.size > 0 && !this.isShuttingDown) {
      this._scheduleFlush()
    }

    return { published, failed }
  }

  /**
   * Force immediate flush of all pending updates
   *
   * Call this when the service is shutting down to ensure no data is lost.
   *
   * @returns {Promise<Object>} - Results of flush operation
   */
  async flushNow() {
    // Cancel any pending debounce
    if (this.debounceTimeoutId) {
      clearTimeout(this.debounceTimeoutId)
      this.debounceTimeoutId = null
    }

    return this._flushPendingUpdates()
  }

  /**
   * Get pending update count
   * @returns {number} - Number of pending bookmark updates
   */
  getPendingUpdateCount() {
    return this.pendingUpdates.size
  }

  /**
   * Get current connection status
   * @returns {Object} Status information
   */
  getStatus() {
    const connections = Array.from(this.connections.entries()).map(([url, conn]) => ({
      url,
      state: conn.state,
      connectedAt: conn.connectedAt,
      retryCount: conn.retryCount,
      error: conn.lastError
    }))

    const connectedCount = connections.filter(c => c.state === CONNECTION_STATES.CONNECTED).length

    return {
      isInitialized: this.isInitialized,
      publicKey: this.nostrKeypair?.publicKeyHex,
      relays: {
        total: this.relays.length,
        connected: connectedCount,
        connections
      },
      subscriptions: {
        active: this.subscriptions.size,
        list: Array.from(this.subscriptions.entries()).map(([id, sub]) => ({
          id,
          relayCount: sub.relays.size,
          createdAt: sub.createdAt
        }))
      },
      queuedEvents: this.eventQueue.length,
      pendingUpdates: this.pendingUpdates.size,
    }
  }

  /**
   * Add event handler for specific event types
   * @param {String} eventType - Event type to handle
   * @param {Function} handler - Handler function
   */
  onEvent(eventType, handler) {
    this.eventHandlers.set(eventType, handler)
  }

  /**
   * Add connection state change handler
   * @param {Function} handler - Handler function (relayUrl, oldState, newState)
   */
  onConnectionChange(handler) {
    this.connectionHandlers.push(handler)
  }

  // Private methods

  async _connectToRelay(relayUrl) {
    if (this.connections.has(relayUrl)) {
      const conn = this.connections.get(relayUrl)
      if (conn.state === CONNECTION_STATES.CONNECTED ||
          conn.state === CONNECTION_STATES.CONNECTING) {
        return // Already connected or connecting
      }
    }

    this._log(`Connecting to relay: ${relayUrl}`)

    const connection = {
      url: relayUrl,
      ws: null,
      state: CONNECTION_STATES.CONNECTING,
      retryCount: 0,
      retryTimeout: null,
      connectedAt: null,
      lastError: null
    }

    this.connections.set(relayUrl, connection)
    this._notifyConnectionChange(relayUrl, CONNECTION_STATES.DISCONNECTED, CONNECTION_STATES.CONNECTING)

    try {
      const ws = new WebSocket(relayUrl)
      connection.ws = ws

      ws.addEventListener('open', (event) => this._handleWebSocketOpen(relayUrl, event))
      ws.addEventListener('close', (event) => this._handleWebSocketClose(relayUrl, event))
      ws.addEventListener('error', (event) => this._handleWebSocketError(relayUrl, event))
      ws.addEventListener('message', (event) => this._handleWebSocketMessage(relayUrl, event))

    } catch (error) {
      connection.state = CONNECTION_STATES.ERROR
      connection.lastError = error.message
      this._notifyConnectionChange(relayUrl, CONNECTION_STATES.CONNECTING, CONNECTION_STATES.ERROR)
      this._scheduleReconnect(relayUrl)
      throw error
    }
  }

  async _disconnectFromRelay(relayUrl) {
    const connection = this.connections.get(relayUrl)
    if (!connection) return

    // Clear retry timeout
    if (connection.retryTimeout) {
      clearTimeout(connection.retryTimeout)
      connection.retryTimeout = null
    }

    // Close WebSocket
    if (connection.ws && connection.ws.readyState === WebSocket.OPEN) {
      connection.ws.close()
    }

    connection.state = CONNECTION_STATES.DISCONNECTED
    this.connections.delete(relayUrl)

    this._log(`Disconnected from relay: ${relayUrl}`)
  }

  _handleWebSocketOpen(relayUrl, event) {
    const connection = this.connections.get(relayUrl)
    if (!connection) return

    const oldState = connection.state
    connection.state = CONNECTION_STATES.CONNECTED
    connection.connectedAt = Date.now()
    connection.retryCount = 0 // Reset retry count on successful connection
    connection.lastError = null

    this._log(`Connected to relay: ${relayUrl}`)
    this._notifyConnectionChange(relayUrl, oldState, CONNECTION_STATES.CONNECTED)

    // Re-establish subscriptions for this relay
    this._resubscribeToRelay(relayUrl, connection.ws)
  }

  _handleWebSocketClose(relayUrl, event) {
    const connection = this.connections.get(relayUrl)
    if (!connection) return

    const oldState = connection.state
    connection.state = CONNECTION_STATES.DISCONNECTED
    connection.connectedAt = null

    this._log(`Disconnected from relay: ${relayUrl}`, {
      code: event.code,
      reason: event.reason
    })
    this._notifyConnectionChange(relayUrl, oldState, CONNECTION_STATES.DISCONNECTED)

    // Schedule reconnection if auto-reconnect is enabled
    if (this.autoReconnect) {
      this._scheduleReconnect(relayUrl)
    }
  }

  _handleWebSocketError(relayUrl, event) {
    const connection = this.connections.get(relayUrl)
    if (!connection) return

    const oldState = connection.state
    connection.state = CONNECTION_STATES.ERROR
    connection.lastError = 'WebSocket connection error'

    this._logError(`WebSocket error for relay: ${relayUrl}`, event)
    this._notifyConnectionChange(relayUrl, oldState, CONNECTION_STATES.ERROR)
  }

  async _handleWebSocketMessage(relayUrl, event) {
    try {
      const data = JSON.parse(event.data)

      if (Array.isArray(data) && data.length >= 2) {
        const [messageType, ...args] = data

        switch (messageType) {
          case 'EVENT':
            await this._handleEventMessage(relayUrl, args)
            break
          case 'OK':
            this._handleOkMessage(relayUrl, args)
            break
          case 'EOSE':
            this._handleEndOfStoredEvents(relayUrl, args)
            break
          case 'NOTICE':
            this._handleNoticeMessage(relayUrl, args)
            break
          default:
            this._log(`Unknown message type from ${relayUrl}:`, messageType)
        }
      }

    } catch (error) {
      this._logError(`Failed to parse message from ${relayUrl}`, error)
    }
  }

  async _handleEventMessage(relayUrl, [subscriptionId, event]) {
    const subscription = this.subscriptions.get(subscriptionId)
    if (!subscription) {
      this._log(`Received event for unknown subscription: ${subscriptionId}`)
      return
    }

    try {
      // Verify event signature (async Schnorr verification)
      const isValid = await this._verifyEventSignature(event)
      if (!isValid) {
        this._log(`Invalid event signature from ${relayUrl}`, { eventId: event.id })
        return
      }

      // Call subscription handler
      await subscription.onEvent(event, relayUrl)

    } catch (error) {
      this._logError(`Error handling event from ${relayUrl}`, error)
    }
  }

  _handleOkMessage(relayUrl, [eventId, accepted, message]) {
    this._log(`Event ${eventId} ${accepted ? 'accepted' : 'rejected'} by ${relayUrl}`,
      message ? { message } : {})
  }

  _handleEndOfStoredEvents(relayUrl, [subscriptionId]) {
    this._log(`End of stored events for subscription ${subscriptionId} from ${relayUrl}`)
  }

  _handleNoticeMessage(relayUrl, [message]) {
    this._log(`Notice from ${relayUrl}: ${message}`)
  }

  _scheduleReconnect(relayUrl) {
    const connection = this.connections.get(relayUrl)
    if (!connection || !this.autoReconnect) return

    connection.retryCount++

    if (connection.retryCount > RETRY_CONFIG.maxRetries) {
      this._log(`Max retries exceeded for ${relayUrl}, giving up`)
      return
    }

    // Calculate delay with exponential backoff and jitter
    const baseDelay = Math.min(
      RETRY_CONFIG.baseDelay * Math.pow(RETRY_CONFIG.backoffFactor, connection.retryCount - 1),
      RETRY_CONFIG.maxDelay
    )

    const jitter = baseDelay * RETRY_CONFIG.jitterFactor * (Math.random() - 0.5)
    const delay = Math.max(baseDelay + jitter, 100) // Minimum 100ms delay

    this._log(`Scheduling reconnect to ${relayUrl} in ${Math.round(delay)}ms (attempt ${connection.retryCount})`)

    connection.retryTimeout = setTimeout(async () => {
      connection.state = CONNECTION_STATES.RECONNECTING
      this._notifyConnectionChange(relayUrl, CONNECTION_STATES.DISCONNECTED, CONNECTION_STATES.RECONNECTING)

      try {
        await this._connectToRelay(relayUrl)
      } catch (error) {
        this._logError(`Reconnection failed for ${relayUrl}`, error)
      }
    }, delay)
  }

  async _resubscribeToRelay(relayUrl, ws) {
    for (const [subscriptionId, subscription] of this.subscriptions.entries()) {
      try {
        await this._subscribeToRelay(ws, subscriptionId, subscription.filters)
        subscription.relays.add(relayUrl)
        this._log(`Re-established subscription ${subscriptionId} on ${relayUrl}`)
      } catch (error) {
        this._logError(`Failed to re-establish subscription on ${relayUrl}`, error)
      }
    }
  }

  async _publishToRelay(ws, event) {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open')
    }

    const message = JSON.stringify(['EVENT', event])
    ws.send(message)
  }

  async _subscribeToRelay(ws, subscriptionId, filters) {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open')
    }

    const message = JSON.stringify(['REQ', subscriptionId, ...filters])
    ws.send(message)
  }

  async _unsubscribeFromRelay(ws, subscriptionId) {
    if (ws.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket not open')
    }

    const message = JSON.stringify(['CLOSE', subscriptionId])
    ws.send(message)
  }

  async _signEvent(eventData) {
    // Create and sign event using proper Nostr cryptography
    const signedEvent = await createSignedNostrEvent(
      {
        kind: eventData.kind,
        content: eventData.content || '',
        tags: eventData.tags || [],
        created_at: eventData.created_at,
      },
      this.nostrKeypair
    )

    return signedEvent
  }

  async _verifyEventSignature(event) {
    // Use real Schnorr signature verification
    return verifyNostrEventSignature(event)
  }

  _generateSubscriptionId() {
    return Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }

  _notifyConnectionChange(relayUrl, oldState, newState) {
    for (const handler of this.connectionHandlers) {
      try {
        handler(relayUrl, oldState, newState)
      } catch (error) {
        this._logError('Connection change handler error', error)
      }
    }
  }

  _log(message, data = {}) {
    if (this.debug) {
      console.log(`[NostrSync] ${message}`, data)
    }
  }

  _logError(message, error = null) {
    console.error(`[NostrSync] ${message}`, error || '')
  }
}

/**
 * Create and initialize a NostrSyncService instance
 * @param {Object} lek - Ledger Encryption Key
 * @param {Object} options - Service options
 * @returns {Promise<NostrSyncService>} Initialized service
 */
export async function createNostrSyncService(lek, options = {}) {
  const service = new NostrSyncService(options)
  await service.initialize(lek)
  return service
}

export default NostrSyncService