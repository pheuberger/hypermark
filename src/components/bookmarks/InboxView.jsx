import { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react'
import { InboxItem } from './InboxItem'
import { updateBookmark, moveFromInbox, deleteBookmark } from '../../services/bookmarks'
import { Inbox as InboxIcon } from '../ui/Icons'

export const InboxView = forwardRef(function InboxView({ bookmarks }, ref) {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const selectedItemRef = useRef(null)
  
  const focusModeActive = bookmarks.length > 0

  // Auto-select first item when bookmarks change
  useEffect(() => {
    if (bookmarks.length > 0 && selectedIndex >= bookmarks.length) {
      setSelectedIndex(Math.max(0, bookmarks.length - 1))
    }
  }, [bookmarks.length, selectedIndex])

  useEffect(() => {
    setEditMode(false)
  }, [selectedIndex])

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
    } catch (error) {
      console.error('[InboxView] Failed to move from inbox:', error)
    }
  }, [])

  const handleDiscard = useCallback((bookmarkId) => {
    try {
      deleteBookmark(bookmarkId)
    } catch (error) {
      console.error('[InboxView] Failed to discard bookmark:', error)
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
      const maxIndex = bookmarks.length - 1
      if (maxIndex < 0) return -1
      if (prev === -1) return maxIndex
      if (prev === 0) return 0
      return prev - 1
    })
  }, [bookmarks.length])

  const handleEnter = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < bookmarks.length) {
      if (!editMode) {
        setEditMode(true)
      } else {
        const bookmark = bookmarks[selectedIndex]
        handleDone(bookmark._id)
      }
    }
  }, [selectedIndex, bookmarks, handleDone, editMode])

  const exitEditMode = useCallback(() => {
    setEditMode(false)
  }, [])

  useImperativeHandle(ref, () => ({
    selectNext,
    selectPrev,
    handleEnter,
    exitEditMode,
    isEditMode: () => editMode,
  }), [selectNext, selectPrev, handleEnter, exitEditMode, editMode])

  if (bookmarks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <div className="bg-muted/50 p-4 rounded-full mb-4">
           <InboxIcon className="w-8 h-8 opacity-50 stroke-1" />
        </div>
        <p className="text-sm font-medium text-foreground">All caught up</p>
        <p className="mt-1 text-xs opacity-70">
          Your inbox is empty.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header status */}
      <div className="flex items-center justify-between px-2">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          {bookmarks.length} {bookmarks.length === 1 ? 'Item' : 'Items'}
        </span>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1">
             <kbd className="min-w-[16px] text-center bg-muted border border-border rounded px-1 font-mono">j</kbd>
             <kbd className="min-w-[16px] text-center bg-muted border border-border rounded px-1 font-mono">k</kbd>
             <span>nav</span>
          </span>
          <span className="w-px h-3 bg-border" />
          <span className="flex items-center gap-1">
             <kbd className="bg-muted border border-border rounded px-1.5 font-mono">↵</kbd>
             <span>{editMode ? 'done' : 'edit'}</span>
          </span>
          {editMode && (
            <>
              <span className="w-px h-3 bg-border" />
              <span className="flex items-center gap-1">
                 <kbd className="bg-muted border border-border rounded px-1.5 font-mono">esc</kbd>
                 <span>nav</span>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Inbox items */}
      <div className="space-y-1">
        {bookmarks.map((bookmark, index) => (
          <InboxItem
            key={bookmark._id}
            ref={index === selectedIndex ? selectedItemRef : null}
            bookmark={bookmark}
            isSelected={index === selectedIndex}
            isFocusMode={focusModeActive}
            editMode={editMode && index === selectedIndex}
            onDone={() => handleDone(bookmark._id)}
            onDiscard={() => handleDiscard(bookmark._id)}
            onFieldChange={(field, value) => handleFieldChange(bookmark._id, field, value)}
            onEnterEditMode={() => setEditMode(true)}
            onExitEditMode={exitEditMode}
          />
        ))}
      </div>
    </div>
  )
})