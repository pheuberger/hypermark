import { useMemo, useEffect } from 'preact/hooks'
import { Tag as TagIcon, Hash, BookmarkCheck, PackageOpen, X } from '../ui/Icons'

/**
 * Fixed left sidebar with tag navigation and counts
 * Linear-inspired design with DaisyUI styling
 * Mobile: Collapsible overlay
 * Desktop: Always visible fixed sidebar
 */
export function TagSidebar({
  bookmarks,
  selectedFilter,
  selectedTag,
  onFilterChange,
  onTagSelect,
  isOpen,
  onClose,
}) {
  // Calculate tag counts
  const tagCounts = useMemo(() => {
    const counts = {}
    bookmarks.forEach((bookmark) => {
      if (Array.isArray(bookmark.tags)) {
        bookmark.tags.forEach((tag) => {
          counts[tag] = (counts[tag] || 0) + 1
        })
      }
    })
    return counts
  }, [bookmarks])

  // Sort tags by count (descending) then alphabetically
  const sortedTags = useMemo(() => {
    return Object.entries(tagCounts)
      .sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1] // Count descending
        return a[0].localeCompare(b[0]) // Name ascending
      })
      .map(([tag, count]) => ({ tag, count }))
  }, [tagCounts])

  // Calculate read later count
  const readLaterCount = useMemo(() => {
    return bookmarks.filter((b) => b.readLater).length
  }, [bookmarks])

  // Calculate total bookmarks
  const totalCount = bookmarks.length

  // Handle filter change and close sidebar on mobile
  const handleFilterChange = (view) => {
    onFilterChange(view)
    onClose()
  }

  // Handle tag selection and close sidebar on mobile
  const handleTagSelect = (tag) => {
    onTagSelect(tag)
    onClose()
  }

  // Close sidebar on escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  return (
    <>
      {/* Mobile overlay backdrop */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          w-64 h-screen bg-base-200 border-r border-base-300 flex flex-col overflow-hidden
          lg:relative lg:translate-x-0
          fixed top-0 left-0 z-40 transition-transform duration-300
          ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        `}
      >
        {/* Header */}
        <div className="p-4 border-b border-base-300 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xl font-bold">
            <TagIcon className="w-6 h-6 text-primary" />
            <span>Hypermark</span>
          </div>
          {/* Close button (mobile only) */}
          <button
            onClick={onClose}
            className="lg:hidden btn btn-ghost btn-sm btn-circle"
            aria-label="Close sidebar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-2">
        {/* All bookmarks */}
        <button
          onClick={() => handleFilterChange('all')}
          className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
            selectedFilter === 'all'
              ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
              : 'hover:bg-base-300 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <PackageOpen className="w-4 h-4" />
            <span>All Bookmarks</span>
          </div>
          <span className="text-xs opacity-60">{totalCount}</span>
        </button>

        {/* Read Later */}
        <button
          onClick={() => handleFilterChange('read-later')}
          className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
            selectedFilter === 'read-later'
              ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
              : 'hover:bg-base-300 opacity-70 hover:opacity-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <BookmarkCheck className="w-4 h-4" />
            <span>Read Later</span>
          </div>
          <span className="text-xs opacity-60">{readLaterCount}</span>
        </button>

        {/* Tags section */}
        {sortedTags.length > 0 && (
          <>
            <div className="px-4 pt-6 pb-2">
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide opacity-60">
                <Hash className="w-3 h-3" />
                <span>Tags</span>
              </div>
            </div>

            {/* Tag list */}
            {sortedTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => handleTagSelect(tag)}
                className={`w-full px-4 py-2 flex items-center justify-between text-left transition-colors ${
                  selectedFilter === 'tag' && selectedTag === tag
                    ? 'bg-primary/10 text-primary font-medium border-l-2 border-primary'
                    : 'hover:bg-base-300 opacity-70 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="w-3 h-3 flex-shrink-0" />
                  <span className="truncate">{tag}</span>
                </div>
                <span className="text-xs opacity-60 ml-2 flex-shrink-0">{count}</span>
              </button>
            ))}
          </>
        )}
      </nav>

        {/* Footer with version or info */}
        <div className="p-4 border-t border-base-300">
          <p className="text-xs opacity-40 text-center">
            {totalCount} {totalCount === 1 ? 'bookmark' : 'bookmarks'}
          </p>
        </div>
      </aside>
    </>
  )
}
