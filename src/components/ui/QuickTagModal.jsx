import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { Hash, Check, Plus } from './Icons'
import { getAllTags, updateBookmark, bulkAddTags } from '../../services/bookmarks'
import { cn } from '@/utils/cn'

/**
 * Linear-style tag selector modal
 * - Shows bookmark title at top
 * - Search/filter input
 * - List of tags with checkboxes for selected
 * - Keyboard navigation: Ctrl+j/k or arrows, Space to toggle, 1-9 for quick select
 */
export function QuickTagModal({ isOpen, onClose, bookmark, bookmarkIds }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [localTags, setLocalTags] = useState([])
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const isBulkMode = !bookmark && Array.isArray(bookmarkIds) && bookmarkIds.length > 0

  const allTags = getAllTags()

  // Sync local tags when modal opens or bookmark changes
  useEffect(() => {
    if (isOpen) {
      if (isBulkMode) {
        setLocalTags([])
      } else if (bookmark) {
        setLocalTags(bookmark.tags || [])
      }
    }
  }, [isOpen, bookmark?._id, isBulkMode])

  // Filter tags based on search, and include "create new" option
  const filteredOptions = useMemo(() => {
    const query = searchQuery.toLowerCase().trim()

    // Combine store tags with any new tags in localTags
    const allAvailableTags = [...new Set([...allTags, ...localTags])]

    // Filter tags that match the query
    const matchingTags = allAvailableTags
      .filter(tag => !query || tag.toLowerCase().includes(query))
      .map(tag => ({
        type: 'existing',
        value: tag,
        isSelected: localTags.includes(tag),
      }))

    // Add "create new" option if query doesn't match any available tag exactly
    const exactMatch = allAvailableTags.some(tag => tag.toLowerCase() === query)
    if (query && !exactMatch) {
      matchingTags.push({
        type: 'create',
        value: query,
        isSelected: false,
      })
    }

    return matchingTags
  }, [allTags, localTags, searchQuery])

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Keep selected index in bounds
  useEffect(() => {
    if (selectedIndex >= filteredOptions.length) {
      setSelectedIndex(Math.max(0, filteredOptions.length - 1))
    }
  }, [filteredOptions.length, selectedIndex])

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current && filteredOptions.length > 0) {
      const selectedItem = listRef.current.children[selectedIndex]
      selectedItem?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, filteredOptions.length])

  const toggleTag = useCallback((tagValue) => {
    const normalizedTag = tagValue.toLowerCase()
    setLocalTags(prev =>
      prev.includes(normalizedTag)
        ? prev.filter(t => t !== normalizedTag)
        : [...prev, normalizedTag]
    )
  }, [])

  const saveAndClose = useCallback(() => {
    if (isBulkMode) {
      if (localTags.length > 0) {
        bulkAddTags(bookmarkIds, localTags)
      }
      onClose()
      return
    }
    if (!bookmark?._id) return
    try {
      updateBookmark(bookmark._id, { tags: localTags })
    } catch (error) {
      console.error('Failed to update tags:', error)
    }
    onClose()
  }, [isBulkMode, bookmarkIds, bookmark?._id, localTags, onClose])

  const handleKeyDown = useCallback((e) => {
    const isModified = e.ctrlKey || e.metaKey

    // Ctrl+j / Ctrl+k or Arrow keys for navigation
    if (e.key === 'ArrowDown' || (isModified && e.key === 'j')) {
      e.preventDefault()
      setSelectedIndex(prev =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      )
      return
    }

    if (e.key === 'ArrowUp' || (isModified && e.key === 'k')) {
      e.preventDefault()
      setSelectedIndex(prev =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      )
      return
    }

    // Space to toggle selected tag
    if (e.key === ' ') {
      e.preventDefault()
      if (filteredOptions[selectedIndex]) {
        toggleTag(filteredOptions[selectedIndex].value)
      }
      return
    }

    // Enter to save and close (also adds the tag if "Create" option is selected)
    if (e.key === 'Enter') {
      e.preventDefault()
      const selectedOption = filteredOptions[selectedIndex]
      if (selectedOption?.type === 'create') {
        const newTags = [...localTags, selectedOption.value.toLowerCase()]
        if (isBulkMode) {
          bulkAddTags(bookmarkIds, newTags)
          onClose()
        } else {
          setLocalTags(newTags)
          if (bookmark?._id) {
            try {
              updateBookmark(bookmark._id, { tags: newTags })
            } catch (error) {
              console.error('Failed to update tags:', error)
            }
          }
          onClose()
        }
      } else {
        saveAndClose()
      }
      return
    }

    // Escape to close without saving
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }

    // Number keys 1-9 for quick toggle
    if (e.key >= '1' && e.key <= '9' && !isModified) {
      const index = parseInt(e.key) - 1
      if (index < filteredOptions.length) {
        e.preventDefault()
        toggleTag(filteredOptions[index].value)
      }
    }
  }, [filteredOptions, selectedIndex, toggleTag, saveAndClose, onClose])

  if (!isOpen || (!bookmark && !isBulkMode)) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        className="relative w-full max-w-md mx-4 bg-popover border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Header - Bookmark title */}
        <div className="px-3 py-2 border-b border-border bg-muted/30">
          <span className="text-sm text-muted-foreground truncate block">
            {isBulkMode ? `Tag ${bookmarkIds.length} bookmarks` : bookmark.title}
          </span>
        </div>

        {/* Search input */}
        <div className="p-2 border-b border-border">
          <input
            ref={inputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Change tags..."
            className="w-full bg-transparent text-foreground placeholder:text-muted-foreground text-sm outline-none"
            autoComplete="off"
          />
        </div>

        {/* Options list */}
        <div
          ref={listRef}
          className="max-h-80 overflow-y-auto py-1"
        >
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              No tags found
            </div>
          ) : (
            filteredOptions.map((option, index) => (
              <div
                key={option.type === 'create' ? `create-${option.value}` : option.value}
                onClick={() => toggleTag(option.value)}
                onMouseEnter={() => setSelectedIndex(index)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors',
                  index === selectedIndex
                    ? 'bg-accent'
                    : 'hover:bg-accent/50'
                )}
              >
                {/* Checkbox */}
                <div className={cn(
                  'w-4 h-4 rounded border flex items-center justify-center flex-shrink-0',
                  option.isSelected
                    ? 'bg-primary border-primary'
                    : 'border-muted-foreground/40'
                )}>
                  {option.isSelected && (
                    <Check className="w-3 h-3 text-primary-foreground" strokeWidth={3} />
                  )}
                </div>

                {/* Icon */}
                <div className="w-5 h-5 flex items-center justify-center text-muted-foreground">
                  {option.type === 'create' ? (
                    <Plus className="w-4 h-4" />
                  ) : (
                    <Hash className="w-4 h-4" />
                  )}
                </div>

                {/* Label */}
                <span className="flex-1 text-sm text-foreground truncate">
                  {option.type === 'create' ? (
                    <>Create "<span className="text-muted-foreground">{option.value}</span>"</>
                  ) : (
                    option.value
                  )}
                </span>

                {/* Number key hint (1-9) */}
                {index < 9 && (
                  <kbd className="min-w-[1.5rem] h-6 px-1.5 flex items-center justify-center text-xs text-muted-foreground bg-muted border border-border rounded">
                    {index + 1}
                  </kbd>
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer hints */}
        <div className="px-3 py-2 border-t border-border bg-muted/30 flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[10px]">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[10px]">Space</kbd>
            toggle
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[10px]">Enter</kbd>
            save
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-muted border border-border rounded text-[10px]">Esc</kbd>
            discard
          </span>
        </div>
      </div>
    </div>
  )
}
