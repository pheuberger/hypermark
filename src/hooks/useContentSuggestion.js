/**
 * React hook for content suggestions
 * Provides loading state, suggestions data, and suggest action
 */

import { useState, useCallback, useRef, useEffect } from 'react'
import { fetchSuggestions, isSuggestionsEnabled } from '../services/content-suggestion'

/**
 * @returns {{
 *   suggestions: {title: string, description: string, suggestedTags: string[], favicon: string|null} | null,
 *   loading: boolean,
 *   error: string | null,
 *   suggest: (url: string) => Promise<void>,
 *   clear: () => void,
 *   cancel: () => void,
 *   enabled: boolean,
 * }}
 */
export function useContentSuggestion() {
  const [suggestions, setSuggestions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [enabled, setEnabled] = useState(() => isSuggestionsEnabled())
  const abortRef = useRef(null)

  // Re-check enabled state when localStorage changes (e.g., from settings)
  useEffect(() => {
    const handleStorage = (e) => {
      if (e.key === 'hypermark_suggestions_enabled') {
        setEnabled(isSuggestionsEnabled())
      }
    }
    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  // Also check on mount/focus in case changed in same tab
  useEffect(() => {
    const handleFocus = () => setEnabled(isSuggestionsEnabled())
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [])

  const cancel = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setLoading(false)
  }, [])

  const suggest = useCallback(async (url) => {
    if (!url || !isSuggestionsEnabled()) return

    // Cancel any in-flight request
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setError(null)
    setSuggestions(null)

    try {
      const result = await fetchSuggestions(url)

      // Check if we were aborted while waiting
      if (controller.signal.aborted) return

      setSuggestions(result)
    } catch (err) {
      if (controller.signal.aborted) return
      if (err.name !== 'AbortError') {
        console.error('[ContentSuggestion]', err.message)
        setError(err.message)
      }
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }, [])

  const clear = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    setSuggestions(null)
    setLoading(false)
    setError(null)
  }, [])

  return {
    suggestions,
    loading,
    error,
    suggest,
    clear,
    cancel,
    enabled,
  }
}
