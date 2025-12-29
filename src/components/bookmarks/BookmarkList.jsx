import { useState, useMemo, useEffect } from 'preact/hooks'
import { useYjs } from '../../hooks/useYjs'
import { useSearch, useDebounce } from '../../hooks/useSearch'
import { BookmarkItem } from './BookmarkItem'
import { BookmarkForm } from './BookmarkForm'
import { TagSidebar } from './TagSidebar'
import { FilterBar } from './FilterBar'
import { Button } from '../ui/Button'
import { PackageOpen } from '../ui/Icons'
import {
  getAllBookmarks,
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
  const { bookmarks: bookmarksMap, synced } = useYjs()
  const [bookmarks, setBookmarks] = useState([])

  // Load and observe bookmarks
  useEffect(() => {
    // Initial load
    const loadBookmarks = () => {
      const loaded = getAllBookmarks()
      console.log('[BookmarkList] Loaded bookmarks:', loaded.length, loaded)
      setBookmarks(loaded)
    }

    loadBookmarks()

    // Observe changes to bookmarks map
    const observer = () => {
      console.log('[BookmarkList] Bookmarks changed, reloading')
      loadBookmarks()
    }

    bookmarksMap.observe(observer)

    return () => {
      bookmarksMap.unobserve(observer)
    }
  }, [bookmarksMap])

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
  const handleSave = (bookmarkData) => {
    try {
      if (bookmarkData._id) {
        // Update existing
        updateBookmark(bookmarkData._id, bookmarkData)
      } else {
        // Create new
        createBookmark(bookmarkData)
      }
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      alert('Failed to save bookmark: ' + error.message)
      throw error
    }
  }

  // Delete bookmark
  const handleDelete = (bookmarkId) => {
    try {
      deleteBookmark(bookmarkId)
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      alert('Failed to delete bookmark: ' + error.message)
    }
  }

  // Toggle read later
  const handleToggleReadLater = (bookmarkId) => {
    try {
      toggleReadLater(bookmarkId)
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

  // Handle filter change from sidebar
  const handleFilterChange = (view) => {
    setFilterView(view)
    setSelectedTag(null)
  }

  // Handle tag selection from sidebar
  const handleTagSelect = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }

  // Loading state
  if (!synced) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <span className="loading loading-spinner loading-lg text-primary"></span>
            <p className="mt-2 opacity-70">Loading bookmarks...</p>
          </div>
        </div>
      </div>
    )
  }

  // Empty state
  if (bookmarks.length === 0) {
    return (
      <div className="flex h-screen">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center py-12 px-4">
            <PackageOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <h2 className="text-2xl font-bold mb-2">Welcome to Hypermark!</h2>
            <p className="opacity-70 mb-6">Start by adding your first bookmark.</p>
            <Button onClick={handleAddNew}>Add Bookmark</Button>
          </div>
        </div>

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

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar */}
      <TagSidebar
        bookmarks={bookmarks}
        selectedFilter={filterView}
        selectedTag={selectedTag}
        onFilterChange={handleFilterChange}
        onTagSelect={handleTagSelect}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Filter Bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedFilter={filterView}
          selectedTag={selectedTag}
          onClearFilter={clearFilter}
          sortBy={sortBy}
          onSortChange={setSortBy}
          resultCount={filteredBookmarks.length}
          onAddNew={handleAddNew}
        />

        {/* Bookmarks List */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredBookmarks.length === 0 ? (
            <div className="text-center py-12">
              <p className="opacity-70">No bookmarks found.</p>
              <Button onClick={clearFilter} variant="secondary" className="mt-4">
                Clear Filters
              </Button>
            </div>
          ) : (
            <div className="space-y-4 max-w-4xl mx-auto">
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
        </div>
      </div>

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
