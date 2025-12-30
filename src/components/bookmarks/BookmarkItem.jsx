import { Pencil, Trash } from '../ui/Icons'

/**
 * Minimal list row for a single bookmark
 */
export function BookmarkItem({ bookmark, onEdit, onDelete, onTagClick }) {
  const { title, url, tags } = bookmark

  // Extract domain
  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`

  return (
    <div className="group flex items-center gap-3 px-3 py-2.5 rounded-md border border-transparent hover:bg-base-200/50 hover:border-base-200 transition-all duration-200 cursor-default">
      {/* Favicon */}
      <img 
        src={faviconUrl} 
        alt="" 
        className="w-4 h-4 rounded-[3px] flex-shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" 
        onError={(e) => { e.target.style.opacity = 0 }} 
      />

      {/* Main Content */}
      <div className="flex-1 min-w-0 overflow-hidden">
        <div className="flex items-center gap-2">
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-sm text-base-content truncate hover:text-primary transition-colors"
          >
            {title}
          </a>
          <span className="text-xs text-base-content/40 truncate flex-shrink-0 font-normal">{domain}</span>
        </div>
        
        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex gap-1.5 mt-1">
            {tags.map((tag) => (
              <span
                key={tag}
                onClick={(e) => {
                  e.stopPropagation() // Prevent row click if we add one later
                  onTagClick && onTagClick(tag)
                }}
                className="text-[10px] leading-tight px-1.5 py-0.5 rounded-[3px] bg-base-200 text-base-content/60 hover:text-primary hover:bg-base-300 cursor-pointer transition-colors"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Actions - Show on hover */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(bookmark)}
          className="btn btn-ghost btn-xs btn-square w-7 h-7 min-h-0 text-base-content/60 hover:text-base-content hover:bg-base-300 rounded-md"
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
          className="btn btn-ghost btn-xs btn-square w-7 h-7 min-h-0 text-base-content/60 hover:text-error hover:bg-error/10 rounded-md"
          title="Delete"
        >
          <Trash className="w-3.5 h-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  )
}
