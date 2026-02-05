/**
 * Content Suggestion Service
 * Fetches metadata suggestions (title, description, tags) for a URL
 * via the Hypermark server's /api/suggest endpoint.
 *
 * Privacy: opt-in only, stateless, no cookies/auth, sends only the URL.
 * Users can self-host or disable entirely.
 */

const STORAGE_KEY_ENABLED = 'hypermark_suggestions_enabled'
const STORAGE_KEY_URL = 'hypermark_suggestions_url'
const STORAGE_KEY_SIGNALING_URL = 'hypermark_signaling_url'
const REQUEST_TIMEOUT = 15000

/**
 * Get the suggestion service base URL
 * Priority: user-configured > env var > derive from signaling URL > null
 */
export function getSuggestionServiceUrl() {
  const custom = localStorage.getItem(STORAGE_KEY_URL)
  if (custom) return custom

  const envUrl = import.meta.env.VITE_SUGGESTION_URL
  if (envUrl) return envUrl

  // Derive from signaling URL (same server)
  const signalingUrl = getSignalingServiceUrl()
  if (signalingUrl) {
    try {
      const parsed = new URL(signalingUrl.replace('wss://', 'https://').replace('ws://', 'http://'))
      return parsed.origin
    } catch {
      // fall through
    }
  }

  return null
}

/**
 * Get the signaling service URL (user-configured or env default)
 */
export function getSignalingServiceUrl() {
  const custom = localStorage.getItem(STORAGE_KEY_SIGNALING_URL)
  if (custom) return custom
  return import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
}

/**
 * Set a custom signaling service URL
 * @param {string|null} url - Custom URL or null to reset to default
 */
export function setSignalingServiceUrl(url) {
  if (url) {
    localStorage.setItem(STORAGE_KEY_SIGNALING_URL, url)
  } else {
    localStorage.removeItem(STORAGE_KEY_SIGNALING_URL)
  }
}

/**
 * Set a custom suggestion service URL
 * @param {string|null} url - Custom URL or null to reset to default
 */
export function setSuggestionServiceUrl(url) {
  if (url) {
    localStorage.setItem(STORAGE_KEY_URL, url)
  } else {
    localStorage.removeItem(STORAGE_KEY_URL)
  }
}

/**
 * Check if content suggestions are enabled
 */
export function isSuggestionsEnabled() {
  return localStorage.getItem(STORAGE_KEY_ENABLED) === 'true'
}

/**
 * Enable or disable content suggestions
 */
export function setSuggestionsEnabled(enabled) {
  localStorage.setItem(STORAGE_KEY_ENABLED, enabled ? 'true' : 'false')
}

/**
 * Fetch content suggestions for a URL
 * @param {string} url - The bookmark URL to analyze
 * @returns {Promise<{title: string, description: string, suggestedTags: string[], favicon: string|null}>}
 * @throws {Error} if suggestions are disabled or service is unavailable
 */
export async function fetchSuggestions(url) {
  if (!isSuggestionsEnabled()) {
    throw new Error('Content suggestions are disabled')
  }

  const serviceUrl = getSuggestionServiceUrl()
  if (!serviceUrl) {
    throw new Error('No suggestion service configured')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

  try {
    const response = await fetch(`${serviceUrl}/api/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: controller.signal,
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Unknown error' }))
      throw new Error(err.error || `HTTP ${response.status}`)
    }

    return await response.json()
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Test connectivity to the suggestion service
 * @param {string} url - Service base URL to test
 * @returns {Promise<{ok: boolean, latency: number, error?: string}>}
 */
export async function testSuggestionService(url) {
  const start = Date.now()
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(`${url}/api/health`, {
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { ok: false, latency: Date.now() - start, error: `HTTP ${response.status}` }
    }

    const data = await response.json()
    return { ok: data.status === 'ok', latency: Date.now() - start }
  } catch (err) {
    return { ok: false, latency: Date.now() - start, error: err.message }
  }
}
