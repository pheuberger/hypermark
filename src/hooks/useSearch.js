import { useState, useEffect, useMemo, useCallback } from 'preact/hooks'
import { buildSearchIndex, searchBookmarks } from '../services/search-index'

/**
 * Hook for searching bookmarks with MiniSearch
 * @param {Array} bookmarks - Array of all bookmarks
 * @param {string} query - Search query
 * @returns {Array} - Filtered array of bookmarks matching search
 */
export function useSearch(bookmarks, query) {
  const [searchIndex, setSearchIndex] = useState(null)

  // Build search index when bookmarks change
  useEffect(() => {
    if (!bookmarks || bookmarks.length === 0) {
      setSearchIndex(null)
      return
    }

    try {
      const index = buildSearchIndex(bookmarks)
      setSearchIndex(index)
    } catch (error) {
      console.error('Failed to build search index:', error)
      setSearchIndex(null)
    }
  }, [bookmarks])

  // Perform search
  const results = useMemo(() => {
    // If no query, return all bookmarks
    if (!query || !query.trim()) {
      return bookmarks
    }

    // If no search index yet, return empty
    if (!searchIndex) {
      return []
    }

    try {
      // Get search results (IDs with scores)
      const searchResults = searchBookmarks(searchIndex, query)

      // Map IDs back to full bookmark objects
      const resultIds = new Set(searchResults.map((r) => r.id))
      const filtered = bookmarks.filter((bookmark) =>
        resultIds.has(bookmark._id)
      )

      // Sort by search relevance score
      const scoreMap = new Map(
        searchResults.map((r) => [r.id, r.score])
      )
      filtered.sort((a, b) => {
        const scoreA = scoreMap.get(a._id) || 0
        const scoreB = scoreMap.get(b._id) || 0
        return scoreB - scoreA
      })

      return filtered
    } catch (error) {
      console.error('Search error:', error)
      return []
    }
  }, [bookmarks, query, searchIndex])

  return results
}

/**
 * Hook for debounced search query
 * @param {string} value - Input value
 * @param {number} delay - Debounce delay in ms (default 300)
 * @returns {string} - Debounced value
 */
export function useDebounce(value, delay = 300) {
  const [debouncedValue, setDebouncedValue] = useState(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}
