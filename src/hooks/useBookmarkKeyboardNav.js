/**
 * useBookmarkKeyboardNav Hook
 *
 * Manages keyboard navigation state (j/k, hover, scroll-into-view).
 * Extracted from BookmarkList.jsx for separation of concerns.
 */

import { useState, useCallback, useEffect, useRef } from 'react'

/**
 * @param {Array} filteredBookmarks - Currently visible bookmarks
 * @param {Object} options
 * @param {string} options.filterView - Current filter view
 * @param {string|null} options.selectedTag - Currently selected tag
 * @param {string} options.debouncedSearchQuery - Debounced search string
 * @returns {Object} Navigation state and methods
 */
export function useBookmarkKeyboardNav(filteredBookmarks, {
  filterView,
  selectedTag,
  debouncedSearchQuery,
}) {
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [keyboardNavActive, setKeyboardNavActive] = useState(false)
  const selectedItemRef = useRef(null)
  const ignoreHoverRef = useRef(false)

  const selectNext = useCallback(() => {
    setKeyboardNavActive(true)
    setSelectedIndex((prev) => {
      const maxIndex = filteredBookmarks.length - 1
      if (maxIndex < 0) return -1
      if (prev === -1) {
        return hoveredIndex >= 0 ? hoveredIndex : 0
      }
      return prev < maxIndex ? prev + 1 : prev
    })
  }, [filteredBookmarks.length, hoveredIndex])

  const selectPrev = useCallback(() => {
    setKeyboardNavActive(true)
    setSelectedIndex((prev) => {
      const maxIndex = filteredBookmarks.length - 1
      if (maxIndex < 0) return -1
      if (prev === -1) {
        return hoveredIndex >= 0 ? hoveredIndex : maxIndex
      }
      if (prev <= 0) return 0
      return prev - 1
    })
  }, [filteredBookmarks.length, hoveredIndex])

  const goToTop = useCallback(() => {
    if (filteredBookmarks.length > 0) {
      setKeyboardNavActive(true)
      setSelectedIndex(0)
    }
  }, [filteredBookmarks.length])

  const goToBottom = useCallback(() => {
    if (filteredBookmarks.length > 0) {
      setKeyboardNavActive(true)
      setSelectedIndex(filteredBookmarks.length - 1)
    }
  }, [filteredBookmarks.length])

  const handleBookmarkHover = useCallback((index) => {
    if (ignoreHoverRef.current) return

    if (keyboardNavActive) {
      setKeyboardNavActive(false)
      setSelectedIndex(-1)
    }
    setHoveredIndex(index)
  }, [keyboardNavActive])

  // Temporarily ignore hover events (used after modal closes)
  const suppressHoverBriefly = useCallback(() => {
    ignoreHoverRef.current = true
    setTimeout(() => {
      ignoreHoverRef.current = false
    }, 100)
  }, [])

  const getSelectedBookmark = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      return filteredBookmarks[selectedIndex]
    }
    return null
  }, [selectedIndex, filteredBookmarks])

  // Reset selection on filter/search change
  useEffect(() => {
    setSelectedIndex(-1)
    setHoveredIndex(-1)
  }, [filteredBookmarks.length, filterView, selectedTag, debouncedSearchQuery])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  return {
    selectedIndex,
    setSelectedIndex,
    hoveredIndex,
    keyboardNavActive,
    selectedItemRef,
    selectNext,
    selectPrev,
    goToTop,
    goToBottom,
    handleBookmarkHover,
    suppressHoverBriefly,
    getSelectedBookmark,
  }
}
