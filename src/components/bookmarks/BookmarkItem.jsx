import { Tag } from '../ui/Tag'
import { Button } from '../ui/Button'

/**
 * Single bookmark card component
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
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-4 hover:shadow-md transition-shadow">
      {/* Header with title and actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary transition-colors"
            >
              {title}
            </a>
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
            {domain}
          </p>
        </div>

        {/* Read later indicator */}
        {readLater && (
          <span
            className="flex-shrink-0 text-2xl"
            title="Read later"
            aria-label="Marked as read later"
          >
            🔖
          </span>
        )}
      </div>

      {/* Description */}
      {description && (
        <p className="text-sm text-gray-600 dark:text-gray-300 mb-3 line-clamp-2">
          {description}
        </p>
      )}

      {/* Tags */}
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {tags.map((tag) => (
            <Tag
              key={tag}
              onClick={() => onTagClick && onTagClick(tag)}
            >
              {tag}
            </Tag>
          ))}
        </div>
      )}

      {/* Footer with date and actions */}
      <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
        <span className="text-xs text-gray-500 dark:text-gray-400">
          {formattedDate}
        </span>

        <div className="flex items-center gap-2">
          {/* Read later toggle */}
          <button
            onClick={() => onToggleReadLater(bookmark._id)}
            className="text-sm text-gray-600 dark:text-gray-400 hover:text-primary transition-colors"
            title={readLater ? 'Remove from read later' : 'Add to read later'}
          >
            {readLater ? '📖 Reading' : '🔖 Read Later'}
          </button>

          {/* Edit button */}
          <Button
            variant="ghost"
            size="small"
            onClick={() => onEdit(bookmark)}
          >
            Edit
          </Button>

          {/* Delete button */}
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              if (confirm(`Delete "${title}"?`)) {
                onDelete(bookmark._id)
              }
            }}
            className="text-red-600 hover:text-red-700 hover:bg-red-50"
          >
            Delete
          </Button>
        </div>
      </div>
    </div>
  )
}
