import { X, ChevronDown, Menu, Search, Plus } from '../ui/Icons'

/**
 * Simplified FilterBar with Search, Sort, and Add button
 */
export function FilterBar({
  searchQuery,
  onSearchChange,
  sortBy,
  onSortChange,
  onToggleSidebar,
  onAddNew,
}) {
  return (
    <div className="sticky top-0 z-10 bg-base-100/95 backdrop-blur supports-[backdrop-filter]:bg-base-100/60 px-4 py-3 border-b border-base-200/50">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden btn btn-ghost btn-square btn-sm -ml-2"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex-1 relative max-w-md">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-base-content/40 pointer-events-none">
            <Search className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <input
            type="search"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onInput={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 h-10 bg-transparent text-sm rounded-md border border-base-content/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 transition-colors placeholder:text-base-content/50"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-base-content/40 hover:text-base-content hover:bg-base-200 rounded-full transition-colors"
              aria-label="Clear search"
            >
              <X className="w-3 h-3" strokeWidth={2} />
            </button>
          )}
        </div>

        <div className="relative">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            className="appearance-none h-10 pl-3 pr-8 bg-transparent text-sm font-medium text-base-content/70 cursor-pointer rounded-md border border-base-content/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-base-content/20 focus-visible:ring-offset-2 focus-visible:ring-offset-base-100 transition-colors hover:border-base-content/30"
          >
            <option value="recent">Recent</option>
            <option value="oldest">Oldest</option>
            <option value="title">A-Z</option>
            <option value="updated">Updated</option>
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-base-content/40" strokeWidth={1.5} />
        </div>

        <button
          onClick={onAddNew}
          className="ml-auto btn btn-sm h-9 px-4 rounded-md bg-base-content text-base-100 hover:bg-base-content/90 border-none shadow-sm font-medium"
          aria-label="Add bookmark"
        >
          <Plus className="w-4 h-4 mr-1.5" strokeWidth={2} />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>
    </div>
  )
}
