import { useState, useMemo, useEffect } from 'preact/hooks'
import { useYjs } from '../../hooks/useYjs'
import { useSearch, useDebounce } from '../../hooks/useSearch'
import { BookmarkItem } from './BookmarkItem'
import { BookmarkForm } from './BookmarkForm'
import { TagSidebar } from './TagSidebar'
import { FilterBar } from './FilterBar'
import { Button } from '../ui/Button'
import { PackageOpen, Plus } from '../ui/Icons'
import {
  getAllBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  toggleReadLater,
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
      setBookmarks(loaded)
    }

    loadBookmarks()

    // Observe changes to bookmarks map
    const observer = () => {
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
  const [sortBy, setSortBy] = useState('recent') // 'recent', 'oldest', 'title', 'updated'
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false) // Mobile sidebar toggle

  // Debounce search query
  const debouncedSearchQuery = useDebounce(searchQuery, 300)

  // Apply search filter
  const searchedBookmarks = useSearch(bookmarks, debouncedSearchQuery)

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
      } else if (sortBy === 'updated') {
        return b.updatedAt - a.updatedAt
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
        updateBookmark(bookmarkData._id, bookmarkData)
      } else {
        createBookmark(bookmarkData)
      }
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      alert('Failed to save bookmark: ' + error.message)
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

  const handleTagClick = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }

  const handleFilterChange = (view) => {
    setFilterView(view)
    setSelectedTag(null)
  }

  const handleTagSelect = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }

  // Loading state
  if (!synced) {
    return (
      <div className="flex h-screen items-center justify-center bg-base-100">
        <span className="loading loading-spinner loading-lg opacity-50"></span>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden relative bg-base-100 text-base-content">
      {/* Left Sidebar */}
      <TagSidebar
        bookmarks={bookmarks}
        selectedFilter={filterView}
        selectedTag={selectedTag}
        onFilterChange={handleFilterChange}
        onTagSelect={handleTagSelect}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {/* Filter Bar */}
        <FilterBar
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          sortBy={sortBy}
          onSortChange={setSortBy}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          onAddNew={handleAddNew}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-base-100">
          <div className="px-4 pb-12 pt-1 max-w-5xl mx-auto space-y-1">
             {filteredBookmarks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 opacity-50">
                  <PackageOpen className="w-12 h-12 mb-4 stroke-1" />
                  <p className="text-sm font-medium">No bookmarks found</p>
                  {filterView !== 'all' && (
                     <button onClick={() => handleFilterChange('all')} className="btn btn-link btn-sm mt-2 text-primary no-underline hover:underline">Clear filters</button>
                  )}
                </div>
             ) : (
                filteredBookmarks.map((bookmark) => (
                  <BookmarkItem
                    key={bookmark._id}
                    bookmark={bookmark}
                    onEdit={handleEdit}
                    onDelete={handleDelete}
                    onTagClick={handleTagClick}
                  />
                ))
             )}
          </div>
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
