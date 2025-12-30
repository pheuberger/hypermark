import { useState, useMemo, useEffect } from 'react'
import { useYjs } from '../../hooks/useYjs'
import { useSearch, useDebounce } from '../../hooks/useSearch'
import { BookmarkItem } from './BookmarkItem'
import { BookmarkForm } from './BookmarkForm'
import { TagSidebar } from './TagSidebar'
import { FilterBar } from './FilterBar'
import { SettingsView } from '../ui/SettingsView'
import { PackageOpen } from '../ui/Icons'
import {
  getAllBookmarks,
  createBookmark,
  updateBookmark,
  deleteBookmark,
} from '../../services/bookmarks'

export function BookmarkList() {
  const { bookmarks: bookmarksMap, synced } = useYjs()
  const [bookmarks, setBookmarks] = useState([])
  const [currentView, setCurrentView] = useState('bookmarks') // 'bookmarks' | 'settings'

  useEffect(() => {
    const loadBookmarks = () => {
      const loaded = getAllBookmarks()
      setBookmarks(loaded)
    }

    loadBookmarks()

    const observer = () => {
      loadBookmarks()
    }

    bookmarksMap.observeDeep(observer)

    return () => {
      bookmarksMap.unobserveDeep(observer)
    }
  }, [bookmarksMap])

  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingBookmark, setEditingBookmark] = useState(null)
  const [filterView, setFilterView] = useState('all')
  const [selectedTag, setSelectedTag] = useState(null)
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const searchedBookmarks = useSearch(bookmarks, debouncedSearchQuery)

  const filteredBookmarks = useMemo(() => {
    let filtered = [...searchedBookmarks]

    if (filterView === 'read-later') {
      filtered = filtered.filter((b) => b.readLater)
    } else if (filterView === 'tag' && selectedTag) {
      filtered = filtered.filter(
        (b) => Array.isArray(b.tags) && b.tags.includes(selectedTag)
      )
    }

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

  const handleAddNew = () => {
    setEditingBookmark(null)
    setIsFormOpen(true)
  }

  const handleEdit = (bookmark) => {
    setEditingBookmark(bookmark)
    setIsFormOpen(true)
  }

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

  const handleDelete = (bookmarkId) => {
    try {
      deleteBookmark(bookmarkId)
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      alert('Failed to delete bookmark: ' + error.message)
    }
  }

  const handleTagClick = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
  }

  const handleFilterChange = (view) => {
    setFilterView(view)
    setSelectedTag(null)
    setCurrentView('bookmarks')
  }

  const handleHomeClick = () => {
    setFilterView('all')
    setSelectedTag(null)
    setSearchQuery('')
    setCurrentView('bookmarks')
    setIsSidebarOpen(false)
  }

  const handleTagSelect = (tag) => {
    setFilterView('tag')
    setSelectedTag(tag)
    setCurrentView('bookmarks')
  }

  if (!synced) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full opacity-50"></div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden relative bg-background text-foreground">
      <TagSidebar
        bookmarks={bookmarks}
        selectedFilter={filterView}
        selectedTag={selectedTag}
        onFilterChange={handleFilterChange}
        onTagSelect={handleTagSelect}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onOpenSettings={() => {
          setCurrentView('settings')
          setIsSidebarOpen(false)
        }}
        isSettingsActive={currentView === 'settings'}
        onHomeClick={handleHomeClick}
      />

      <div className="flex-1 flex flex-col overflow-hidden relative">
        {currentView === 'bookmarks' && (
          <>
            <FilterBar
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onAddNew={handleAddNew}
            />

            <div className="flex-1 overflow-y-auto bg-background">
              <div className="px-4 pb-12 pt-1 space-y-1">
                 {filteredBookmarks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 opacity-50">
                      <PackageOpen className="w-12 h-12 mb-4 stroke-1" />
                      <p className="text-sm font-medium">No bookmarks found</p>
                      {filterView !== 'all' && (
                         <button 
                           onClick={() => handleFilterChange('all')} 
                           className="mt-2 text-sm text-primary hover:underline"
                         >
                           Clear filters
                         </button>
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
          </>
        )}

        {currentView === 'settings' && (
          <div className="flex-1 overflow-y-auto bg-background">
            <SettingsView />
          </div>
        )}
      </div>

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
