/**
 * Reset Service
 *
 * Provides functionality to completely reset the application state,
 * clearing all local data including IndexedDB, localStorage, and
 * disconnecting sync providers.
 *
 * WARNING: This is a destructive operation that cannot be undone.
 */

import { clearAllKeys } from './key-storage'
import { clearDeviceData } from '../utils/device-id'
import { getNostrDiagnostics } from './nostr-diagnostics'

// IndexedDB database names
const INDEXEDDB_DATABASES = [
  'hypermark',      // Yjs document persistence (bookmarks, devices, settings)
  'hypermark-keys', // Cryptographic keys (LEK, device keypair)
]

// localStorage keys used by the application
const LOCALSTORAGE_KEYS = [
  'hypermark:device-id',
  'hypermark:device-name',
  'hypermark_sync_history',
  'hypermark_diagnostic_logs',
]

/**
 * Delete an IndexedDB database
 * @param {string} dbName - Database name to delete
 * @returns {Promise<void>}
 */
function deleteDatabase(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(dbName)

    request.onsuccess = () => {
      console.log(`[Reset] Deleted IndexedDB database: ${dbName}`)
      resolve()
    }

    request.onerror = () => {
      console.error(`[Reset] Failed to delete database ${dbName}:`, request.error)
      reject(request.error)
    }

    request.onblocked = () => {
      console.warn(`[Reset] Database deletion blocked: ${dbName}. Close other tabs using this app.`)
      // Still resolve - the database will be deleted when other connections close
      resolve()
    }
  })
}

/**
 * Clear all localStorage keys used by the application
 */
function clearLocalStorage() {
  LOCALSTORAGE_KEYS.forEach(key => {
    try {
      localStorage.removeItem(key)
      console.log(`[Reset] Cleared localStorage key: ${key}`)
    } catch (error) {
      console.error(`[Reset] Failed to clear localStorage key ${key}:`, error)
    }
  })
}

/**
 * Get the current WebRTC provider and disconnect it
 */
async function disconnectWebRTC() {
  try {
    // Dynamic import to avoid circular dependencies
    const { getWebrtcProvider, disconnectYjsWebRTC } = await import('../hooks/useYjs')
    const provider = getWebrtcProvider()

    if (provider) {
      disconnectYjsWebRTC()
      console.log('[Reset] Disconnected WebRTC provider')
    }
  } catch (error) {
    console.error('[Reset] Failed to disconnect WebRTC:', error)
  }
}

/**
 * Stop the Nostr sync service
 */
async function stopNostrSync() {
  try {
    // Dynamic import to avoid circular dependencies
    const { getNostrSyncService } = await import('../hooks/useNostrSync')
    const service = getNostrSyncService()

    if (service) {
      service.destroy()
      console.log('[Reset] Stopped Nostr sync service')
    }
  } catch (error) {
    console.error('[Reset] Failed to stop Nostr sync:', error)
  }
}

/**
 * Clear diagnostic data
 */
function clearDiagnostics() {
  try {
    const diagnostics = getNostrDiagnostics()
    diagnostics.clearAll()
    console.log('[Reset] Cleared diagnostic data')
  } catch (error) {
    console.error('[Reset] Failed to clear diagnostics:', error)
  }
}

/**
 * Perform a complete reset of the application
 *
 * This will:
 * 1. Disconnect WebRTC provider
 * 2. Stop Nostr sync service
 * 3. Clear all IndexedDB databases
 * 4. Clear all localStorage keys
 * 5. Clear diagnostic data
 *
 * @param {Object} options - Reset options
 * @param {boolean} options.reloadAfter - Whether to reload the page after reset (default: true)
 * @param {Function} options.onProgress - Progress callback with { step, total, message }
 * @returns {Promise<{ success: boolean, errors: string[] }>}
 */
export async function performFullReset(options = {}) {
  const { reloadAfter = true, onProgress } = options
  const errors = []

  const steps = [
    { name: 'Disconnecting sync providers', fn: async () => {
      await disconnectWebRTC()
      await stopNostrSync()
    }},
    { name: 'Clearing cryptographic keys', fn: async () => {
      await clearAllKeys()
    }},
    { name: 'Deleting bookmark database', fn: async () => {
      await deleteDatabase('hypermark')
    }},
    { name: 'Deleting key database', fn: async () => {
      await deleteDatabase('hypermark-keys')
    }},
    { name: 'Clearing local storage', fn: async () => {
      clearLocalStorage()
      clearDeviceData()
    }},
    { name: 'Clearing diagnostics', fn: async () => {
      clearDiagnostics()
    }},
  ]

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i]

    if (onProgress) {
      onProgress({ step: i + 1, total: steps.length, message: step.name })
    }

    try {
      await step.fn()
      console.log(`[Reset] Completed step ${i + 1}/${steps.length}: ${step.name}`)
    } catch (error) {
      const errorMsg = `${step.name}: ${error.message}`
      errors.push(errorMsg)
      console.error(`[Reset] Error in step ${i + 1}:`, error)
    }
  }

  console.log('[Reset] Reset complete.', errors.length > 0 ? `Errors: ${errors.length}` : 'No errors.')

  if (reloadAfter) {
    // Small delay to ensure cleanup completes
    setTimeout(() => {
      window.location.reload()
    }, 500)
  }

  return { success: errors.length === 0, errors }
}

/**
 * Check if there is data to reset
 * @returns {Promise<{ hasData: boolean, details: Object }>}
 */
export async function checkResetableData() {
  const details = {
    hasLEK: false,
    hasBookmarks: false,
    hasDeviceId: false,
    bookmarkCount: 0,
  }

  try {
    // Check for LEK
    const { retrieveLEK } = await import('./key-storage')
    const lek = await retrieveLEK()
    details.hasLEK = !!lek
  } catch {
    // Ignore errors
  }

  try {
    // Check for bookmarks
    const { getYdocInstance } = await import('../hooks/useYjs')
    const ydoc = getYdocInstance()
    if (ydoc) {
      const bookmarks = ydoc.getMap('bookmarks')
      details.bookmarkCount = bookmarks.size
      details.hasBookmarks = bookmarks.size > 0
    }
  } catch {
    // Ignore errors
  }

  try {
    // Check for device ID
    details.hasDeviceId = !!localStorage.getItem('hypermark:device-id')
  } catch {
    // Ignore errors
  }

  const hasData = details.hasLEK || details.hasBookmarks || details.hasDeviceId

  return { hasData, details }
}
