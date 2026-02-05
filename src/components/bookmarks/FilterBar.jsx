import { X, ChevronDown, Menu, Search, Plus, ListChecks } from '../ui/Icons'

export function FilterBar({
  searchQuery,
  onSearchChange,
  onSearchSubmit,
  sortBy,
  onSortChange,
  onToggleSidebar,
  onAddNew,
  searchInputRef,
  selectionMode,
  onToggleSelectionMode,
}) {
  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onSearchSubmit?.()
    } else if (e.key === 'Escape') {
      onSearchChange('')
      e.target.blur()
    }
  }

  return (
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 py-3">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden p-2 -ml-2 hover:bg-accent rounded-md transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        <div className="flex-1 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Search className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search bookmarks..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={handleKeyDown}
            className="w-full pl-9 pr-8 h-10 bg-transparent text-sm rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors placeholder:text-muted-foreground"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground hover:bg-accent rounded-full transition-colors"
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
            className="appearance-none h-10 pl-3 pr-8 bg-transparent text-sm font-medium text-muted-foreground cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
          >
            <option value="recent">Recent</option>
            <option value="oldest">Oldest</option>
            <option value="title">A-Z</option>
            <option value="updated">Updated</option>
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" strokeWidth={1.5} />
        </div>

        <button
          onClick={onToggleSelectionMode}
          className={`h-9 px-3 rounded-md font-medium text-sm inline-flex items-center gap-1.5 transition-colors ${
            selectionMode
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          aria-label={selectionMode ? 'Exit selection mode' : 'Select bookmarks'}
          title={selectionMode ? 'Exit selection mode' : 'Select multiple bookmarks'}
        >
          <ListChecks className="w-4 h-4" strokeWidth={1.5} />
          <span className="hidden sm:inline">{selectionMode ? 'Done' : 'Select'}</span>
        </button>

        <button
          onClick={onAddNew}
          className="h-9 px-4 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-medium text-sm inline-flex items-center gap-1.5 transition-colors"
          aria-label="Add bookmark"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>
    </div>
  )
}
