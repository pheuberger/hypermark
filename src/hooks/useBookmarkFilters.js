/**
 * useBookmarkFilters Hook
 *
 * Manages bookmark filtering, sorting, and search state.
 * Extracted from BookmarkList.jsx for separation of concerns.
 */

import { useState, useMemo, useCallback } from 'react'
import { useSearch, useDebounce } from './useSearch'

/**
 * @param {Array} bookmarks - Raw bookmark array from Yjs
 * @returns {Object} Filter state and filtered bookmarks
 */
export function useBookmarkFilters(bookmarks) {
  const [filterView, setFilterView] = useState('all')
  const [selectedTag, setSelectedTag] = useState(null)
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
    setFilterView('all')
    setSelectedTag(null)
    setSearchQuery('')
  }, [])

  const goToReadLater = useCallback(() => {
    setFilterView('read-later')
    setSelectedTag(null)
  }, [])

  const goToInbox = useCallback(() => {
    setFilterView('inbox')
    setSelectedTag(null)
  }, [])

  const handleFilterChange = useCallback((view) => {
    setFilterView(view)
    setSelectedTag(null)
  }, [])

  const handleTagSelect = useCallback((tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }, [])

  const handleTagClick = useCallback((tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }, [])

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
