/**
 * useBookmarkSelection Hook
 *
 * Manages multi-select state and bulk operations for bookmarks.
 * Extracted from BookmarkList.jsx for separation of concerns.
 */

import { useState, useCallback } from 'react'

/**
 * @param {Array} filteredBookmarks - Currently visible bookmarks
 * @param {Object} options
 * @param {number} options.selectedIndex - Current keyboard-nav index
 * @param {Function} options.setSelectedIndex - Setter for selectedIndex
 * @returns {Object} Selection state and methods
 */
export function useBookmarkSelection(filteredBookmarks, { selectedIndex, setSelectedIndex }) {
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        setSelectedIds(new Set())
      }
      return !prev
    })
  }, [])

  const toggleSelectBookmark = useCallback((id, initiateSelection = false) => {
    if (initiateSelection && !selectionMode) {
      setSelectionMode(true)
      setSelectedIds(new Set([id]))
      return
    }

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        if (next.size === 0) {
          setSelectionMode(false)
        }
      } else {
        next.add(id)
      }
      return next
    })
  }, [selectionMode])

  const toggleSelectCurrent = useCallback(() => {
    if (!selectionMode) return
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const bookmark = filteredBookmarks[selectedIndex]
      toggleSelectBookmark(bookmark._id)
    }
  }, [selectionMode, selectedIndex, filteredBookmarks, toggleSelectBookmark])

  const selectAllBookmarks = useCallback(() => {
    if (!selectionMode) {
      setSelectionMode(true)
    }
    setSelectedIds(new Set(filteredBookmarks.map(b => b._id)))
  }, [selectionMode, filteredBookmarks])

  const selectNextWithShift = useCallback(() => {
    if (filteredBookmarks.length === 0) return

    if (!selectionMode) {
      setSelectionMode(true)
    }

    // Select current item before moving
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const currentBookmark = filteredBookmarks[selectedIndex]
      setSelectedIds(prev => new Set(prev).add(currentBookmark._id))
    }

    // Move to next and select it
    setSelectedIndex(prev => {
      const maxIndex = filteredBookmarks.length - 1
      const nextIndex = prev < maxIndex ? prev + 1 : prev
      if (nextIndex >= 0 && nextIndex < filteredBookmarks.length) {
        const nextBookmark = filteredBookmarks[nextIndex]
        setSelectedIds(p => new Set(p).add(nextBookmark._id))
      }
      return nextIndex
    })
  }, [selectionMode, selectedIndex, filteredBookmarks, setSelectedIndex])

  const selectPrevWithShift = useCallback(() => {
    if (filteredBookmarks.length === 0) return

    if (!selectionMode) {
      setSelectionMode(true)
    }

    // Select current item before moving
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const currentBookmark = filteredBookmarks[selectedIndex]
      setSelectedIds(prev => new Set(prev).add(currentBookmark._id))
    }

    // Move to prev and select it
    setSelectedIndex(prev => {
      const prevIndex = prev > 0 ? prev - 1 : 0
      if (prevIndex >= 0 && prevIndex < filteredBookmarks.length) {
        const prevBookmark = filteredBookmarks[prevIndex]
        setSelectedIds(p => new Set(p).add(prevBookmark._id))
      }
      return prevIndex
    })
  }, [selectionMode, selectedIndex, filteredBookmarks, setSelectedIndex])

  return {
    selectionMode,
    selectedIds,
    exitSelectionMode,
    toggleSelectionMode,
    toggleSelectBookmark,
    toggleSelectCurrent,
    selectAllBookmarks,
    selectNextWithShift,
    selectPrevWithShift,
  }
}
