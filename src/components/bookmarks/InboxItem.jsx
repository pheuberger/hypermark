import { forwardRef, useRef, useEffect, useState } from 'react'
import { ExternalLink, Check, Trash2 } from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { Tag } from '../ui/Tag'
import { getAllTags } from '../../services/bookmarks'

/**
 * InboxItem - Bookmark item for inbox triage with inline editing
 * 
 * Visual states:
 * - Normal: Compact display (URL, title)
 * - Selected: Highlighted border/background
 * - Focus mode + selected: Expanded with editable fields
 */
export const InboxItem = forwardRef(function InboxItem(
  { bookmark, isSelected, isFocusMode, editMode, onDone, onDiscard, onFieldChange, onEnterEditMode, onExitEditMode },
  ref
) {
  const { title, url, tags = [], description = '' } = bookmark
  const titleInputRef = useRef(null)
  const tagsInputRef = useRef(null)
  const descInputRef = useRef(null)
  
  const [localTitle, setLocalTitle] = useState(title)
  const [localTags, setLocalTags] = useState(tags)
  const [localDesc, setLocalDesc] = useState(description)
  const [allTags, setAllTags] = useState([])

  // Extract domain from URL
  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  useEffect(() => {
    if (editMode && titleInputRef.current) {
      titleInputRef.current.focus()
    }
  }, [editMode])

  useEffect(() => {
    if (isFocusMode && isSelected) {
      try {
        setAllTags(getAllTags())
      } catch {
        setAllTags([])
      }
    }
  }, [isFocusMode, isSelected])

  useEffect(() => {
    setLocalTitle(title)
    setLocalTags(tags)
    setLocalDesc(description)
  }, [title, tags, description])

  // Handle blur events - save changes
  const handleTitleBlur = () => {
    if (localTitle !== title) {
      onFieldChange?.('title', localTitle)
    }
  }

  const handleTagsChange = (newTags) => {
    setLocalTags(newTags)
    onFieldChange?.('tags', newTags)
  }

  const removeTag = (tagToRemove) => {
    const newTags = localTags.filter((t) => t !== tagToRemove)
    setLocalTags(newTags)
    onFieldChange?.('tags', newTags)
  }

  const handleDescBlur = () => {
    if (localDesc !== description) {
      onFieldChange?.('description', localDesc)
    }
  }

  const handleKeyDown = (e, currentField) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.target.blur()
      onExitEditMode?.()
      return
    }

    if (e.key === 'Enter' && currentField !== 'desc') {
      e.preventDefault()
      e.target.blur()
      onDone?.()
      return
    }

    if (e.key === 'Tab' && editMode) {
      e.preventDefault()
      if (e.shiftKey) {
        if (currentField === 'title') {
          tagsInputRef.current?.focus()
        } else if (currentField === 'desc') {
          titleInputRef.current?.focus()
        }
      } else {
        if (currentField === 'title') {
          descInputRef.current?.focus()
        } else if (currentField === 'desc') {
          tagsInputRef.current?.focus()
        }
      }
    }
  }

  const handleInputFocus = () => {
    if (!editMode) {
      onEnterEditMode?.()
    }
  }

  const handleTagsEscape = () => {
    tagsInputRef.current?.blur()
    onExitEditMode?.()
  }

  const handleTagsKeyDown = (e) => {
    if (e.key === 'Tab' && editMode) {
      e.preventDefault()
      if (e.shiftKey) {
        descInputRef.current?.focus()
      } else {
        titleInputRef.current?.focus()
      }
    }
  }

  // Expanded editing view (focus mode + selected)
  if (isFocusMode && isSelected) {
    return (
      <div
        ref={ref}
        className="relative bg-card shadow-lg ring-1 ring-border rounded-lg p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <img 
            src={faviconUrl} 
            alt="" 
            className="w-4 h-4 rounded-[3px] opacity-70 flex-shrink-0" 
            onError={(e) => { e.target.style.opacity = 0 }} 
          />
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
                value={localTitle}
                onChange={(e) => setLocalTitle(e.target.value)}
                onBlur={handleTitleBlur}
                onFocus={handleInputFocus}
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
                onFocus={handleInputFocus}
                onKeyDown={(e) => handleKeyDown(e, 'desc')}
                className="w-full bg-transparent border-none outline-none text-sm text-muted-foreground placeholder:text-muted-foreground/40 resize-none p-0 focus:ring-0 min-h-[2.5em]"
                rows={2}
                placeholder="Add description..."
            />
            </div>

            <div className="pt-1">
              <TagInput
                ref={tagsInputRef}
                value={localTags}
                onChange={handleTagsChange}
                allTags={allTags}
                placeholder="Add tags..."
                onFocus={handleInputFocus}
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
        </div>

        <div className="pt-3 flex items-center justify-between border-t border-border/40">
           <div className="flex items-center gap-3">
             <button 
               onClick={() => onDone()}
               className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
             >
               <div className="flex items-center justify-center w-4 h-4 rounded-full bg-primary/10">
                 <Check className="w-2.5 h-2.5" />
               </div>
               Done
             </button>
             <button 
               onClick={() => onDiscard?.()}
               className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors"
             >
               <Trash2 className="w-3.5 h-3.5" />
               Discard
             </button>
           </div>
           
           <div className="text-[10px] text-muted-foreground/50 font-medium">
              {editMode ? 'Esc to navigate' : 'Enter to edit'}
           </div>
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
          ? 'bg-accent/70'
          : 'hover:bg-accent/40'
      }`}
    >
      <div className="flex-shrink-0 w-4 flex justify-center">
         {isSelected && <div className="w-1 h-4 rounded-full bg-primary/50" />}
      </div>

      <img 
        src={faviconUrl} 
        alt="" 
        className="w-4 h-4 rounded-[3px] flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" 
        onError={(e) => { e.target.style.opacity = 0 }} 
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <span className={`text-sm truncate ${isSelected ? 'font-medium text-foreground' : 'text-foreground/90'}`}>
            {title}
          </span>
          <span className="text-xs text-muted-foreground truncate flex-shrink-0 font-normal opacity-70">{domain}</span>
        </div>
      </div>
      
      {tags && tags.length > 0 && (
          <div className="flex gap-1.5 opacity-60 group-hover:opacity-100 transition-opacity">
            {tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="text-[10px] leading-tight px-1.5 py-0.5 rounded-[3px] bg-secondary/50 text-secondary-foreground"
              >
                #{tag}
              </span>
            ))}
            {tags.length > 2 && <span className="text-[10px] text-muted-foreground">+{tags.length - 2}</span>}
          </div>
      )}
    </div>
  )
})
