import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { InboxItem } from './InboxItem'
import { updateBookmark, moveFromInbox } from '../../services/bookmarks'
import { Inbox as InboxIcon } from '../ui/Icons'

export const InboxView = forwardRef(function InboxView({ bookmarks }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const selectedItemRef = useRef(null)
  
  const focusModeActive = bookmarks.length > 0

  // Auto-select first item when bookmarks change
  useEffect(() => {
    if (bookmarks.length > 0 && selectedIndex >= bookmarks.length) {
      setSelectedIndex(Math.max(0, bookmarks.length - 1))
    }
  }, [bookmarks.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (selectedIndex >= 0 && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  const handleFieldChange = useCallback((bookmarkId, field, value) => {
    try {
      updateBookmark(bookmarkId, { [field]: value })
    } catch (error) {
      console.error('[InboxView] Failed to update bookmark:', error)
    }
  }, [])

  const handleDone = useCallback((bookmarkId) => {
    try {
      moveFromInbox(bookmarkId)
      // Auto-advance happens via useEffect when bookmarks.length changes
    } catch (error) {
      console.error('[InboxView] Failed to move from inbox:', error)
    }
  }, [])

  const selectNext = useCallback(() => {
    setSelectedIndex((prev) => {
      const maxIndex = bookmarks.length - 1
      if (maxIndex < 0) return -1
      return prev < maxIndex ? prev + 1 : prev
    })
  }, [bookmarks.length])

  const selectPrev = useCallback(() => {
    setSelectedIndex((prev) => {
      if (prev <= 0) return 0
      return prev - 1
    })
  }, [])

  const handleEnter = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < bookmarks.length) {
      const bookmark = bookmarks[selectedIndex]
      handleDone(bookmark._id)
    }
  }, [selectedIndex, bookmarks, handleDone])

  useImperativeHandle(ref, () => ({
    selectNext,
    selectPrev,
    handleEnter,
  }), [selectNext, selectPrev, handleEnter])

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 opacity-50">
        <InboxIcon className="w-12 h-12 mb-4 stroke-1" />
        <p className="text-sm font-medium">Inbox empty</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Paste a URL anywhere to add it here
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {/* Header with count and hint */}
      <div className="flex items-center justify-between px-1 py-2">
        <span className="text-sm font-medium text-muted-foreground">
          {bookmarks.length} item{bookmarks.length !== 1 ? 's' : ''} to triage
        </span>
        <span className="text-xs text-muted-foreground">
          <kbd className="px-1 py-0.5 rounded bg-secondary text-secondary-foreground font-mono text-[10px]">j</kbd>
          <kbd className="px-1 py-0.5 rounded bg-secondary text-secondary-foreground font-mono text-[10px] ml-0.5">k</kbd>
          {' '}navigate • 
          <kbd className="px-1 py-0.5 rounded bg-secondary text-secondary-foreground font-mono text-[10px] ml-1">Enter</kbd>
          {' '}done • 
          <kbd className="px-1 py-0.5 rounded bg-secondary text-secondary-foreground font-mono text-[10px] ml-1">q</kbd>
          {' '}exit
        </span>
      </div>

      {/* Inbox items */}
      {bookmarks.map((bookmark, index) => (
        <InboxItem
          key={bookmark._id}
          ref={index === selectedIndex ? selectedItemRef : null}
          bookmark={bookmark}
          isSelected={index === selectedIndex}
          isFocusMode={focusModeActive}
          onDone={() => handleDone(bookmark._id)}
          onFieldChange={(field, value) => handleFieldChange(bookmark._id, field, value)}
        />
      ))}
    </div>
  )
})
