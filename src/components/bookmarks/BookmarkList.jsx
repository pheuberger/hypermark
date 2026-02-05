import { useState, useMemo, useEffect, useCallback, useRef } from 'react'
import { useYjs, undo, redo } from '../../hooks/useYjs'
import { useSearch, useDebounce } from '../../hooks/useSearch'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useToast } from '../../hooks/useToast'
import { BookmarkItem } from './BookmarkItem'
import { BookmarkInlineCard } from './BookmarkInlineCard'
import { InboxView } from './InboxView'
import { TagSidebar } from './TagSidebar'
import { FilterBar } from './FilterBar'
import { SettingsView } from '../ui/SettingsView'
import { HelpModal } from '../ui/HelpModal'
import { ToastContainer } from '../ui/Toast'
import { PackageOpen } from '../ui/Icons'
import {
  getAllBookmarks,
  deleteBookmark,
} from '../../services/bookmarks'

export function BookmarkList() {
  const { bookmarks: bookmarksMap, synced } = useYjs()
  const [bookmarks, setBookmarks] = useState([])
  const { toasts, addToast, removeToast } = useToast()
  const [currentView, setCurrentView] = useState('bookmarks')

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

  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editingBookmarkId, setEditingBookmarkId] = useState(null)
  const [filterView, setFilterView] = useState('all')
  const [selectedTag, setSelectedTag] = useState(null)
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const selectedItemRef = useRef(null)
  const searchInputRef = useRef(null)
  const inboxViewRef = useRef(null)

  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const searchedBookmarks = useSearch(bookmarks, debouncedSearchQuery)

  const openNewBookmarkForm = useCallback(() => {
    setEditingBookmarkId(null)
    setIsAddingNew(true)
  }, [])

  const goToAllBookmarks = useCallback(() => {
    setFilterView('all')
    setSelectedTag(null)
    setSearchQuery('')
    setCurrentView('bookmarks')
  }, [])

  const goToReadLater = useCallback(() => {
    setFilterView('read-later')
    setSelectedTag(null)
    setCurrentView('bookmarks')
  }, [])

  const goToInbox = useCallback(() => {
    setFilterView('inbox')
    setSelectedTag(null)
    setCurrentView('bookmarks')
  }, [])

  const goToSettings = useCallback(() => {
    setCurrentView('settings')
  }, [])

  const showHelp = useCallback(() => {
    setIsHelpOpen(true)
  }, [])

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [])

  const filteredBookmarks = useMemo(() => {
    let filtered = [...searchedBookmarks]

    if (filterView === 'read-later') {
      filtered = filtered.filter((b) => b.readLater)
    } else if (filterView === 'inbox') {
      filtered = filtered.filter((b) => b.inbox)
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

  const handleSearchSubmit = useCallback(() => {
    if (filteredBookmarks.length > 0) {
      setSelectedIndex(0)
      searchInputRef.current?.blur()
    }
  }, [filteredBookmarks.length])

  const selectNext = useCallback(() => {
    if (filterView === 'inbox') {
      inboxViewRef.current?.selectNext()
    } else {
      setSelectedIndex((prev) => {
        const maxIndex = filteredBookmarks.length - 1
        if (maxIndex < 0) return -1
        return prev < maxIndex ? prev + 1 : prev
      })
    }
  }, [filteredBookmarks.length, filterView])

  const selectPrev = useCallback(() => {
    if (filterView === 'inbox') {
      inboxViewRef.current?.selectPrev()
    } else {
      setSelectedIndex((prev) => {
        const maxIndex = filteredBookmarks.length - 1
        if (maxIndex < 0) return -1
        if (prev === -1) return maxIndex
        if (prev === 0) return 0
        return prev - 1
      })
    }
  }, [filterView, filteredBookmarks.length])

  const openSelected = useCallback(() => {
    // Don't open URL if we're adding/editing
    if (isAddingNew || editingBookmarkId) return
    if (filterView === 'inbox') {
      inboxViewRef.current?.handleEnter()
    } else if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const bookmark = filteredBookmarks[selectedIndex]
      window.open(bookmark.url, '_blank', 'noopener,noreferrer')
    }
  }, [selectedIndex, filteredBookmarks, filterView, isAddingNew, editingBookmarkId])

  const exitInbox = useCallback(() => {
    if (filterView === 'inbox') {
      goToAllBookmarks()
    }
  }, [filterView, goToAllBookmarks])

  const editSelected = useCallback(() => {
    if (filterView === 'inbox') return
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const bookmark = filteredBookmarks[selectedIndex]
      setEditingBookmarkId(bookmark._id)
    }
  }, [selectedIndex, filteredBookmarks, filterView])

  const deleteSelected = useCallback(() => {
    if (filterView === 'inbox') return
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const bookmark = filteredBookmarks[selectedIndex]
      try {
        deleteBookmark(bookmark._id)
        addToast({
          message: `Deleted "${bookmark.title}"`,
          action: () => {
            undo()
          },
          actionLabel: 'Undo',
          duration: 5000,
        })
      } catch (error) {
        console.error('Failed to delete bookmark:', error)
      }
    }
  }, [selectedIndex, filteredBookmarks, filterView, addToast])

  const handleUndo = useCallback(() => {
    if (undo()) {
      addToast({ message: 'Undone', duration: 2000 })
    }
  }, [addToast])

  const handleRedo = useCallback(() => {
    if (redo()) {
      addToast({ message: 'Redone', duration: 2000 })
    }
  }, [addToast])

  useEffect(() => {
    setSelectedIndex(-1)
  }, [filteredBookmarks.length, filterView, selectedTag, debouncedSearchQuery])

  // Close inline card when view/filter changes
  useEffect(() => {
    setIsAddingNew(false)
    setEditingBookmarkId(null)
  }, [filterView, selectedTag, currentView])

  useEffect(() => {
    if (selectedIndex >= 0 && selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedIndex])

  useHotkeys({
    'g n': openNewBookmarkForm,
    'g a': goToAllBookmarks,
    'g i': goToInbox,
    'g l': goToReadLater,
    'g s': goToSettings,
    'shift+?': showHelp,
    'j': selectNext,
    'k': selectPrev,
    'enter': openSelected,
    'e': editSelected,
    'd': deleteSelected,
    'mod+k': focusSearch,
    'q': exitInbox,
    'mod+z': handleUndo,
    'mod+shift+z': handleRedo,
  })

  const handleAddNew = openNewBookmarkForm

  const handleEdit = (bookmark) => {
    setEditingBookmarkId(bookmark._id)
  }

  const handleCloseInlineCard = useCallback(() => {
    setIsAddingNew(false)
    setEditingBookmarkId(null)
  }, [])

  const handleDelete = useCallback((bookmarkId) => {
    const bookmark = bookmarks.find(b => b._id === bookmarkId)
    const bookmarkTitle = bookmark?.title || 'Bookmark'
    try {
      deleteBookmark(bookmarkId)
      addToast({
        message: `Deleted "${bookmarkTitle}"`,
        action: () => {
          undo()
        },
        actionLabel: 'Undo',
        duration: 5000,
      })
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      addToast({ message: 'Failed to delete bookmark', duration: 3000 })
    }
  }, [bookmarks, addToast])

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
      <div className="flex h-dvh items-center justify-center bg-background">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full opacity-50"></div>
      </div>
    )
  }

  return (
    <div className="flex h-dvh overflow-hidden relative bg-background text-foreground">
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
              onSearchSubmit={handleSearchSubmit}
              sortBy={sortBy}
              onSortChange={setSortBy}
              onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
              onAddNew={handleAddNew}
              searchInputRef={searchInputRef}
            />

            <div className="flex-1 overflow-y-auto bg-background">
              <div className="px-4 pb-12 pt-1 space-y-1">
                 {filterView === 'inbox' ? (
                    <InboxView
                      ref={inboxViewRef}
                      bookmarks={filteredBookmarks}
                    />
                 ) : (
                    <>
                      {/* New bookmark inline card at top */}
                      {isAddingNew && (
                        <div className="mb-3 pt-2">
                          <BookmarkInlineCard
                            isNew={true}
                            onDone={handleCloseInlineCard}
                            onDiscard={handleCloseInlineCard}
                          />
                        </div>
                      )}

                      {filteredBookmarks.length === 0 && !isAddingNew ? (
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
                        filteredBookmarks.map((bookmark, index) => (
                          editingBookmarkId === bookmark._id ? (
                            <BookmarkInlineCard
                              key={bookmark._id}
                              ref={index === selectedIndex ? selectedItemRef : null}
                              bookmark={bookmark}
                              onDone={handleCloseInlineCard}
                              onDiscard={handleCloseInlineCard}
                            />
                          ) : (
                            <BookmarkItem
                              key={bookmark._id}
                              ref={index === selectedIndex ? selectedItemRef : null}
                              bookmark={bookmark}
                              isSelected={index === selectedIndex}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onTagClick={handleTagClick}
                            />
                          )
                        ))
                      )}
                    </>
                 )}
              </div>
            </div>
          </>
        )}

        {currentView === 'settings' && (
          <div className="flex-1 overflow-y-auto bg-background">
            <SettingsView onBack={() => setCurrentView('bookmarks')} />
          </div>
        )}
      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}