/**
 * useBookmarkFilters Hook
 *
 * Manages bookmark filtering, sorting, and search state.
 * Extracted from BookmarkList.jsx for separation of concerns.
 */

import { useState, useMemo, useCallback } from 'react'
import { useSearch, useDebounce } from './useSearch'
import { toHash } from './useHashRouter'

/**
 * @param {Array} bookmarks - Raw bookmark array from Yjs
 * @param {Object} router - Router state: { filterView, selectedTag, navigate }
 * @returns {Object} Filter state and filtered bookmarks
 */
export function useBookmarkFilters(bookmarks, { filterView, selectedTag, navigate }) {
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')

  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const searchedBookmarks = useSearch(bookmarks, debouncedSearchQuery)

  const filteredBookmarks = useMemo(() => {
    let filtered = [...searchedBookmarks]

    if (filterView === 'read-later') {
      filtered = filtered.filter((b) => b.readLater)
    } else if (filterView === 'inbox') {
      filtered = filtered.filter((b) => b.inbox)
    } else if (filterView === 'tag' && selectedTag) {
      filtered = filtered.filter(
        (b) => Array.isArray(b.tags) && b.tags.includes(selectedTag)
      )
    }

    filtered.sort((a, b) => {
      if (sortBy === 'recent') {
        return b.createdAt - a.createdAt
      } else if (sortBy === 'oldest') {
        return a.createdAt - b.createdAt
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title)
      } else if (sortBy === 'updated') {
        return b.updatedAt - a.updatedAt
      }
      return 0
    })

    return filtered
  }, [searchedBookmarks, filterView, selectedTag, sortBy])

  const goToAllBookmarks = useCallback(() => {
    navigate('#/')
    setSearchQuery('')
  }, [navigate])

  const goToReadLater = useCallback(() => {
    navigate('#/read-later')
  }, [navigate])

  const goToInbox = useCallback(() => {
    navigate('#/inbox')
  }, [navigate])

  const handleFilterChange = useCallback((view) => {
    navigate(toHash('bookmarks', view, null))
  }, [navigate])

  const handleTagSelect = useCallback((tag) => {
    navigate(toHash('bookmarks', 'tag', tag))
  }, [navigate])

  const handleTagClick = useCallback((tag) => {
    navigate(toHash('bookmarks', 'tag', tag))
  }, [navigate])

  return {
    filterView,
    selectedTag,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    filteredBookmarks,
    goToAllBookmarks,
    goToReadLater,
    goToInbox,
    handleFilterChange,
    handleTagSelect,
    handleTagClick,
  }
}
