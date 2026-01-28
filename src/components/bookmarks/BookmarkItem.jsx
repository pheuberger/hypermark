import { forwardRef } from 'react'
import { Pencil, Trash } from '../ui/Icons'

export const BookmarkItem = forwardRef(function BookmarkItem(
  { bookmark, isSelected, onEdit, onDelete, onTagClick },
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
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm text-foreground truncate hover:text-primary transition-colors"
          >
            {title}
          </a>
          <span className="text-xs text-muted-foreground truncate flex-shrink-0 font-normal">{domain}</span>
        </div>
        
        {tags && tags.length > 0 && (
          <div className="flex gap-1.5 mt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                onClick={(e) => {
                  e.stopPropagation()
                  onTagClick && onTagClick(tag)
                }}
                className="text-[10px] leading-tight px-1.5 py-0.5 rounded-[3px] bg-secondary text-secondary-foreground hover:text-primary hover:bg-accent cursor-pointer transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(bookmark)}
          className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
          title="Edit"
        >
          <Pencil className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
        <button
          onClick={() => {
             if (confirm(`Delete "${title}"?`)) {
               onDelete(bookmark._id)
             }
          }}
          className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition-colors"
          title="Delete"
        >
          <Trash className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
})
