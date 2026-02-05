import { forwardRef } from 'react'
import { Pencil, Trash, Square, CheckSquare } from '../ui/Icons'

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

  return (
    <div
      ref={ref}
      onClick={handleClick}
      onMouseEnter={onMouseEnter}
      className={`group flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 ${
        selectionMode ? 'cursor-pointer' : 'cursor-default'
      } ${
        isChecked
          ? 'bg-primary/10 ring-1 ring-primary/30'
          : isSelected
            ? 'bg-accent ring-1 ring-ring'
            : keyboardNavActive
              ? ''
              : 'hover:bg-accent/50'
      }`}
    >
      {selectionMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(bookmark._id)
          }}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground transition-colors"
        >
          {isChecked ? (
            <CheckSquare className="w-4 h-4 text-primary" strokeWidth={1.5} />
          ) : (
            <Square className="w-4 h-4" strokeWidth={1.5} />
          )}
        </button>
      )}

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
