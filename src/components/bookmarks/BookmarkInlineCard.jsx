import { forwardRef, useRef, useEffect, useState, useCallback } from 'react'
import { ExternalLink, Check, X } from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { Tag } from '../ui/Tag'
import { SaveIndicator } from '../ui/SaveIndicator'
import { getAllTags, updateBookmark } from '../../services/bookmarks'
import { useHotkeys } from '../../hooks/useHotkeys'

/**
 * BookmarkInlineCard - Inline card for editing an existing bookmark
 * (expands in place in the list; new bookmarks go through AddBookmarkDialog)
 *
 * Features:
 * - Auto-save on blur
 * - Keyboard navigation (Tab between fields, Enter to confirm, Esc to close)
 */
export const BookmarkInlineCard = forwardRef(function BookmarkInlineCard(
  { bookmark, onDone, onDiscard, onFieldChange },
  ref
) {
  const titleInputRef = useRef(null)
  const descInputRef = useRef(null)
  const tagsInputRef = useRef(null)

  const [localTitle, setLocalTitle] = useState(bookmark?.title || '')
  const [localDesc, setLocalDesc] = useState(bookmark?.description || '')
  const [localTags, setLocalTags] = useState(bookmark?.tags || [])
  const [localReadLater, setLocalReadLater] = useState(bookmark?.readLater || false)
  const [allTags, setAllTags] = useState([])
  const [saveCount, setSaveCount] = useState(0)

  const url = bookmark?.url || ''

  // Extract domain from URL
  let domain = ''
  if (url) {
    try {
      domain = new URL(url).hostname.replace('www.', '')
    } catch {
      domain = ''
    }
  }

  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null

  // Load all tags for autocomplete
  useEffect(() => {
    try {
      setAllTags(getAllTags())
    } catch {
      setAllTags([])
    }
  }, [])

  // Sync from props when bookmark changes
  useEffect(() => {
    if (bookmark) {
      setLocalTitle(bookmark.title || '')
      setLocalDesc(bookmark.description || '')
      setLocalTags(bookmark.tags || [])
      setLocalReadLater(bookmark.readLater || false)
    }
  }, [bookmark])

  const saveChanges = useCallback((overrides = {}) => {
    const data = {
      title: localTitle.trim() || url,
      description: localDesc,
      tags: localTags,
      readLater: localReadLater,
      ...overrides,
    }

    try {
      updateBookmark(bookmark._id, data)
      onFieldChange?.(data)
      return true
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      return false
    }
  }, [localTitle, localDesc, localTags, localReadLater, url, bookmark, onFieldChange])

  const handleTitleBlur = () => {
    if (localTitle !== bookmark?.title) {
      if (saveChanges()) setSaveCount(c => c + 1)
    }
  }

  const handleDescBlur = () => {
    if (localDesc !== bookmark?.description) {
      if (saveChanges()) setSaveCount(c => c + 1)
    }
  }

  const handleTagsChange = (newTags) => {
    setLocalTags(newTags)
    if (saveChanges({ tags: newTags })) setSaveCount(c => c + 1)
  }

  const removeTag = (tagToRemove) => {
    const newTags = localTags.filter((t) => t !== tagToRemove)
    handleTagsChange(newTags)
  }

  const handleReadLaterChange = (checked) => {
    setLocalReadLater(checked)
    if (saveChanges({ readLater: checked })) setSaveCount(c => c + 1)
  }

  const handleDone = useCallback(() => {
    if (saveChanges()) {
      onDone?.()
    }
  }, [saveChanges, onDone])

  const handleDiscard = () => {
    onDiscard?.()
  }

  // Ctrl/Cmd+Enter to save from any field
  useHotkeys(
    { 'mod+enter': handleDone },
    { enableOnInputs: true }
  )

  const handleKeyDown = (e, currentField) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.target.blur()
      onDiscard?.()
      return
    }

    // Enter = save/confirm (Shift+Enter = newline in description)
    if (e.key === 'Enter') {
      if (e.shiftKey && currentField === 'desc') {
        return // Allow Shift+Enter for newlines in description
      }
      e.preventDefault()
      handleDone()
      return
    }

    // Tab navigation
    if (e.key === 'Tab') {
      e.preventDefault()
      const fields = ['title', 'desc', 'tags']

      const currentIndex = fields.indexOf(currentField)
      let nextIndex

      if (e.shiftKey) {
        nextIndex = currentIndex <= 0 ? fields.length - 1 : currentIndex - 1
      } else {
        nextIndex = currentIndex >= fields.length - 1 ? 0 : currentIndex + 1
      }

      const refs = {
        title: titleInputRef,
        desc: descInputRef,
        tags: tagsInputRef,
      }

      refs[fields[nextIndex]]?.current?.focus()
    }
  }

  const handleTagsKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleDone()
      return
    }
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        descInputRef.current?.focus()
      } else {
        titleInputRef.current?.focus()
      }
    }
  }

  const handleTagsEscape = () => {
    tagsInputRef.current?.blur()
    onDiscard?.()
  }

  return (
    <div
      ref={ref}
      className="relative bg-card shadow-lg ring-1 ring-border rounded-lg p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
    >
      {/* URL section */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {faviconUrl && (
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 rounded-[3px] opacity-70 flex-shrink-0"
            onError={(e) => { e.target.style.opacity = 0 }}
          />
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="truncate hover:text-primary transition-colors opacity-70 hover:opacity-100"
          title={url}
        >
          {url}
        </a>
        <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
      </div>

      {/* Main Inputs - Linear style (borderless, clean) */}
      <div className="space-y-3">
        {/* Title */}
        <div>
          <input
            ref={titleInputRef}
            type="text"
            enterKeyHint="done"
            autoFocus
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => handleKeyDown(e, 'title')}
            className="w-full bg-transparent border-none outline-none text-base font-medium placeholder:text-muted-foreground/50 p-0 focus:ring-0"
            placeholder="Title"
          />
        </div>

        {/* Description */}
        <div>
          <textarea
            ref={descInputRef}
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={handleDescBlur}
            onKeyDown={(e) => handleKeyDown(e, 'desc')}
            className="w-full bg-transparent border-none outline-none text-sm text-muted-foreground placeholder:text-muted-foreground/40 resize-none p-0 focus:ring-0 min-h-[2.5em]"
            rows={2}
            placeholder="Add description..."
          />
        </div>

        {/* Tags */}
        <div className="pt-1">
          <TagInput
            ref={tagsInputRef}
            value={localTags}
            onChange={handleTagsChange}
            allTags={allTags}
            placeholder="Add tags..."
            onEscapeWhenClosed={handleTagsEscape}
            onKeyDown={handleTagsKeyDown}
          />
          {localTags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {localTags.map((tag) => (
                <Tag key={tag} onRemove={() => removeTag(tag)}>
                  {tag}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {/* Read Later checkbox */}
        <div className="pt-1">
          <label className="inline-flex items-center gap-2 py-2 sm:py-0 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={localReadLater}
              onChange={(e) => handleReadLaterChange(e.target.checked)}
              className="h-4 w-4 sm:h-3.5 sm:w-3.5 rounded border-input bg-background"
            />
            <span className="text-xs">Read later</span>
          </label>
        </div>
      </div>

      {/* Action footer */}
      <div className="pt-3 flex items-center justify-between border-t border-border/40">
        <div className="flex items-center gap-5 sm:gap-3">
          <button
            onClick={handleDone}
            className="flex items-center gap-1.5 py-3.5 sm:py-0 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <div className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10">
              <Check className="w-2.5 h-2.5" />
            </div>
            Done
          </button>
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 py-3.5 sm:py-0 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Close
          </button>
        </div>

        <div className="flex items-center gap-2 text-[10px] text-muted-foreground/50 font-medium">
          <SaveIndicator show={saveCount} />
          <span className="hidden sm:inline">
            Enter to save · Esc to close
          </span>
        </div>
      </div>
    </div>
  )
})
