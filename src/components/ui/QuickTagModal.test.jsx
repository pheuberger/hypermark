import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { QuickTagModal } from './QuickTagModal.jsx'

// jsdom doesn't implement scrollIntoView
Element.prototype.scrollIntoView = vi.fn()

// Mock bookmarks service
vi.mock('../../services/bookmarks', () => ({
  getAllTags: vi.fn(() => ['react', 'javascript', 'design']),
  updateBookmark: vi.fn(),
  bulkAddTags: vi.fn(),
}))

// Mock Icons (lucide re-exports)
vi.mock('./Icons', () => ({
  Hash: (props) => <svg data-testid="icon-hash" {...props} />,
  Check: (props) => <svg data-testid="icon-check" {...props} />,
  Plus: (props) => <svg data-testid="icon-plus" {...props} />,
}))

import { updateBookmark, bulkAddTags } from '../../services/bookmarks'

describe('QuickTagModal', () => {
  const mockOnClose = vi.fn()
  const singleBookmark = {
    _id: 'bookmark:123',
    title: 'My Bookmark',
    tags: ['react'],
  }

  beforeEach(() => {
    mockOnClose.mockClear()
    updateBookmark.mockClear()
    bulkAddTags.mockClear()
  })

  // --- Single mode tests ---

  it('renders bookmark title in header (single mode)', () => {
    render(
      <QuickTagModal isOpen={true} onClose={mockOnClose} bookmark={singleBookmark} />
    )
    expect(screen.getByText('My Bookmark')).toBeInTheDocument()
  })

  it('save calls updateBookmark with bookmark ID and tags (single mode)', () => {
    render(
      <QuickTagModal isOpen={true} onClose={mockOnClose} bookmark={singleBookmark} />
    )
    // The modal's onKeyDown is on the inner div, so fire Enter on the modal container
    const input = screen.getByPlaceholderText('Change tags...')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(updateBookmark).toHaveBeenCalledWith('bookmark:123', { tags: ['react'] })
    expect(bulkAddTags).not.toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  // --- Bulk mode tests ---

  it('renders "Tag N bookmarks" in header (bulk mode)', () => {
    render(
      <QuickTagModal
        isOpen={true}
        onClose={mockOnClose}
        bookmark={null}
        bookmarkIds={['a', 'b', 'c']}
      />
    )
    expect(screen.getByText('Tag 3 bookmarks')).toBeInTheDocument()
  })

  it('starts with no tags selected in bulk mode', () => {
    render(
      <QuickTagModal
        isOpen={true}
        onClose={mockOnClose}
        bookmark={null}
        bookmarkIds={['a', 'b']}
      />
    )
    // All tag options should be unchecked — no check icons visible
    const checkIcons = screen.queryAllByTestId('icon-check')
    expect(checkIcons).toHaveLength(0)
  })

  it('save calls bulkAddTags with correct IDs and selected tags (bulk mode)', () => {
    render(
      <QuickTagModal
        isOpen={true}
        onClose={mockOnClose}
        bookmark={null}
        bookmarkIds={['a', 'b', 'c']}
      />
    )
    const input = screen.getByPlaceholderText('Change tags...')
    // Toggle "react" tag via Space key (first item is selected by default)
    fireEvent.keyDown(input, { key: ' ' })
    // Now press Enter to save
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(bulkAddTags).toHaveBeenCalledWith(['a', 'b', 'c'], ['react'])
    expect(updateBookmark).not.toHaveBeenCalled()
    expect(mockOnClose).toHaveBeenCalled()
  })

  it('returns null when neither bookmark nor bookmarkIds provided', () => {
    const { container } = render(
      <QuickTagModal isOpen={true} onClose={mockOnClose} bookmark={null} bookmarkIds={null} />
    )
    expect(container.innerHTML).toBe('')
  })

  // --- Shared tests ---

  it('Escape closes without saving (single mode)', () => {
    render(
      <QuickTagModal isOpen={true} onClose={mockOnClose} bookmark={singleBookmark} />
    )
    const input = screen.getByPlaceholderText('Change tags...')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
    expect(updateBookmark).not.toHaveBeenCalled()
    expect(bulkAddTags).not.toHaveBeenCalled()
  })

  it('Escape closes without saving (bulk mode)', () => {
    render(
      <QuickTagModal
        isOpen={true}
        onClose={mockOnClose}
        bookmark={null}
        bookmarkIds={['a', 'b']}
      />
    )
    const input = screen.getByPlaceholderText('Change tags...')
    // Toggle a tag first to ensure there's something to discard
    fireEvent.keyDown(input, { key: ' ' })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(mockOnClose).toHaveBeenCalled()
    expect(bulkAddTags).not.toHaveBeenCalled()
  })
})
