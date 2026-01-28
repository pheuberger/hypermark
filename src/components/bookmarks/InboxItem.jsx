import { forwardRef, useRef, useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'

/**
 * InboxItem - Bookmark item for inbox triage with inline editing
 * 
 * Visual states:
 * - Normal: Compact display (URL, title)
 * - Selected: Highlighted border/background
 * - Focus mode + selected: Expanded with editable fields
 */
export const InboxItem = forwardRef(function InboxItem(
  { bookmark, isSelected, isFocusMode, onDone, onFieldChange },
  ref
) {
  const { title, url, tags = [], description = '' } = bookmark
  const titleInputRef = useRef(null)
  const tagsInputRef = useRef(null)
  const descInputRef = useRef(null)
  
  // Local state for editing
  const [localTitle, setLocalTitle] = useState(title)
  const [localTags, setLocalTags] = useState(tags.join(', '))
  const [localDesc, setLocalDesc] = useState(description)

  // Extract domain from URL
  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  // Auto-focus title when entering focus mode
  useEffect(() => {
    if (isFocusMode && isSelected && titleInputRef.current) {
      titleInputRef.current.focus()
      titleInputRef.current.select()
    }
  }, [isFocusMode, isSelected])

  // Sync local state with props when bookmark changes
  useEffect(() => {
    setLocalTitle(title)
    setLocalTags(tags.join(', '))
    setLocalDesc(description)
  }, [title, tags, description])

  // Handle blur events - save changes
  const handleTitleBlur = () => {
    if (localTitle !== title) {
      onFieldChange?.('title', localTitle)
    }
  }

  const handleTagsBlur = () => {
    const newTags = localTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0)
    if (JSON.stringify(newTags) !== JSON.stringify(tags)) {
      onFieldChange?.('tags', newTags)
    }
  }

  const handleDescBlur = () => {
    if (localDesc !== description) {
      onFieldChange?.('description', localDesc)
    }
  }

  // Tab navigation - cycle through fields
  const handleKeyDown = (e, currentField) => {
    if (e.key === 'Tab' && isFocusMode && isSelected) {
      e.preventDefault()
      if (e.shiftKey) {
        // Backwards
        if (currentField === 'title') {
          descInputRef.current?.focus()
        } else if (currentField === 'tags') {
          titleInputRef.current?.focus()
        } else if (currentField === 'desc') {
          tagsInputRef.current?.focus()
        }
      } else {
        // Forwards
        if (currentField === 'title') {
          tagsInputRef.current?.focus()
        } else if (currentField === 'tags') {
          descInputRef.current?.focus()
        } else if (currentField === 'desc') {
          titleInputRef.current?.focus()
        }
      }
    }
  }

  // Expanded editing view (focus mode + selected)
  if (isFocusMode && isSelected) {
    return (
      <div
        ref={ref}
        className="bg-accent ring-2 ring-primary rounded-lg p-4 space-y-3"
      >
        {/* URL display */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <img 
            src={faviconUrl} 
            alt="" 
            className="w-4 h-4 rounded-[3px] opacity-70" 
            onError={(e) => { e.target.style.opacity = 0 }} 
          />
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary transition-colors truncate flex items-center gap-1"
          >
            {domain}
            <ExternalLink className="w-3 h-3 opacity-50" />
          </a>
        </div>

        {/* Title input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Title</label>
          <input
            ref={titleInputRef}
            type="text"
            value={localTitle}
            onChange={(e) => setLocalTitle(e.target.value)}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => handleKeyDown(e, 'title')}
            className="input input-bordered input-sm w-full bg-background"
            placeholder="Enter title..."
          />
        </div>

        {/* Tags input */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Tags (comma-separated)</label>
          <input
            ref={tagsInputRef}
            type="text"
            value={localTags}
            onChange={(e) => setLocalTags(e.target.value)}
            onBlur={handleTagsBlur}
            onKeyDown={(e) => handleKeyDown(e, 'tags')}
            className="input input-bordered input-sm w-full bg-background"
            placeholder="tag1, tag2, tag3..."
          />
        </div>

        {/* Description textarea */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Description (optional)</label>
          <textarea
            ref={descInputRef}
            value={localDesc}
            onChange={(e) => setLocalDesc(e.target.value)}
            onBlur={handleDescBlur}
            onKeyDown={(e) => handleKeyDown(e, 'desc')}
            className="textarea textarea-bordered textarea-sm w-full bg-background resize-none"
            rows={2}
            placeholder="Add a description..."
          />
        </div>

        {/* Action hint */}
        <div className="pt-2 border-t border-border/50 text-xs text-muted-foreground">
          Press <kbd className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">Enter</kbd> when done, <kbd className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">Tab</kbd> to cycle fields, <kbd className="px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground font-mono">q</kbd> to exit
        </div>
      </div>
    )
  }

  // Compact view (normal or selected but not focus mode)
  return (
    <div
      ref={ref}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 cursor-default ${
        isSelected
          ? 'bg-accent ring-1 ring-ring'
          : 'hover:bg-accent/50'
      }`}
    >
      <img 
        src={faviconUrl} 
        alt="" 
        className="w-4 h-4 rounded-[3px] flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" 
        onError={(e) => { e.target.style.opacity = 0 }} 
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">
            {title}
          </span>
          <span className="text-xs text-muted-foreground truncate flex-shrink-0 font-normal">{domain}</span>
        </div>
        
        {tags && tags.length > 0 && (
          <div className="flex gap-1.5 mt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                className="text-[10px] leading-tight px-1.5 py-0.5 rounded-[3px] bg-secondary text-secondary-foreground"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Inbox badge */}
      <span className="text-[10px] leading-tight px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
        inbox
      </span>
    </div>
  )
})
