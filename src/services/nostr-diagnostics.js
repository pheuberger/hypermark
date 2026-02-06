/**
 * Nostr Diagnostics Service
 *
 * Comprehensive diagnostics system for Nostr sync troubleshooting.
 * Provides tools to test relay connectivity, verify keypair derivation,
 * check sync history, validate event publishing/receiving, and diagnose
 * common sync issues.
 *
 * Features:
 * - Relay connectivity testing with latency measurement
 * - Keypair derivation verification
 * - Sync history and event log tracking
 * - Event validation diagnostics
 * - Guided troubleshooting workflows
 * - Export diagnostics for support
 */

import { getNostrSyncService } from '../hooks/useNostrSync'
import { retrieveLEK } from './key-storage'
import { deriveNostrKeypair, getXOnlyPubkey, uint8ArrayToHex } from './nostr-crypto'
import {
  CONNECTION_STATES,
  DEFAULT_RELAYS,
  validateEventStructure,
  validateEventTimestamp,
  validateEventTags,
  validateEventContentSize,
  validateBookmarkEvent,
} from './nostr-sync'

// ========================================================================
// Diagnostic Result Types
// ========================================================================

/**
 * Diagnostic check result
 * @typedef {Object} DiagnosticResult
 * @property {string} id - Unique identifier for this check
 * @property {string} name - Human-readable name
 * @property {string} status - 'pass' | 'warn' | 'fail' | 'pending' | 'running'
 * @property {string} message - Result description
 * @property {Object} [details] - Additional details for debugging
 * @property {number} [duration] - Check duration in milliseconds
 * @property {Date} timestamp - When the check was performed
 */

/**
 * Relay diagnostic information
 * @typedef {Object} RelayDiagnostic
 * @property {string} url - Relay URL
 * @property {boolean} reachable - Whether relay is reachable
 * @property {number|null} latency - Connection latency in ms
 * @property {string} state - Current connection state
 * @property {string|null} error - Error message if any
 * @property {boolean} supportsNip01 - Basic NIP-01 support
 * @property {Date} testedAt - When the test was performed
 */

/**
 * Sync history entry
 * @typedef {Object} SyncHistoryEntry
 * @property {string} type - 'publish' | 'receive' | 'error'
 * @property {string} eventType - 'bookmark' | 'delete' | 'unknown'
 * @property {string} [eventId] - Nostr event ID
 * @property {string} [bookmarkId] - Bookmark ID if applicable
 * @property {string} [relay] - Relay URL involved
 * @property {string} [error] - Error message if any
 * @property {Date} timestamp - When this occurred
 */

// ========================================================================
// Diagnostic Storage
// ========================================================================

const MAX_HISTORY_ENTRIES = 100
const STORAGE_KEY_SYNC_HISTORY = 'hypermark_sync_history'
const STORAGE_KEY_DIAGNOSTIC_LOGS = 'hypermark_diagnostic_logs'

/**
 * Load sync history from localStorage
 * @returns {SyncHistoryEntry[]}
 */
function loadSyncHistory() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SYNC_HISTORY)
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return parsed.map(entry => ({
      ...entry,
      timestamp: new Date(entry.timestamp)
    }))
  } catch {
    return []
  }
}

/**
 * Save sync history to localStorage
 * @param {SyncHistoryEntry[]} history
 */
function saveSyncHistory(history) {
  try {
    // Keep only the most recent entries
    const trimmed = history.slice(-MAX_HISTORY_ENTRIES)
    localStorage.setItem(STORAGE_KEY_SYNC_HISTORY, JSON.stringify(trimmed))
  } catch (error) {
    console.error('[NostrDiagnostics] Failed to save sync history:', error)
  }
}

/**
 * Load diagnostic logs from localStorage
 * @returns {Object[]}
 */
function loadDiagnosticLogs() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DIAGNOSTIC_LOGS)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

/**
 * Save diagnostic logs to localStorage
 * @param {Object[]} logs
 */
function saveDiagnosticLogs(logs) {
  try {
    const trimmed = logs.slice(-MAX_HISTORY_ENTRIES)
    localStorage.setItem(STORAGE_KEY_DIAGNOSTIC_LOGS, JSON.stringify(trimmed))
  } catch (error) {
    console.error('[NostrDiagnostics] Failed to save diagnostic logs:', error)
  }
}

// ========================================================================
// NostrDiagnosticsService Class
// ========================================================================

/**
 * NostrDiagnosticsService - Comprehensive diagnostics for Nostr sync
 */
class NostrDiagnosticsService {
  constructor() {
    this.syncHistory = loadSyncHistory()
    this.diagnosticLogs = loadDiagnosticLogs()
    this.listeners = []
  }

  /**
   * Subscribe to diagnostic updates
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.push(callback)
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback)
    }
  }

  /**
   * Notify all listeners of changes
   */
  _notify() {
    this.listeners.forEach(cb => {
      try {
        cb()
      } catch (error) {
        console.error('[NostrDiagnostics] Listener error:', error)
      }
    })
  }

  // ========================================================================
  // Sync History Tracking
  // ========================================================================

  /**
   * Record a sync event in history
   * @param {Partial<SyncHistoryEntry>} entry
   */
  recordSyncEvent(entry) {
    const historyEntry = {
      type: entry.type || 'unknown',
      eventType: entry.eventType || 'unknown',
      eventId: entry.eventId || null,
      bookmarkId: entry.bookmarkId || null,
      relay: entry.relay || null,
      error: entry.error || null,
      timestamp: new Date()
    }

    this.syncHistory.push(historyEntry)
    saveSyncHistory(this.syncHistory)
    this._notify()
  }

  /**
   * Record a publish event
   */
  recordPublish(eventId, bookmarkId, relay) {
    this.recordSyncEvent({
      type: 'publish',
      eventType: 'bookmark',
      eventId,
      bookmarkId,
      relay
    })
  }

  /**
   * Record a received event
   */
  recordReceive(eventId, eventType, bookmarkId, relay) {
    this.recordSyncEvent({
      type: 'receive',
      eventType,
      eventId,
      bookmarkId,
      relay
    })
  }

  /**
   * Record an error
   */
  recordError(error, context = {}) {
    this.recordSyncEvent({
      type: 'error',
      eventType: context.eventType || 'unknown',
      eventId: context.eventId || null,
      bookmarkId: context.bookmarkId || null,
      relay: context.relay || null,
      error: error.message || String(error)
    })
  }

  /**
   * Get sync history
   * @param {Object} options - Filter options
   * @returns {SyncHistoryEntry[]}
   */
  getSyncHistory(options = {}) {
    let history = [...this.syncHistory]

    if (options.type) {
      history = history.filter(e => e.type === options.type)
    }

    if (options.since) {
      const since = new Date(options.since)
      history = history.filter(e => e.timestamp >= since)
    }

    if (options.limit) {
      history = history.slice(-options.limit)
    }

    return history.reverse() // Most recent first
  }

  /**
   * Clear sync history
   */
  clearSyncHistory() {
    this.syncHistory = []
    saveSyncHistory([])
    this._notify()
  }

  // ========================================================================
  // Relay Connectivity Diagnostics
  // ========================================================================

  /**
   * Test connectivity to a single relay
   * @param {string} relayUrl
   * @param {number} timeout - Timeout in milliseconds
   * @returns {Promise<RelayDiagnostic>}
   */
  async testRelayConnectivity(relayUrl, timeout = 5000) {
    const startTime = Date.now()

    return new Promise((resolve) => {
      let ws = null
      let resolved = false
      let supportsNip01 = false

      const cleanup = () => {
        if (ws) {
          ws.onopen = null
          ws.onerror = null
          ws.onclose = null
          ws.onmessage = null
          if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
            ws.close()
          }
        }
      }

      const finish = (result) => {
        if (!resolved) {
          resolved = true
          cleanup()
          resolve({
            ...result,
            url: relayUrl,
            testedAt: new Date()
          })
        }
      }

      const timeoutId = setTimeout(() => {
        finish({
          reachable: false,
          latency: null,
          state: 'timeout',
          error: `Connection timed out after ${timeout}ms`,
          supportsNip01: false
        })
      }, timeout)

      try {
        ws = new WebSocket(relayUrl)

        ws.onopen = () => {
          const latency = Date.now() - startTime

          // Test NIP-01 support by sending a simple REQ
          const testSubId = 'diag_' + Math.random().toString(36).slice(2, 10)
          ws.send(JSON.stringify(['REQ', testSubId, { limit: 0 }]))

          // Wait briefly for response to confirm NIP-01 support
          setTimeout(() => {
            clearTimeout(timeoutId)
            finish({
              reachable: true,
              latency,
              state: 'connected',
              error: null,
              supportsNip01
            })
          }, 500)
        }

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data)
            if (Array.isArray(data) && (data[0] === 'EOSE' || data[0] === 'EVENT' || data[0] === 'NOTICE')) {
              supportsNip01 = true
            }
          } catch {
            // Ignore parse errors
          }
        }

        ws.onerror = () => {
          clearTimeout(timeoutId)
          finish({
            reachable: false,
            latency: null,
            state: 'error',
            error: 'WebSocket connection failed',
            supportsNip01: false
          })
        }

        ws.onclose = (event) => {
          if (!resolved) {
            clearTimeout(timeoutId)
            finish({
              reachable: false,
              latency: null,
              state: 'closed',
              error: `Connection closed (code: ${event.code})`,
              supportsNip01: false
            })
          }
        }
      } catch (error) {
        clearTimeout(timeoutId)
        finish({
          reachable: false,
          latency: null,
          state: 'error',
          error: error.message,
          supportsNip01: false
        })
      }
    })
  }

  /**
   * Test all configured relays
   * @param {string[]} relays - Relay URLs to test (defaults to current + defaults)
   * @returns {Promise<RelayDiagnostic[]>}
   */
  async testAllRelays(relays = null) {
    const service = getNostrSyncService()
    const relaysToTest = relays || (service ? service.getRelays() : DEFAULT_RELAYS)

    const results = await Promise.all(
      relaysToTest.map(relay => this.testRelayConnectivity(relay))
    )

    return results
  }

  /**
   * Get current relay status from the sync service
   * @returns {Object} Current relay status
   */
  getRelayStatus() {
    const service = getNostrSyncService()
    if (!service) {
      return {
        available: false,
        message: 'Nostr sync service not initialized'
      }
    }

    const status = service.getStatus()
    return {
      available: true,
      isInitialized: status.isInitialized,
      publicKey: status.publicKey,
      relays: status.relays,
      subscriptions: status.subscriptions,
      queuedEvents: status.queuedEvents,
      pendingUpdates: status.pendingUpdates
    }
  }

  // ========================================================================
  // Keypair Derivation Verification
  // ========================================================================

  /**
   * Verify keypair derivation from LEK
   * @returns {Promise<DiagnosticResult>}
   */
  async verifyKeypairDerivation() {
    const startTime = Date.now()

    try {
      // Check if LEK is available
      const lek = await retrieveLEK()
      if (!lek) {
        return {
          id: 'keypair-derivation',
          name: 'Keypair Derivation',
          status: 'fail',
          message: 'LEK not available - device may not be paired',
          details: { lekAvailable: false },
          duration: Date.now() - startTime,
          timestamp: new Date()
        }
      }

      // Derive keypair
      const keypair = await deriveNostrKeypair(lek)
      const pubkeyHex = keypair.publicKeyHex
      const xOnlyPubkey = getXOnlyPubkey(keypair.publicKeyBytes)

      // Verify against current service keypair if available
      const service = getNostrSyncService()
      let keysMatch = true
      let servicePublicKey = null

      if (service?.isInitialized) {
        const status = service.getStatus()
        servicePublicKey = status.publicKey
        keysMatch = servicePublicKey === xOnlyPubkey
      }

      return {
        id: 'keypair-derivation',
        name: 'Keypair Derivation',
        status: keysMatch ? 'pass' : 'warn',
        message: keysMatch
          ? 'Keypair derived successfully'
          : 'Derived keypair does not match service keypair',
        details: {
          lekAvailable: true,
          derivedPublicKey: xOnlyPubkey,
          fullPublicKey: pubkeyHex,
          servicePublicKey,
          keysMatch
        },
        duration: Date.now() - startTime,
        timestamp: new Date()
      }
    } catch (error) {
      return {
        id: 'keypair-derivation',
        name: 'Keypair Derivation',
        status: 'fail',
        message: `Derivation failed: ${error.message}`,
        details: { error: error.message },
        duration: Date.now() - startTime,
        timestamp: new Date()
      }
    }
  }

  /**
   * Get keypair fingerprint (for display without exposing full key)
   * @returns {Promise<Object>}
   */
  async getKeypairFingerprint() {
    try {
      const lek = await retrieveLEK()
      if (!lek) {
        return { available: false, fingerprint: null }
      }

      const keypair = await deriveNostrKeypair(lek)
      const xOnlyPubkey = getXOnlyPubkey(keypair.publicKeyBytes)

      // Return first and last 8 characters as fingerprint
      const fingerprint = `${xOnlyPubkey.slice(0, 8)}...${xOnlyPubkey.slice(-8)}`

      return {
        available: true,
        fingerprint,
        fullPublicKey: xOnlyPubkey
      }
    } catch (error) {
      return {
        available: false,
        fingerprint: null,
        error: error.message
      }
    }
  }

  // ========================================================================
  // Event Validation Diagnostics
  // ========================================================================

  /**
   * Validate a Nostr event and return detailed results
   * @param {Object} event - Nostr event to validate
   * @returns {Object} Validation results
   */
  validateEvent(event) {
    const results = {
      valid: true,
      checks: []
    }

    // Structure validation
    const structureResult = validateEventStructure(event)
    results.checks.push({
      name: 'Event Structure (NIP-01)',
      status: structureResult.valid ? 'pass' : 'fail',
      message: structureResult.valid ? 'Valid structure' : structureResult.message,
      details: structureResult.details
    })
    if (!structureResult.valid) results.valid = false

    // Only continue if structure is valid
    if (structureResult.valid) {
      // Timestamp validation
      const timestampResult = validateEventTimestamp(event)
      results.checks.push({
        name: 'Timestamp',
        status: timestampResult.valid ? 'pass' : 'fail',
        message: timestampResult.valid ? 'Valid timestamp' : timestampResult.message,
        details: timestampResult.details
      })
      if (!timestampResult.valid) results.valid = false

      // Tags validation
      const tagsResult = validateEventTags(event)
      results.checks.push({
        name: 'Tags Structure',
        status: tagsResult.valid ? 'pass' : 'fail',
        message: tagsResult.valid ? 'Valid tags' : tagsResult.message,
        details: tagsResult.details
      })
      if (!tagsResult.valid) results.valid = false

      // Content size validation
      const contentResult = validateEventContentSize(event)
      results.checks.push({
        name: 'Content Size',
        status: contentResult.valid ? 'pass' : 'fail',
        message: contentResult.valid ? 'Content within limits' : contentResult.message,
        details: contentResult.details
      })
      if (!contentResult.valid) results.valid = false

      // Bookmark-specific validation (if applicable)
      if (event.kind === 30053) {
        const bookmarkResult = validateBookmarkEvent(event)
        results.checks.push({
          name: 'Bookmark Event',
          status: bookmarkResult.valid ? 'pass' : 'fail',
          message: bookmarkResult.valid ? 'Valid bookmark event' : bookmarkResult.message,
          details: bookmarkResult.details
        })
        if (!bookmarkResult.valid) results.valid = false
      }
    }

    return results
  }

  // ========================================================================
  // Comprehensive Diagnostics
  // ========================================================================

  /**
   * Run all diagnostic checks
   * @param {Function} onProgress - Progress callback
   * @returns {Promise<DiagnosticResult[]>}
   */
  async runAllDiagnostics(onProgress = null) {
    const results = []

    const reportProgress = (index, total, check) => {
      if (onProgress) {
        onProgress({ index, total, currentCheck: check })
      }
    }

    const checks = [
      { id: 'lek', name: 'LEK Availability', fn: () => this._checkLEK() },
      { id: 'keypair', name: 'Keypair Derivation', fn: () => this.verifyKeypairDerivation() },
      { id: 'service', name: 'Sync Service Status', fn: () => this._checkSyncService() },
      { id: 'relays', name: 'Relay Connectivity', fn: () => this._checkRelays() },
      { id: 'subscriptions', name: 'Active Subscriptions', fn: () => this._checkSubscriptions() },
      { id: 'pending', name: 'Pending Updates', fn: () => this._checkPendingUpdates() },
    ]

    for (let i = 0; i < checks.length; i++) {
      const check = checks[i]
      reportProgress(i, checks.length, check.name)

      try {
        const result = await check.fn()
        results.push(result)
      } catch (error) {
        results.push({
          id: check.id,
          name: check.name,
          status: 'fail',
          message: `Check failed: ${error.message}`,
          details: { error: error.message },
          timestamp: new Date()
        })
      }
    }

    // Log the diagnostic run
    this._logDiagnosticRun(results)

    return results
  }

  /**
   * Create a standardized diagnostic result object.
   * @private
   */
  _result(id, name, status, message, details, startTime) {
    return { id, name, status, message, details, duration: Date.now() - startTime, timestamp: new Date() }
  }

  /**
   * Run a diagnostic check that requires the sync service.
   * Handles the common "service not initialized" guard and error catching.
   * @private
   */
  async _runServiceCheck(id, name, checkFn) {
    const startTime = Date.now()
    const service = getNostrSyncService()
    if (!service) {
      return this._result(id, name, 'fail', `Cannot check ${name.toLowerCase()} - service not initialized`, {}, startTime)
    }
    try {
      return await checkFn(service, startTime)
    } catch (error) {
      return this._result(id, name, 'fail', `Check failed: ${error.message}`, { error: error.message }, startTime)
    }
  }

  /**
   * Check LEK availability
   * @private
   */
  async _checkLEK() {
    const startTime = Date.now()
    try {
      const lek = await retrieveLEK()
      return this._result('lek', 'LEK Availability',
        lek ? 'pass' : 'fail',
        lek ? 'LEK is available' : 'LEK not found - device needs pairing',
        { available: !!lek }, startTime)
    } catch (error) {
      return this._result('lek', 'LEK Availability', 'fail',
        `Failed to check LEK: ${error.message}`, { error: error.message }, startTime)
    }
  }

  /**
   * Check sync service status
   * @private
   */
  async _checkSyncService() {
    return this._runServiceCheck('service', 'Sync Service Status', (service, startTime) => {
      const status = service.getStatus()
      return this._result('service', 'Sync Service Status',
        status.isInitialized ? 'pass' : 'warn',
        status.isInitialized
          ? `Service initialized with ${status.relays.connected}/${status.relays.total} relays`
          : 'Service not fully initialized',
        status, startTime)
    })
  }

  /**
   * Check relay connectivity
   * @private
   */
  async _checkRelays() {
    return this._runServiceCheck('relays', 'Relay Connectivity', (service, startTime) => {
      const { connected: connectedCount, total: totalCount, connections } = service.getStatus().relays
      let resultStatus, message
      if (connectedCount === 0) {
        resultStatus = 'fail'
        message = 'No relays connected'
      } else if (connectedCount < totalCount / 2) {
        resultStatus = 'warn'
        message = `Only ${connectedCount} of ${totalCount} relays connected`
      } else {
        resultStatus = 'pass'
        message = `${connectedCount} of ${totalCount} relays connected`
      }
      return this._result('relays', 'Relay Connectivity', resultStatus, message,
        { connected: connectedCount, total: totalCount, connections }, startTime)
    })
  }

  /**
   * Check active subscriptions
   * @private
   */
  async _checkSubscriptions() {
    return this._runServiceCheck('subscriptions', 'Active Subscriptions', (service, startTime) => {
      const { active: subCount } = service.getStatus().subscriptions
      return this._result('subscriptions', 'Active Subscriptions',
        subCount > 0 ? 'pass' : 'warn',
        subCount > 0 ? `${subCount} active subscription(s)` : 'No active subscriptions',
        service.getStatus().subscriptions, startTime)
    })
  }

  /**
   * Check pending updates
   * @private
   */
  async _checkPendingUpdates() {
    return this._runServiceCheck('pending', 'Pending Updates', (service, startTime) => {
      const status = service.getStatus()
      const { pendingUpdates: pendingCount, queuedEvents: queuedCount } = status
      let resultStatus = 'pass'
      let message = 'No pending updates'
      if (pendingCount > 0 || queuedCount > 0) {
        resultStatus = 'warn'
        const parts = []
        if (pendingCount > 0) parts.push(`${pendingCount} pending update(s)`)
        if (queuedCount > 0) parts.push(`${queuedCount} queued event(s)`)
        message = parts.join(', ')
      }
      return this._result('pending', 'Pending Updates', resultStatus, message,
        { pendingUpdates: pendingCount, queuedEvents: queuedCount }, startTime)
    })
  }

  /**
   * Log a diagnostic run
   * @private
   */
  _logDiagnosticRun(results) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      results: results.map(r => ({
        id: r.id,
        status: r.status,
        message: r.message
      })),
      summary: {
        total: results.length,
        passed: results.filter(r => r.status === 'pass').length,
        warnings: results.filter(r => r.status === 'warn').length,
        failed: results.filter(r => r.status === 'fail').length
      }
    }

    this.diagnosticLogs.push(logEntry)
    saveDiagnosticLogs(this.diagnosticLogs)
  }

  // ========================================================================
  // Guided Troubleshooting
  // ========================================================================

  /**
   * Get troubleshooting suggestions based on current state
   * @returns {Promise<Object[]>}
   */
  async getTroubleshootingSuggestions() {
    const suggestions = []
    const service = getNostrSyncService()

    // Check LEK
    const lek = await retrieveLEK()
    if (!lek) {
      suggestions.push({
        id: 'pair-device',
        severity: 'error',
        title: 'Device Not Paired',
        description: 'Your device needs to be paired before cloud sync can work.',
        action: 'Go to Settings > Device Pairing to set up your device.',
        category: 'lek'
      })
      return suggestions // Can't proceed without LEK
    }

    // Check service
    if (!service || !service.isInitialized) {
      suggestions.push({
        id: 'init-service',
        severity: 'error',
        title: 'Sync Service Not Initialized',
        description: 'The Nostr sync service failed to initialize.',
        action: 'Try refreshing the page. If the problem persists, check browser console for errors.',
        category: 'service'
      })
      return suggestions
    }

    const status = service.getStatus()

    // Check relay connectivity
    if (status.relays.connected === 0) {
      suggestions.push({
        id: 'no-relays',
        severity: 'error',
        title: 'No Relays Connected',
        description: 'Cannot sync without at least one connected relay.',
        action: 'Check your internet connection. Go to Settings > Configure Relays to test relay connectivity.',
        category: 'relay'
      })
    } else if (status.relays.connected < status.relays.total / 2) {
      suggestions.push({
        id: 'few-relays',
        severity: 'warning',
        title: 'Limited Relay Connectivity',
        description: `Only ${status.relays.connected} of ${status.relays.total} relays are connected.`,
        action: 'Some relays may be temporarily unavailable. Consider adding more relays for better redundancy.',
        category: 'relay'
      })
    }

    // Check for failed relays
    const failedRelays = status.relays.connections.filter(
      c => c.state === CONNECTION_STATES.ERROR || c.error
    )
    if (failedRelays.length > 0) {
      suggestions.push({
        id: 'failed-relays',
        severity: 'warning',
        title: 'Some Relays Have Errors',
        description: `${failedRelays.length} relay(s) have connection errors.`,
        action: 'Go to Settings > Configure Relays to see which relays are failing and test them.',
        category: 'relay',
        details: failedRelays.map(r => ({ url: r.url, error: r.error }))
      })
    }

    // Check subscriptions
    if (status.subscriptions.active === 0) {
      suggestions.push({
        id: 'no-subscriptions',
        severity: 'warning',
        title: 'No Active Subscriptions',
        description: 'No subscriptions are active, which means you won\'t receive updates from other devices.',
        action: 'This usually resolves automatically. If it persists, try disconnecting and reconnecting.',
        category: 'subscription'
      })
    }

    // Check pending updates
    if (status.pendingUpdates > 10) {
      suggestions.push({
        id: 'many-pending',
        severity: 'warning',
        title: 'Many Pending Updates',
        description: `${status.pendingUpdates} updates are waiting to be synced.`,
        action: 'Try clicking "Sync Now" in Settings. If updates continue to build up, there may be a connection issue.',
        category: 'sync'
      })
    }

    // Check queued events
    if (status.queuedEvents > 0) {
      suggestions.push({
        id: 'queued-events',
        severity: 'warning',
        title: 'Events Queued',
        description: `${status.queuedEvents} event(s) are queued waiting for relay connection.`,
        action: 'These will be sent automatically when relay connections are established.',
        category: 'sync'
      })
    }

    // Check recent errors in history
    const recentErrors = this.getSyncHistory({ type: 'error', limit: 5 })
    if (recentErrors.length > 0) {
      const uniqueErrors = [...new Set(recentErrors.map(e => e.error))]
      suggestions.push({
        id: 'recent-errors',
        severity: 'info',
        title: 'Recent Sync Errors',
        description: `${recentErrors.length} error(s) occurred recently.`,
        action: 'Check the sync history for details. Common issues include network problems or relay unavailability.',
        category: 'history',
        details: uniqueErrors.slice(0, 3)
      })
    }

    // If everything looks good
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'all-good',
        severity: 'success',
        title: 'Everything Looks Good',
        description: 'No issues detected with your Nostr sync setup.',
        action: null,
        category: 'status'
      })
    }

    return suggestions
  }

  // ========================================================================
  // Export Diagnostics
  // ========================================================================

  /**
   * Export complete diagnostic report
   * @param {Object} options - Export options
   * @returns {Promise<Object>}
   */
  async exportDiagnostics(options = {}) {
    const includeHistory = options.includeHistory !== false
    const includeLogs = options.includeLogs !== false

    // Run fresh diagnostics
    const diagnosticResults = await this.runAllDiagnostics()

    // Get keypair info (sanitized)
    const keypairInfo = await this.getKeypairFingerprint()

    // Get relay status
    const relayStatus = this.getRelayStatus()

    // Build export object
    const exportData = {
      exportedAt: new Date().toISOString(),
      version: '1.0',
      app: 'Hypermark',

      // System info (browser-safe)
      system: {
        userAgent: navigator.userAgent,
        language: navigator.language,
        online: navigator.onLine,
        platform: navigator.platform
      },

      // Diagnostic results
      diagnostics: {
        results: diagnosticResults.map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          message: r.message,
          duration: r.duration
        })),
        summary: {
          total: diagnosticResults.length,
          passed: diagnosticResults.filter(r => r.status === 'pass').length,
          warnings: diagnosticResults.filter(r => r.status === 'warn').length,
          failed: diagnosticResults.filter(r => r.status === 'fail').length
        }
      },

      // Keypair fingerprint (not full key)
      keypair: {
        available: keypairInfo.available,
        fingerprint: keypairInfo.fingerprint
      },

      // Relay status
      relays: relayStatus.available ? {
        total: relayStatus.relays?.total,
        connected: relayStatus.relays?.connected,
        connections: relayStatus.relays?.connections?.map(c => ({
          url: c.url,
          state: c.state,
          error: c.error
        }))
      } : { error: relayStatus.message },

      // Troubleshooting suggestions
      suggestions: await this.getTroubleshootingSuggestions()
    }

    // Optionally include history
    if (includeHistory) {
      exportData.syncHistory = {
        recentEntries: this.getSyncHistory({ limit: 50 }),
        totalEntries: this.syncHistory.length,
        errorCount: this.syncHistory.filter(e => e.type === 'error').length
      }
    }

    // Optionally include diagnostic logs
    if (includeLogs) {
      exportData.diagnosticLogs = this.diagnosticLogs.slice(-10)
    }

    return exportData
  }

  /**
   * Export diagnostics as downloadable JSON file
   * @param {Object} options - Export options
   */
  async downloadDiagnostics(options = {}) {
    const data = await this.exportDiagnostics(options)
    const json = JSON.stringify(data, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `hypermark-diagnostics-${new Date().toISOString().split('T')[0]}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  /**
   * Clear all diagnostic data
   */
  clearAll() {
    this.syncHistory = []
    this.diagnosticLogs = []
    saveSyncHistory([])
    saveDiagnosticLogs([])
    this._notify()
  }
}

// ========================================================================
// Singleton Instance
// ========================================================================

let diagnosticsInstance = null

/**
 * Get the singleton diagnostics service instance
 * @returns {NostrDiagnosticsService}
 */
export function getNostrDiagnostics() {
  if (!diagnosticsInstance) {
    diagnosticsInstance = new NostrDiagnosticsService()
  }
  return diagnosticsInstance
}

/**
 * Record a sync event (convenience function)
 */
export function recordSyncEvent(entry) {
  getNostrDiagnostics().recordSyncEvent(entry)
}

export default NostrDiagnosticsService
