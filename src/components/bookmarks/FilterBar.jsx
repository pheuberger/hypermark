import { X, ArrowUpDown, Menu } from '../ui/Icons'
import { Button } from '../ui/Button'

/**
 * Horizontal filter bar with search, active filters, and sort controls
 * Linear-inspired design with DaisyUI styling
 * Mobile: Shows menu button to toggle sidebar
 * Desktop: Shows Add button
 */
export function FilterBar({
  searchQuery,
  onSearchChange,
  selectedFilter,
  selectedTag,
  onClearFilter,
  sortBy,
  onSortChange,
  resultCount,
  onAddNew,
  onToggleSidebar,
}) {
  const hasActiveFilter = selectedFilter !== 'all' || searchQuery

  return (
    <div className="sticky top-0 z-10 bg-base-100 border-b border-base-300 px-4 py-3 space-y-3">
      {/* Top row: Menu button (mobile), Search, and Add button (desktop) */}
      <div className="flex items-center gap-3">
        {/* Menu button (mobile only) */}
        <button
          onClick={onToggleSidebar}
          className="lg:hidden btn btn-ghost btn-square flex-shrink-0"
          aria-label="Open menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Search input */}
        <div className="flex-1 relative">
          <input
            type="search"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onInput={(e) => onSearchChange(e.target.value)}
            className="input input-bordered w-full pr-8"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
              aria-label="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Add bookmark button (desktop only) */}
        <Button onClick={onAddNew} className="hidden lg:flex flex-shrink-0">
          + New
        </Button>
      </div>

      {/* Bottom row: Active filters, results count, and sort */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        {/* Left side: Active filter badges */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          {/* Filter type indicator */}
          {selectedFilter === 'read-later' && (
            <span className="badge badge-primary gap-1">
              Read Later
              <button
                onClick={onClearFilter}
                className="hover:opacity-70"
                aria-label="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {selectedFilter === 'tag' && selectedTag && (
            <span className="badge badge-primary gap-1">
              #{selectedTag}
              <button
                onClick={onClearFilter}
                className="hover:opacity-70"
                aria-label="Clear filter"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Search query indicator */}
          {searchQuery && (
            <span className="badge badge-secondary gap-1">
              Search: "{searchQuery}"
              <button
                onClick={() => onSearchChange('')}
                className="hover:opacity-70"
                aria-label="Clear search"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}

          {/* Clear all button */}
          {hasActiveFilter && (
            <button
              onClick={() => {
                onClearFilter()
                onSearchChange('')
              }}
              className="btn btn-ghost btn-xs"
            >
              Clear all
            </button>
          )}

          {/* Results count */}
          <span className="text-sm opacity-60">
            {resultCount} {resultCount === 1 ? 'result' : 'results'}
          </span>
        </div>

        {/* Right side: Sort dropdown */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <ArrowUpDown className="w-4 h-4 opacity-60" />
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="select select-bordered select-sm"
          >
            <option value="recent">Recent First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">By Title</option>
          </select>
        </div>
      </div>
    </div>
  )
}
