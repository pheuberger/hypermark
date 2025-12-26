import { useState, useMemo } from 'preact/hooks'
import { useFireproof, useLiveQuery } from '../../hooks/useFireproof'
import { useSearch, useDebounce } from '../../hooks/useSearch'
import { BookmarkItem } from './BookmarkItem'
import { BookmarkForm } from './BookmarkForm'
import { BookmarkSearch } from './BookmarkSearch'
import { Button } from '../ui/Button'
import { Tag } from '../ui/Tag'
import {
  createBookmark,
  updateBookmark,
  deleteBookmark,
  toggleReadLater,
  getAllTags,
} from '../../services/bookmarks'

/**
 * Main bookmark list view with filters and sorting
 */
export function BookmarkList() {
  const { db, loading: dbLoading, error: dbError } = useFireproof()

  // Query all bookmarks
  const { docs: bookmarks, loading: bookmarksLoading } = useLiveQuery(db, {
    type: 'bookmark',
  })

  // UI state
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState(null)
  const [filterView, setFilterView] = useState('all') // 'all', 'read-later', 'tag'
  const [selectedTag, setSelectedTag] = useState(null)
  const [sortBy, setSortBy] = useState('recent') // 'recent', 'oldest', 'title'
  const [searchQuery, setSearchQuery] = useState('')

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Apply search filter
  const searchedBookmarks = useSearch(bookmarks, debouncedSearchQuery)

  // Get all unique tags from bookmarks
  const allTags = useMemo(() => {
    const tagSet = new Set()
    bookmarks.forEach((bookmark) => {
      if (Array.isArray(bookmark.tags)) {
        bookmark.tags.forEach((tag) => tagSet.add(tag))
      }
    })
    return Array.from(tagSet).sort()
  }, [bookmarks])

  // Filter bookmarks
  const filteredBookmarks = useMemo(() => {
    // Start with search results (or all bookmarks if no search)
    let filtered = [...searchedBookmarks]

    // Apply view filter
    if (filterView === 'read-later') {
      filtered = filtered.filter((b) => b.readLater)
    } else if (filterView === 'tag' && selectedTag) {
      filtered = filtered.filter(
        (b) => Array.isArray(b.tags) && b.tags.includes(selectedTag)
      )
    }

    // Apply sorting
    filtered.sort((a, b) => {
      if (sortBy === 'recent') {
        return b.createdAt - a.createdAt
      } else if (sortBy === 'oldest') {
        return a.createdAt - b.createdAt
      } else if (sortBy === 'title') {
        return a.title.localeCompare(b.title)
      }
      return 0
    })

    return filtered
  }, [searchedBookmarks, filterView, selectedTag, sortBy])

  // Open form for new bookmark
  const handleAddNew = () => {
    setEditingBookmark(null)
    setIsFormOpen(true)
  }

  // Open form for editing
  const handleEdit = (bookmark) => {
    setEditingBookmark(bookmark)
    setIsFormOpen(true)
  }

  // Save bookmark (create or update)
  const handleSave = async (bookmarkData) => {
    if (!db) return

    try {
      if (bookmarkData._id) {
        // Update existing
        await updateBookmark(db, bookmarkData._id, bookmarkData)
      } else {
        // Create new
        await createBookmark(db, bookmarkData)
      }
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      throw error
    }
  }

  // Delete bookmark
  const handleDelete = async (bookmarkId) => {
    if (!db) return

    try {
      await deleteBookmark(db, bookmarkId)
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      alert('Failed to delete bookmark: ' + error.message)
    }
  }

  // Toggle read later
  const handleToggleReadLater = async (bookmarkId) => {
    if (!db) return

    try {
      await toggleReadLater(db, bookmarkId)
    } catch (error) {
      console.error('Failed to toggle read later:', error)
      alert('Failed to update bookmark: ' + error.message)
    }
  }

  // Handle tag click - filter by tag
  const handleTagClick = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }

  // Clear filter
  const clearFilter = () => {
    setFilterView('all')
    setSelectedTag(null)
    setSearchQuery('')
  }

  // Loading state
  if (dbLoading || bookmarksLoading) {
    return (
      <div className="p-4 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary border-t-transparent"></div>
        <p className="mt-2 text-gray-600 dark:text-gray-400">Loading bookmarks...</p>
      </div>
    )
  }

  // Error state
  if (dbError) {
    return (
      <div className="p-4">
        <div className="bg-red-50 dark:bg-red-900 border border-red-200 dark:border-red-700 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-400">
            Failed to load database: {dbError.message}
          </p>
        </div>
      </div>
    )
  }

  // Empty state
  if (bookmarks.length === 0) {
    return (
      <div className="p-4">
        <div className="text-center py-12">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Welcome to Hypermark!
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Start by adding your first bookmark.
          </p>
          <Button onClick={handleAddNew}>Add Bookmark</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4">
      {/* Header with search and add button */}
      <div className="mb-6">
        {/* Search bar */}
        <BookmarkSearch
          value={searchQuery}
          onChange={setSearchQuery}
          resultCount={filteredBookmarks.length}
        />

        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Bookmarks
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({filteredBookmarks.length})
            </span>
          </h1>
          <Button onClick={handleAddNew}>+ Add Bookmark</Button>
        </div>

        {/* View filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <button
            onClick={clearFilter}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterView === 'all'
                ? 'bg-primary text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setFilterView('read-later')
              setSelectedTag(null)
            }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              filterView === 'read-later'
                ? 'bg-primary text-white'
                : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600'
            }`}
          >
            🔖 Read Later
          </button>

          {/* Active tag filter */}
          {filterView === 'tag' && selectedTag && (
            <Tag variant="selected" onRemove={clearFilter}>
              {selectedTag}
            </Tag>
          )}

          {/* Spacer */}
          <div className="flex-1"></div>

          {/* Sort dropdown */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="recent">Recent First</option>
            <option value="oldest">Oldest First</option>
            <option value="title">By Title</option>
          </select>
        </div>

        {/* Tag cloud */}
        {allTags.length > 0 && filterView !== 'tag' && (
          <div className="mb-4">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Filter by tag:
            </p>
            <div className="flex flex-wrap gap-1">
              {allTags.map((tag) => (
                <Tag
                  key={tag}
                  onClick={() => handleTagClick(tag)}
                  variant="gray"
                >
                  {tag}
                </Tag>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Bookmarks list */}
      {filteredBookmarks.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-600 dark:text-gray-400">
            No bookmarks found.
          </p>
          <Button onClick={clearFilter} variant="secondary" className="mt-4">
            Clear Filters
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredBookmarks.map((bookmark) => (
            <BookmarkItem
              key={bookmark._id}
              bookmark={bookmark}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onToggleReadLater={handleToggleReadLater}
              onTagClick={handleTagClick}
            />
          ))}
        </div>
      )}

      {/* Add/Edit form modal */}
      <BookmarkForm
        isOpen={isFormOpen}
        onClose={() => {
          setIsFormOpen(false)
          setEditingBookmark(null)
        }}
        onSave={handleSave}
        initialData={editingBookmark}
      />
    </div>
  )
}
