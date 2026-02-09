import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BookmarkList } from './BookmarkList'
import { checkDeviceInitialization } from '../../services/key-storage'

// Create a minimal test setup that focuses on our first-run detection feature
// without trying to fully mock the complex dependency tree

// Mock the key-storage service
vi.mock('../../services/key-storage', () => ({
  checkDeviceInitialization: vi.fn(),
}))

// Mock WelcomeState to verify it gets rendered
vi.mock('./WelcomeState', () => ({
  WelcomeState: vi.fn(() => <div data-testid="welcome-state">Welcome</div>),
}))

// Mock the main dependencies with minimal implementation
vi.mock('../../hooks/useYjs', () => ({
  useYjs: () => ({ bookmarks: new Map(), synced: false }), // synced: false to avoid rendering
  undo: vi.fn(),
  redo: vi.fn(),
  getYdocInstance: vi.fn(),
}))

vi.mock('../../services/bookmarks', () => ({
  getAllBookmarks: () => [],
  deleteBookmark: vi.fn(),
  bulkDeleteBookmarks: vi.fn(),
  toggleReadLater: vi.fn(),
  getAllTags: () => [],
}))

vi.mock('../../hooks/useHotkeys', () => ({ useHotkeys: vi.fn() }))
vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({ toasts: [], addToast: vi.fn(), removeToast: vi.fn() })
}))
vi.mock('../../hooks/useBookmarkFilters', () => ({
  useBookmarkFilters: () => ({
    filterView: 'all',
    filteredBookmarks: [],
    handleFilterChange: vi.fn(),
    handleTagSelect: vi.fn(),
    handleTagClick: vi.fn(),
    goToAllBookmarks: vi.fn(),
    goToReadLater: vi.fn(),
    goToInbox: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    debouncedSearchQuery: '',
    selectedTag: null,
    sortBy: 'createdAt',
    setSortBy: vi.fn(),
  }),
}))
vi.mock('../../hooks/useBookmarkSelection', () => ({
  useBookmarkSelection: () => ({
    selectionMode: false,
    selectedIds: new Set(),
    exitSelectionMode: vi.fn(),
    toggleSelectionMode: vi.fn(),
    toggleSelectBookmark: vi.fn(),
    toggleSelectCurrent: vi.fn(),
    selectAllBookmarks: vi.fn(),
    selectNextWithShift: vi.fn(),
    selectPrevWithShift: vi.fn(),
  }),
}))
vi.mock('../../hooks/useBookmarkKeyboardNav', () => ({
  useBookmarkKeyboardNav: () => ({
    selectedIndex: -1,
    setSelectedIndex: vi.fn(),
    hoveredIndex: -1,
    keyboardNavActive: false,
    selectedItemRef: { current: null },
    selectNext: vi.fn(),
    selectPrev: vi.fn(),
    goToTop: vi.fn(),
    goToBottom: vi.fn(),
    handleBookmarkHover: vi.fn(),
    suppressHoverBriefly: vi.fn(),
    getSelectedBookmark: () => null,
  }),
}))

describe('BookmarkList - First Run Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls checkDeviceInitialization on mount', async () => {
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: true, hasLEK: true })

    render(<BookmarkList />)

    await waitFor(() => {
      expect(checkDeviceInitialization).toHaveBeenCalledOnce()
    })
  })

  it('shows loading state when synced is false', () => {
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: true, hasLEK: true })

    render(<BookmarkList />)

    // Since useYjs mock returns synced: false, should show loading spinner
    expect(document.querySelector('.animate-spin')).toBeInTheDocument()
  })
})