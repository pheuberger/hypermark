/**
 * React hook for content suggestions
 * Provides loading state, suggestions data, and suggest action
 */

import { useState, useCallback, useRef } from 'react'
import { fetchSuggestions, isSuggestionsEnabled } from '../services/content-suggestion'

/**
 * @returns {{
 *   suggestions: {title: string, description: string, suggestedTags: string[], favicon: string|null} | null,
 *   loading: boolean,
 *   error: string | null,
 *   suggest: (url: string) => Promise<void>,
 *   clear: () => void,
 *   enabled: boolean,
 * }}
 */
export function useContentSuggestion() {
  const [suggestions, setSuggestions] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const abortRef = useRef(null)

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
    enabled: isSuggestionsEnabled(),
  }
}
