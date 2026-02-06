/**
 * Relay URL validation and connectivity testing utilities.
 *
 * Pure functions with no React dependency. Extracted from
 * RelayConfigurationView.jsx for reuse and testability.
 */

// Relay configuration storage keys
export const STORAGE_KEY_CUSTOM_RELAYS = 'hypermark_custom_relays'
export const STORAGE_KEY_SYNC_ENABLED = 'hypermark_sync_enabled'

/**
 * Validate a Nostr relay URL
 * @param {string} url - URL to validate
 * @returns {{ valid: boolean, error: string|null }}
 */
export function validateRelayUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL is required' }
  }

  const trimmed = url.trim()

  // Check for websocket protocol
  if (!trimmed.startsWith('wss://') && !trimmed.startsWith('ws://')) {
    return { valid: false, error: 'URL must start with wss:// or ws://' }
  }

  // Warn about insecure connections
  if (trimmed.startsWith('ws://')) {
    return { valid: true, error: 'Warning: ws:// is not secure. Consider using wss://' }
  }

  try {
    const parsed = new URL(trimmed)
    if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
      return { valid: false, error: 'Invalid WebSocket URL' }
    }
    return { valid: true, error: null }
  } catch {
    return { valid: false, error: 'Invalid URL format' }
  }
}

/**
 * Test relay connectivity and measure response time
 * @param {string} relayUrl - Relay URL to test
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<{ success: boolean, latency: number|null, error: string|null }>}
 */
export async function testRelayConnection(relayUrl, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    let ws = null
    let resolved = false

    const cleanup = () => {
      if (ws) {
        ws.onopen = null
        ws.onerror = null
        ws.onclose = null
        if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
          ws.close()
        }
      }
    }

    const finish = (result) => {
      if (!resolved) {
        resolved = true
        cleanup()
        resolve(result)
      }
    }

    const timeoutId = setTimeout(() => {
      finish({ success: false, latency: null, error: 'Connection timed out' })
    }, timeout)

    try {
      ws = new WebSocket(relayUrl)

      ws.onopen = () => {
        clearTimeout(timeoutId)
        const latency = Date.now() - startTime
        finish({ success: true, latency, error: null })
      }

      ws.onerror = () => {
        clearTimeout(timeoutId)
        finish({ success: false, latency: null, error: 'Connection failed' })
      }

      ws.onclose = (event) => {
        if (!resolved) {
          clearTimeout(timeoutId)
          finish({ success: false, latency: null, error: `Connection closed (${event.code})` })
        }
      }
    } catch (error) {
      clearTimeout(timeoutId)
      finish({ success: false, latency: null, error: error.message })
    }
  })
}

/**
 * Load custom relays from localStorage
 */
export function loadCustomRelays() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_CUSTOM_RELAYS)
    return stored ? JSON.parse(stored) : []
  } catch {
    return []
  }
}

/**
 * Save custom relays to localStorage
 */
export function saveCustomRelays(relays) {
  try {
    localStorage.setItem(STORAGE_KEY_CUSTOM_RELAYS, JSON.stringify(relays))
  } catch (error) {
    console.error('Failed to save custom relays:', error)
  }
}

/**
 * Load sync enabled preference
 */
export function loadSyncEnabled() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_SYNC_ENABLED)
    return stored === null ? true : stored === 'true'
  } catch {
    return true
  }
}

/**
 * Save sync enabled preference
 */
export function saveSyncEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY_SYNC_ENABLED, String(enabled))
  } catch (error) {
    console.error('Failed to save sync enabled:', error)
  }
}
