import { forwardRef, useRef, useEffect, useState } from 'react'
import { ExternalLink, Check, X } from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { Tag } from '../ui/Tag'
import { getAllTags, createBookmark, updateBookmark } from '../../services/bookmarks'

/**
 * BookmarkInlineCard - Inline card for adding/editing bookmarks
 *
 * Used for:
 * - Adding new bookmarks (appears at top of list with URL input)
 * - Editing existing bookmarks (expands in place)
 *
 * Features:
 * - Auto-save on blur
 * - Keyboard navigation (Tab between fields, Enter to confirm, Esc to cancel)
 * - URL is required minimum for saving
 */
export const BookmarkInlineCard = forwardRef(function BookmarkInlineCard(
  { bookmark = null, isNew = false, onDone, onDiscard, onFieldChange },
  ref
) {
  const isEditing = Boolean(bookmark?._id)

  const urlInputRef = useRef(null)
  const titleInputRef = useRef(null)
  const descInputRef = useRef(null)
  const tagsInputRef = useRef(null)

  const [localUrl, setLocalUrl] = useState(bookmark?.url || '')
  const [localTitle, setLocalTitle] = useState(bookmark?.title || '')
  const [localDesc, setLocalDesc] = useState(bookmark?.description || '')
  const [localTags, setLocalTags] = useState(bookmark?.tags || [])
  const [localReadLater, setLocalReadLater] = useState(bookmark?.readLater || false)
  const [allTags, setAllTags] = useState([])
  const [urlError, setUrlError] = useState('')
  const [editMode, setEditMode] = useState(true)

  // Extract domain from URL
  let domain = ''
  if (localUrl) {
    try {
      domain = new URL(localUrl).hostname.replace('www.', '')
    } catch {
      domain = ''
    }
  }

  const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null

  // Focus URL input for new, title for edit
  useEffect(() => {
    if (isNew && urlInputRef.current) {
      urlInputRef.current.focus()
    } else if (!isNew && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [isNew])

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
      setLocalUrl(bookmark.url || '')
      setLocalTitle(bookmark.title || '')
      setLocalDesc(bookmark.description || '')
      setLocalTags(bookmark.tags || [])
      setLocalReadLater(bookmark.readLater || false)
    }
  }, [bookmark])

  const validateUrl = (url) => {
    if (!url.trim()) return false
    try {
      new URL(url)
      return true
    } catch {
      // Try adding https://
      try {
        new URL('https://' + url)
        return true
      } catch {
        return false
      }
    }
  }

  const normalizeUrl = (url) => {
    if (!url.trim()) return ''
    try {
      new URL(url)
      return url
    } catch {
      // Try adding https://
      try {
        new URL('https://' + url)
        return 'https://' + url
      } catch {
        return url
      }
    }
  }

  // Auto-save logic
  const saveChanges = () => {
    const normalizedUrl = normalizeUrl(localUrl)

    if (!validateUrl(localUrl)) {
      if (localUrl.trim()) {
        setUrlError('Invalid URL')
      }
      return false
    }

    setUrlError('')

    const data = {
      url: normalizedUrl,
      title: localTitle.trim() || normalizedUrl,
      description: localDesc,
      tags: localTags,
      readLater: localReadLater,
    }

    try {
      if (isEditing) {
        updateBookmark(bookmark._id, data)
        onFieldChange?.(data)
      } else if (isNew) {
        // For new bookmarks, create only when we have a valid URL
        createBookmark(data)
      }
      return true
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      return false
    }
  }

  const handleUrlBlur = () => {
    if (localUrl !== (bookmark?.url || '')) {
      if (localUrl.trim() && validateUrl(localUrl)) {
        setLocalUrl(normalizeUrl(localUrl))
        setUrlError('')
        if (isEditing) {
          saveChanges()
        }
      } else if (localUrl.trim()) {
        setUrlError('Invalid URL')
      }
    }
  }

  const handleTitleBlur = () => {
    if (isEditing && localTitle !== bookmark?.title) {
      saveChanges()
    }
  }

  const handleDescBlur = () => {
    if (isEditing && localDesc !== bookmark?.description) {
      saveChanges()
    }
  }

  const handleTagsChange = (newTags) => {
    setLocalTags(newTags)
    if (isEditing) {
      // Save immediately for existing bookmarks
      setTimeout(() => {
        const data = {
          url: normalizeUrl(localUrl),
          title: localTitle.trim() || normalizeUrl(localUrl),
          description: localDesc,
          tags: newTags,
          readLater: localReadLater,
        }
        try {
          updateBookmark(bookmark._id, data)
          onFieldChange?.(data)
        } catch (error) {
          console.error('Failed to save tags:', error)
        }
      }, 0)
    }
  }

  const removeTag = (tagToRemove) => {
    const newTags = localTags.filter((t) => t !== tagToRemove)
    handleTagsChange(newTags)
  }

  const handleDone = () => {
    if (!validateUrl(localUrl)) {
      setUrlError('URL is required')
      urlInputRef.current?.focus()
      return
    }

    if (saveChanges()) {
      onDone?.()
    }
  }

  const handleDiscard = () => {
    onDiscard?.()
  }

  const handleKeyDown = (e, currentField) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.target.blur()
      onDiscard?.()
      return
    }

    // Ctrl/Cmd+Enter saves from any field
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      handleDone()
      return
    }

    // Tab navigation
    if (e.key === 'Tab') {
      e.preventDefault()
      const fields = isNew
        ? ['url', 'title', 'desc', 'tags']
        : ['title', 'desc', 'tags']

      const currentIndex = fields.indexOf(currentField)
      let nextIndex

      if (e.shiftKey) {
        nextIndex = currentIndex <= 0 ? fields.length - 1 : currentIndex - 1
      } else {
        nextIndex = currentIndex >= fields.length - 1 ? 0 : currentIndex + 1
      }

      const refs = {
        url: urlInputRef,
        title: titleInputRef,
        desc: descInputRef,
        tags: tagsInputRef,
      }

      refs[fields[nextIndex]]?.current?.focus()
    }
  }

  const handleTagsKeyDown = (e) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        descInputRef.current?.focus()
      } else if (isNew) {
        urlInputRef.current?.focus()
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
      {/* Draft indicator for new bookmarks */}
      {isNew && (
        <div className="absolute -top-2 left-4 px-2 py-0.5 text-[10px] font-medium bg-primary/10 text-primary rounded-full">
          Draft
        </div>
      )}

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
        {isNew ? (
          <div className="flex-1">
            <input
              ref={urlInputRef}
              type="text"
              value={localUrl}
              onChange={(e) => {
                setLocalUrl(e.target.value)
                setUrlError('')
              }}
              onBlur={handleUrlBlur}
              onKeyDown={(e) => handleKeyDown(e, 'url')}
              className={`w-full bg-transparent border-none outline-none text-xs placeholder:text-muted-foreground/50 p-0 focus:ring-0 ${urlError ? 'text-destructive' : ''}`}
              placeholder="https://example.com"
            />
            {urlError && (
              <span className="text-[10px] text-destructive">{urlError}</span>
            )}
          </div>
        ) : (
          <>
            <a
              href={localUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate hover:text-primary transition-colors opacity-70 hover:opacity-100"
              title={localUrl}
            >
              {localUrl}
            </a>
            <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-50" />
          </>
        )}
      </div>

      {/* Main Inputs - Linear style (borderless, clean) */}
      <div className="space-y-3">
        {/* Title */}
        <div>
          <input
            ref={titleInputRef}
            type="text"
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
          <label className="flex items-center gap-2 cursor-pointer text-sm text-muted-foreground hover:text-foreground transition-colors">
            <input
              type="checkbox"
              checked={localReadLater}
              onChange={(e) => {
                setLocalReadLater(e.target.checked)
                if (isEditing) {
                  setTimeout(() => saveChanges(), 0)
                }
              }}
              className="h-3.5 w-3.5 rounded border-input bg-background"
            />
            <span className="text-xs">Read later</span>
          </label>
        </div>
      </div>

      {/* Action footer */}
      <div className="pt-3 flex items-center justify-between border-t border-border/40">
        <div className="flex items-center gap-3">
          <button
            onClick={handleDone}
            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
          >
            <div className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10">
              <Check className="w-2.5 h-2.5" />
            </div>
            {isNew ? 'Save' : 'Done'}
          </button>
          <button
            onClick={handleDiscard}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            {isNew ? 'Cancel' : 'Close'}
          </button>
        </div>

        <div className="text-[10px] text-muted-foreground/50 font-medium">
          Enter to save · Esc to {isNew ? 'cancel' : 'close'}
        </div>
      </div>
    </div>
  )
})
