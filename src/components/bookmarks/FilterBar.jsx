import { X, ChevronDown, Menu, Search, Plus, ListChecks, ArrowUpDown } from '../ui/Icons'

const SORT_OPTIONS = [
  { value: 'recent', label: 'Recent' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'title', label: 'A-Z' },
  { value: 'updated', label: 'Updated' },
]

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
    <div className="sticky top-0 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-3 sm:px-4 py-3">
      <div className="flex items-center gap-1.5 sm:gap-3">
        <button
          onClick={onToggleSidebar}
          className="lg:hidden h-9 w-9 -ml-1 flex-shrink-0 inline-flex items-center justify-center hover:bg-accent rounded-md transition-colors"
          aria-label="Open sidebar"
        >
          <Menu className="w-5 h-5" strokeWidth={1.5} />
        </button>

        {/* Spacer to align search with bookmark titles (accounts for checkbox + gap) */}
        <div className="hidden lg:block w-7 flex-shrink-0" />

        <div className="flex-1 min-w-0 relative">
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
            <Search className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search..."
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

        {/* Sort: icon-only trigger on mobile (invisible native select on top), text select on sm+ */}
        <div className="relative sm:hidden h-9 w-9 flex-shrink-0">
          <div className="h-full w-full inline-flex items-center justify-center rounded-md text-muted-foreground">
            <ArrowUpDown className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort bookmarks"
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="relative hidden sm:block flex-shrink-0">
          <select
            value={sortBy}
            onChange={(e) => onSortChange(e.target.value)}
            aria-label="Sort bookmarks"
            className="appearance-none h-10 pl-3 pr-8 bg-transparent text-sm font-medium text-muted-foreground cursor-pointer rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background transition-colors"
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <ChevronDown className="w-3 h-3 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" strokeWidth={1.5} />
        </div>

        <button
          onClick={onToggleSelectionMode}
          className={`h-9 w-9 flex-shrink-0 rounded-md inline-flex items-center justify-center transition-colors ${
            selectionMode
              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
              : 'text-muted-foreground hover:text-foreground hover:bg-accent'
          }`}
          aria-label={selectionMode ? 'Exit selection mode' : 'Select bookmarks'}
          title={selectionMode ? 'Exit selection mode (Esc)' : 'Select multiple bookmarks'}
        >
          {selectionMode
            ? <X className="w-4 h-4" strokeWidth={1.5} />
            : <ListChecks className="w-4 h-4" strokeWidth={1.5} />
          }
        </button>

        <button
          onClick={onAddNew}
          className="h-9 px-3 sm:px-4 flex-shrink-0 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm font-medium text-sm inline-flex items-center gap-1.5 transition-colors"
          aria-label="Add bookmark"
        >
          <Plus className="w-4 h-4" strokeWidth={2} />
          <span className="hidden sm:inline">Add</span>
        </button>
      </div>
    </div>
  )
}
