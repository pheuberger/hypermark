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
import { SelectionActionBar } from './SelectionActionBar'
import { SettingsView } from '../ui/SettingsView'
import { HelpModal } from '../ui/HelpModal'
import { QuickTagModal } from '../ui/QuickTagModal'
import { ToastContainer } from '../ui/Toast'
import { PackageOpen } from '../ui/Icons'
import {
  getAllBookmarks,
  deleteBookmark,
  bulkDeleteBookmarks,
  toggleReadLater,
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
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagModalBookmark, setTagModalBookmark] = useState(null)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [keyboardNavActive, setKeyboardNavActive] = useState(false)
  const selectedItemRef = useRef(null)
  const searchInputRef = useRef(null)
  const inboxViewRef = useRef(null)
  const ignoreHoverRef = useRef(false)

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
      setKeyboardNavActive(true)
      setSelectedIndex((prev) => {
        const maxIndex = filteredBookmarks.length - 1
        if (maxIndex < 0) return -1
        // If no selection, start from hovered index or top
        if (prev === -1) {
          return hoveredIndex >= 0 ? hoveredIndex : 0
        }
        return prev < maxIndex ? prev + 1 : prev
      })
    }
  }, [filteredBookmarks.length, filterView, hoveredIndex])

  const selectPrev = useCallback(() => {
    if (filterView === 'inbox') {
      inboxViewRef.current?.selectPrev()
    } else {
      setKeyboardNavActive(true)
      setSelectedIndex((prev) => {
        const maxIndex = filteredBookmarks.length - 1
        if (maxIndex < 0) return -1
        // If no selection, start from hovered index or bottom
        if (prev === -1) {
          return hoveredIndex >= 0 ? hoveredIndex : maxIndex
        }
        if (prev <= 0) return 0
        return prev - 1
      })
    }
  }, [filterView, filteredBookmarks.length, hoveredIndex])

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

  const toggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        setSelectedIds(new Set())
      }
      return !prev
    })
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  const toggleSelectBookmark = useCallback((id, initiateSelection = false) => {
    if (initiateSelection && !selectionMode) {
      setSelectionMode(true)
      setSelectedIds(new Set([id]))
      return
    }

    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
        // Exit selection mode if no items remain selected
        if (next.size === 0) {
          setSelectionMode(false)
        }
      } else {
        next.add(id)
      }
      return next
    })
  }, [selectionMode])

  const toggleSelectCurrent = useCallback(() => {
    if (!selectionMode) return
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const bookmark = filteredBookmarks[selectedIndex]
      toggleSelectBookmark(bookmark._id)
    }
  }, [selectionMode, selectedIndex, filteredBookmarks, toggleSelectBookmark])

  const selectAllBookmarks = useCallback(() => {
    if (!selectionMode) {
      setSelectionMode(true)
    }
    setSelectedIds(new Set(filteredBookmarks.map(b => b._id)))
  }, [selectionMode, filteredBookmarks])

  const selectNextWithShift = useCallback(() => {
    if (filteredBookmarks.length === 0) return

    if (!selectionMode) {
      setSelectionMode(true)
    }

    // Select current item before moving
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const currentBookmark = filteredBookmarks[selectedIndex]
      setSelectedIds(prev => new Set(prev).add(currentBookmark._id))
    }

    // Move to next and select it
    setSelectedIndex(prev => {
      const maxIndex = filteredBookmarks.length - 1
      const nextIndex = prev < maxIndex ? prev + 1 : prev
      if (nextIndex >= 0 && nextIndex < filteredBookmarks.length) {
        const nextBookmark = filteredBookmarks[nextIndex]
        setSelectedIds(p => new Set(p).add(nextBookmark._id))
      }
      return nextIndex
    })
  }, [selectionMode, selectedIndex, filteredBookmarks])

  const selectPrevWithShift = useCallback(() => {
    if (filteredBookmarks.length === 0) return

    if (!selectionMode) {
      setSelectionMode(true)
    }

    // Select current item before moving
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      const currentBookmark = filteredBookmarks[selectedIndex]
      setSelectedIds(prev => new Set(prev).add(currentBookmark._id))
    }

    // Move to prev and select it
    setSelectedIndex(prev => {
      const prevIndex = prev > 0 ? prev - 1 : 0
      if (prevIndex >= 0 && prevIndex < filteredBookmarks.length) {
        const prevBookmark = filteredBookmarks[prevIndex]
        setSelectedIds(p => new Set(p).add(prevBookmark._id))
      }
      return prevIndex
    })
  }, [selectionMode, selectedIndex, filteredBookmarks])

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return

    const count = selectedIds.size
    try {
      bulkDeleteBookmarks(Array.from(selectedIds))
      addToast({
        message: `Deleted ${count} bookmark${count > 1 ? 's' : ''}`,
        action: () => {
          undo()
        },
        actionLabel: 'Undo',
        duration: 5000,
      })
      exitSelectionMode()
    } catch (error) {
      console.error('Failed to delete bookmarks:', error)
      addToast({ message: 'Failed to delete bookmarks', duration: 3000 })
    }
  }, [selectedIds, addToast, exitSelectionMode])

  // Get the currently selected bookmark
  const getSelectedBookmark = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < filteredBookmarks.length) {
      return filteredBookmarks[selectedIndex]
    }
    return null
  }, [selectedIndex, filteredBookmarks])

  // Shift+T: Open tag edit modal for selected bookmark
  const openTagModal = useCallback(() => {
    if (filterView === 'inbox') return
    if (isAddingNew || editingBookmarkId) return
    const bookmark = getSelectedBookmark()
    if (bookmark) {
      setTagModalBookmark(bookmark)
      setIsTagModalOpen(true)
    }
  }, [filterView, isAddingNew, editingBookmarkId, getSelectedBookmark])

  const closeTagModal = useCallback(() => {
    setIsTagModalOpen(false)
    setTagModalBookmark(null)
    // Ignore hover events briefly to prevent mouse position from disrupting keyboard selection
    ignoreHoverRef.current = true
    setTimeout(() => {
      ignoreHoverRef.current = false
    }, 100)
  }, [])

  // Shift+L: Toggle read later for selected bookmark
  const toggleReadLaterSelected = useCallback(() => {
    if (filterView === 'inbox') return
    if (isAddingNew || editingBookmarkId) return
    const bookmark = getSelectedBookmark()
    if (bookmark) {
      try {
        const newValue = toggleReadLater(bookmark._id)
        addToast({
          message: newValue ? 'Added to Read Later' : 'Removed from Read Later',
          duration: 2000,
        })
      } catch (error) {
        console.error('Failed to toggle read later:', error)
      }
    }
  }, [filterView, isAddingNew, editingBookmarkId, getSelectedBookmark, addToast])

  // c: Copy URL to clipboard
  const copySelectedUrl = useCallback(() => {
    if (filterView === 'inbox') return
    if (isAddingNew || editingBookmarkId) return
    const bookmark = getSelectedBookmark()
    if (bookmark) {
      navigator.clipboard.writeText(bookmark.url).then(() => {
        addToast({ message: 'URL copied to clipboard', duration: 2000 })
      }).catch((error) => {
        console.error('Failed to copy URL:', error)
        addToast({ message: 'Failed to copy URL', duration: 2000 })
      })
    }
  }, [filterView, isAddingNew, editingBookmarkId, getSelectedBookmark, addToast])

  const goToTop = useCallback(() => {
    if (filterView === 'inbox') {
      inboxViewRef.current?.goToTop?.()
    } else if (filteredBookmarks.length > 0) {
      setKeyboardNavActive(true)
      setSelectedIndex(0)
    }
  }, [filterView, filteredBookmarks.length])

  const goToBottom = useCallback(() => {
    if (filterView === 'inbox') {
      inboxViewRef.current?.goToBottom?.()
    } else if (filteredBookmarks.length > 0) {
      setKeyboardNavActive(true)
      setSelectedIndex(filteredBookmarks.length - 1)
    }
  }, [filterView, filteredBookmarks.length])

  const handleBookmarkHover = useCallback((index) => {
    // Ignore hover events right after modal closes to preserve keyboard selection
    if (ignoreHoverRef.current) return

    if (keyboardNavActive) {
      // Mouse moved - cancel keyboard selection and return to hover mode
      setKeyboardNavActive(false)
      setSelectedIndex(-1)
    }
    setHoveredIndex(index)
  }, [keyboardNavActive])

  useEffect(() => {
    setSelectedIndex(-1)
    setHoveredIndex(-1)
  }, [filteredBookmarks.length, filterView, selectedTag, debouncedSearchQuery])

  // Close inline card and exit selection mode when view/filter changes
  useEffect(() => {
    setIsAddingNew(false)
    setEditingBookmarkId(null)
    exitSelectionMode()
  }, [filterView, selectedTag, currentView, exitSelectionMode])

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
    'g g': goToTop,
    'shift+g': goToBottom,
    'shift+?': showHelp,
    'j': selectNext,
    'k': selectPrev,
    'shift+j': selectNextWithShift,
    'shift+k': selectPrevWithShift,
    'enter': openSelected,
    'o': openSelected,
    'e': editSelected,
    'd': selectionMode && selectedIds.size > 0 ? handleBulkDelete : deleteSelected,
    't': openTagModal,
    'l': toggleReadLaterSelected,
    'c': copySelectedUrl,
    'mod+k': focusSearch,
    'q': exitInbox,
    'mod+z': handleUndo,
    'mod+shift+z': handleRedo,
    'escape': exitSelectionMode,
    'space': toggleSelectCurrent,
    'mod+a': selectAllBookmarks,
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
              selectionMode={selectionMode}
              onToggleSelectionMode={toggleSelectionMode}
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
                              isChecked={selectedIds.has(bookmark._id)}
                              selectionMode={selectionMode}
                              keyboardNavActive={keyboardNavActive}
                              onEdit={handleEdit}
                              onDelete={handleDelete}
                              onTagClick={handleTagClick}
                              onToggleSelect={toggleSelectBookmark}
                              onMouseEnter={() => handleBookmarkHover(index)}
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

      <QuickTagModal
        isOpen={isTagModalOpen}
        onClose={closeTagModal}
        bookmark={tagModalBookmark}
      />

      <SelectionActionBar
        selectedCount={selectedIds.size}
        onDelete={handleBulkDelete}
        onCancel={exitSelectionMode}
      />

      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}