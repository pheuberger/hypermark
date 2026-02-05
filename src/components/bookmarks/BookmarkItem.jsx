import { forwardRef } from 'react'
import { Pencil, Trash, Check } from '../ui/Icons'

export const BookmarkItem = forwardRef(function BookmarkItem(
  { bookmark, isSelected, isChecked, selectionMode, keyboardNavActive, onEdit, onDelete, onTagClick, onToggleSelect, onMouseEnter },
  ref
) {
  const { title, url, tags } = bookmark

  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  const handleClick = (e) => {
    if (selectionMode) {
      e.preventDefault()
      onToggleSelect?.(bookmark._id)
    } else if (e.shiftKey) {
      e.preventDefault()
      onToggleSelect?.(bookmark._id, true)
    }
  }

  const handleCheckboxClick = (e) => {
    e.stopPropagation()
    e.preventDefault()
    // If not in selection mode, clicking checkbox initiates selection
    if (!selectionMode) {
      onToggleSelect?.(bookmark._id, true)
    } else {
      onToggleSelect?.(bookmark._id)
    }
  }

  // Keyboard selection should be visible on top of checked state
  const showKeyboardSelection = isSelected && keyboardNavActive

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
        selectionMode ? 'cursor-pointer' : 'cursor-default'
      } ${
        isChecked
          ? 'bg-primary/15'
          : keyboardNavActive
            ? ''
            : 'hover:bg-accent/50'
      } ${
        showKeyboardSelection
          ? 'ring-2 ring-ring ring-offset-1 ring-offset-background'
          : ''
      }`}
    >
      {/* Always render checkbox area for consistent alignment */}
      <button
        onClick={handleCheckboxClick}
        className={`flex-shrink-0 w-4 h-4 rounded border transition-all duration-150 flex items-center justify-center ${
          isChecked
            ? 'bg-primary border-primary'
            : selectionMode
              ? 'border-muted-foreground/40 hover:border-muted-foreground'
              : 'border-transparent group-hover:border-muted-foreground/30 hover:!border-muted-foreground/50'
        }`}
      >
        {isChecked && (
          <Check className="w-3 h-3 text-primary-foreground" strokeWidth={2.5} />
        )}
      </button>

      <img
        src={faviconUrl}
        alt=""
        className="w-4 h-4 rounded-[3px] flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity"
        onError={(e) => { e.target.style.opacity = 0 }}
      />

      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => selectionMode && e.preventDefault()}
            className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors"
          >
            {title}
          </a>
          <span className="text-xs text-muted-foreground truncate flex-shrink-0 font-normal">{domain}</span>
          {tags && tags.length > 0 && (
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {tags.map((tag) => (
                <span
                  key={tag}
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!selectionMode) {
                      onTagClick && onTagClick(tag)
                    }
                  }}
                  className="text-[10px] leading-none px-2 py-1 rounded-full bg-secondary text-secondary-foreground hover:text-primary hover:bg-accent cursor-pointer transition-colors font-medium"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {!selectionMode && (
        <div className="flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(bookmark)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
            title="Edit"
          >
            <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
          <button
            onClick={() => onDelete(bookmark._id)}
            className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
            title="Delete"
          >
            <Trash className="w-3.5 h-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  )
})
