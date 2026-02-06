import { useState, useEffect, useCallback, useRef } from 'react'
import { useYjs, undo, redo } from '../../hooks/useYjs'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useToast } from '../../hooks/useToast'
import { useBookmarkFilters } from '../../hooks/useBookmarkFilters'
import { useBookmarkSelection } from '../../hooks/useBookmarkSelection'
import { useBookmarkKeyboardNav } from '../../hooks/useBookmarkKeyboardNav'
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [isTagModalOpen, setIsTagModalOpen] = useState(false)
  const [tagModalBookmark, setTagModalBookmark] = useState(null)
  const searchInputRef = useRef(null)
  const inboxViewRef = useRef(null)

  // Extracted hooks
  const {
    filterView,
    selectedTag,
    sortBy,
    setSortBy,
    searchQuery,
    setSearchQuery,
    debouncedSearchQuery,
    filteredBookmarks,
    goToAllBookmarks,
    goToReadLater,
    goToInbox,
    handleFilterChange: filterChange,
    handleTagSelect: tagSelect,
    handleTagClick,
  } = useBookmarkFilters(bookmarks)

  const {
    selectedIndex,
    setSelectedIndex,
    hoveredIndex,
    keyboardNavActive,
    selectedItemRef,
    selectNext,
    selectPrev,
    goToTop,
    goToBottom,
    handleBookmarkHover,
    suppressHoverBriefly,
    getSelectedBookmark,
  } = useBookmarkKeyboardNav(filteredBookmarks, {
    filterView,
    inboxViewRef,
    selectedTag,
    debouncedSearchQuery,
  })

  const {
    selectionMode,
    selectedIds,
    exitSelectionMode,
    toggleSelectionMode,
    toggleSelectBookmark,
    toggleSelectCurrent,
    selectAllBookmarks,
    selectNextWithShift,
    selectPrevWithShift,
  } = useBookmarkSelection(filteredBookmarks, { selectedIndex, setSelectedIndex })

  // Wrap filter change to also set currentView
  const handleFilterChange = useCallback((view) => {
    filterChange(view)
    setCurrentView('bookmarks')
  }, [filterChange])

  const handleTagSelect = useCallback((tag) => {
    tagSelect(tag)
    setCurrentView('bookmarks')
  }, [tagSelect])

  // Navigation callbacks that also set currentView
  const navToAllBookmarks = useCallback(() => {
    goToAllBookmarks()
    setCurrentView('bookmarks')
  }, [goToAllBookmarks])

  const navToReadLater = useCallback(() => {
    goToReadLater()
    setCurrentView('bookmarks')
  }, [goToReadLater])

  const navToInbox = useCallback(() => {
    goToInbox()
    setCurrentView('bookmarks')
  }, [goToInbox])

  const goToSettings = useCallback(() => {
    setCurrentView('settings')
  }, [])

  const openNewBookmarkForm = useCallback(() => {
    setEditingBookmarkId(null)
    setIsAddingNew(true)
  }, [])

  const showHelp = useCallback(() => {
    setIsHelpOpen(true)
  }, [])

  const focusSearch = useCallback(() => {
    searchInputRef.current?.focus()
    searchInputRef.current?.select()
  }, [])

  const handleSearchSubmit = useCallback(() => {
    if (filteredBookmarks.length > 0) {
      setSelectedIndex(0)
      searchInputRef.current?.blur()
    }
  }, [filteredBookmarks.length, setSelectedIndex])

  const openSelected = useCallback(() => {
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
      navToAllBookmarks()
    }
  }, [filterView, navToAllBookmarks])

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
          action: () => { undo() },
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

  const handleBulkDelete = useCallback(() => {
    if (selectedIds.size === 0) return

    const count = selectedIds.size
    try {
      bulkDeleteBookmarks(Array.from(selectedIds))
      addToast({
        message: `Deleted ${count} bookmark${count > 1 ? 's' : ''}`,
        action: () => { undo() },
        actionLabel: 'Undo',
        duration: 5000,
      })
      exitSelectionMode()
    } catch (error) {
      console.error('Failed to delete bookmarks:', error)
      addToast({ message: 'Failed to delete bookmarks', duration: 3000 })
    }
  }, [selectedIds, addToast, exitSelectionMode])

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
    suppressHoverBriefly()
  }, [suppressHoverBriefly])

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

  // Close inline card and exit selection mode when view/filter changes
  useEffect(() => {
    setIsAddingNew(false)
    setEditingBookmarkId(null)
    exitSelectionMode()
  }, [filterView, selectedTag, currentView, exitSelectionMode])

  useHotkeys({
    'g n': openNewBookmarkForm,
    'g a': navToAllBookmarks,
    'g i': navToInbox,
    'g l': navToReadLater,
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
        action: () => { undo() },
        actionLabel: 'Undo',
        duration: 5000,
      })
    } catch (error) {
      console.error('Failed to delete bookmark:', error)
      addToast({ message: 'Failed to delete bookmark', duration: 3000 })
    }
  }, [bookmarks, addToast])

  const handleHomeClick = () => {
    goToAllBookmarks()
    setCurrentView('bookmarks')
    setIsSidebarOpen(false)
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
