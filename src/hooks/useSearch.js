import { useState, useEffect, useMemo } from 'react'
import { buildSearchIndex, searchBookmarks } from '../services/search-index'

export function useSearch(bookmarks, query) {
  const [searchIndex, setSearchIndex] = useState(null)

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

  const results = useMemo(() => {
    if (!query || !query.trim()) {
      return bookmarks
    }

    if (!searchIndex) {
      return []
    }

    try {
      const searchResults = searchBookmarks(searchIndex, query)
      const resultIds = new Set(searchResults.map((r) => r.id))
      const filtered = bookmarks.filter((bookmark) =>
        resultIds.has(bookmark._id)
      )

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
