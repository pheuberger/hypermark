import { Tag } from '../ui/Tag'
import { Button } from '../ui/Button'
import { Bookmark, BookmarkPlus, BookOpenCheck, Edit, Trash2 } from '../ui/Icons'

/**
 * Single bookmark card component with DaisyUI styling
 */
export function BookmarkItem({ bookmark, onEdit, onDelete, onToggleReadLater, onTagClick }) {
  const { title, url, description, tags, readLater, createdAt } = bookmark

  // Format date
  const date = new Date(createdAt)
  const formattedDate = date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })

  // Extract domain from URL
  let domain = ''
  try {
    domain = new URL(url).hostname.replace('www.', '')
  } catch {
    domain = url
  }

  return (
    <div className="card bg-base-200 shadow-md hover:shadow-lg transition-shadow">
      <div className="card-body">
        {/* Header with title and actions */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex-1 min-w-0">
            <h3 className="card-title text-lg">
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="link link-primary hover:link-hover"
              >
                {title}
              </a>
              {/* Read later indicator */}
              {readLater && (
                <Bookmark
                  className="w-5 h-5 text-primary flex-shrink-0"
                  title="Read later"
                  aria-label="Marked as read later"
                />
              )}
            </h3>
            <p className="text-sm opacity-70 truncate">{domain}</p>
          </div>
        </div>

        {/* Description */}
        {description && <p className="text-sm opacity-70 mb-3 line-clamp-2">{description}</p>}

        {/* Tags */}
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {tags.map((tag) => (
              <span
                key={tag}
                onClick={() => onTagClick && onTagClick(tag)}
                className="badge badge-primary badge-sm cursor-pointer hover:opacity-80"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Footer with date and actions */}
        <div className="card-actions justify-between items-center pt-2 border-t border-base-300">
          <span className="text-xs opacity-60">{formattedDate}</span>

          <div className="flex items-center gap-1">
            {/* Read later toggle */}
            <button
              onClick={() => onToggleReadLater(bookmark._id)}
              className="btn btn-ghost btn-sm gap-2"
              title={readLater ? 'Remove from read later' : 'Add to read later'}
            >
              {readLater ? (
                <>
                  <BookOpenCheck className="w-4 h-4" />
                  Reading
                </>
              ) : (
                <>
                  <BookmarkPlus className="w-4 h-4" />
                  Read Later
                </>
              )}
            </button>

            {/* Edit button */}
            <button
              onClick={() => onEdit(bookmark)}
              className="btn btn-ghost btn-sm btn-square"
              title="Edit bookmark"
              aria-label="Edit bookmark"
            >
              <Edit className="w-4 h-4" />
            </button>

            {/* Delete button */}
            <button
              onClick={() => {
                if (confirm(`Delete "${title}"?`)) {
                  onDelete(bookmark._id)
                }
              }}
              className="btn btn-ghost btn-sm btn-square text-error"
              title="Delete bookmark"
              aria-label="Delete bookmark"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
