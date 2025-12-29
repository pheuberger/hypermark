import { Search, X } from '../ui/Icons'

/**
 * Search bar component for bookmarks with Lucide icons
 */
export function BookmarkSearch({ value, onChange, resultCount }) {
  return (
    <div className="mb-4">
      <div className="relative">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Search bookmarks..."
          className="input input-bordered input-primary w-full pl-10 pr-10"
        />
        {/* Search icon */}
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-base-content opacity-40" />

        {/* Clear button */}
        {value && (
          <button
            onClick={() => onChange('')}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
            aria-label="Clear search"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Result count */}
      {value && (
        <p className="mt-2 text-sm opacity-70">
          Found {resultCount} {resultCount === 1 ? 'result' : 'results'} for "{value}"
        </p>
      )}
    </div>
  )
}
