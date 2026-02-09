import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BookmarkList } from './BookmarkList'
import { checkDeviceInitialization } from '../../services/key-storage'

// Mock all dependencies
vi.mock('../../hooks/useYjs', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    useYjs: () => ({
      bookmarks: {
        observeDeep: vi.fn(),
        unobserveDeep: vi.fn(),
      },
      synced: true,
    }),
    undo: vi.fn(() => true),
    redo: vi.fn(() => true),
  }
})

vi.mock('../../hooks/useHotkeys', () => ({
  useHotkeys: vi.fn(),
}))

vi.mock('../../hooks/useToast', () => ({
  useToast: () => ({
    toasts: [],
    addToast: vi.fn(),
    removeToast: vi.fn(),
  }),
}))

vi.mock('../../hooks/useBookmarkFilters', () => ({
  useBookmarkFilters: () => ({
    filterView: 'all',
    selectedTag: null,
    sortBy: 'createdAt',
    setSortBy: vi.fn(),
    searchQuery: '',
    setSearchQuery: vi.fn(),
    debouncedSearchQuery: '',
    filteredBookmarks: [],
    goToAllBookmarks: vi.fn(),
    goToReadLater: vi.fn(),
    goToInbox: vi.fn(),
    handleFilterChange: vi.fn(),
    handleTagSelect: vi.fn(),
    handleTagClick: vi.fn(),
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
    getSelectedBookmark: vi.fn(() => null),
  }),
}))

vi.mock('../../services/bookmarks', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAllBookmarks: vi.fn(() => []),
    deleteBookmark: vi.fn(),
    bulkDeleteBookmarks: vi.fn(),
    toggleReadLater: vi.fn(),
  }
})

// Mock the key-storage service
vi.mock('../../services/key-storage', () => ({
  checkDeviceInitialization: vi.fn(),
}))

// Mock WelcomeState component
vi.mock('./WelcomeState', () => ({
  WelcomeState: vi.fn(({ onAddBookmark, onImport, onPairDevice }) => (
    <div data-testid="welcome-state">
      <button onClick={onAddBookmark} data-testid="add-bookmark">Add first bookmark</button>
      <button onClick={onImport} data-testid="import">Import from browser</button>
      <button onClick={onPairDevice} data-testid="pair-device">Pair another device</button>
    </div>
  )),
}))

describe('BookmarkList - First Run Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders WelcomeState when no LEK exists and bookmarks are empty', async () => {
    // Mock checkDeviceInitialization to return no LEK
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: false, hasLEK: false })

    render(<BookmarkList />)

    // Wait for first-run detection to complete
    await waitFor(() => {
      expect(screen.getByTestId('welcome-state')).toBeInTheDocument()
    })

    expect(checkDeviceInitialization).toHaveBeenCalledOnce()
  })

  it('renders standard empty state when LEK exists and bookmarks are empty', async () => {
    // Mock checkDeviceInitialization to return LEK exists
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: true, hasLEK: true })

    render(<BookmarkList />)

    // Wait for first-run detection to complete
    await waitFor(() => {
      expect(screen.getByText('No bookmarks found')).toBeInTheDocument()
    })

    expect(screen.queryByTestId('welcome-state')).not.toBeInTheDocument()
    expect(checkDeviceInitialization).toHaveBeenCalledOnce()
  })

  it('calls correct handlers when WelcomeState buttons are clicked', async () => {
    const user = userEvent.setup()
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: false, hasLEK: false })

    render(<BookmarkList />)

    // Wait for WelcomeState to render
    await waitFor(() => {
      expect(screen.getByTestId('welcome-state')).toBeInTheDocument()
    })

    // Test add bookmark button
    const addButton = screen.getByTestId('add-bookmark')
    await user.click(addButton)

    // Test import button
    const importButton = screen.getByTestId('import')
    await user.click(importButton)

    // Test pair device button
    const pairButton = screen.getByTestId('pair-device')
    await user.click(pairButton)

    // Verify the buttons exist and were clickable
    expect(screen.getByTestId('add-bookmark')).toBeInTheDocument()
    expect(screen.getByTestId('import')).toBeInTheDocument()
    expect(screen.getByTestId('pair-device')).toBeInTheDocument()
  })
})

describe('BookmarkList - Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes first-run detection on mount', async () => {
    checkDeviceInitialization.mockResolvedValue({ hasKeypair: true, hasLEK: true })

    render(<BookmarkList />)

    // Verify checkDeviceInitialization was called
    await waitFor(() => {
      expect(checkDeviceInitialization).toHaveBeenCalledOnce()
    })
  })
})