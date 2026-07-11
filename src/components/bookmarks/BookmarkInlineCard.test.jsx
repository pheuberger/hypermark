import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BookmarkInlineCard } from './BookmarkInlineCard.jsx'

// jsdom doesn't implement scrollIntoView (used by TagInput dropdown)
Element.prototype.scrollIntoView = vi.fn()

vi.mock('../../services/bookmarks', () => ({
  getAllTags: vi.fn(() => ['react', 'design']),
  updateBookmark: vi.fn(),
}))

import { updateBookmark } from '../../services/bookmarks'

describe('BookmarkInlineCard (edit bookmark)', () => {
  const bookmark = {
    _id: 'bookmark:123',
    url: 'https://example.com',
    title: 'Example',
    description: '',
    tags: [],
    readLater: false,
  }

  beforeEach(() => {
    updateBookmark.mockClear()
  })

  const renderCard = (props = {}) =>
    render(
      <BookmarkInlineCard bookmark={bookmark} onDone={vi.fn()} onDiscard={vi.fn()} {...props} />
    )

  it('focuses the title input on open', () => {
    renderCard()
    expect(screen.getByPlaceholderText('Title')).toHaveFocus()
  })

  it('shows the URL as a link, not an editable field', () => {
    renderCard()
    const link = screen.getByRole('link', { name: 'https://example.com' })
    expect(link).toHaveAttribute('href', 'https://example.com')
  })

  it('saves title changes on blur', () => {
    renderCard()
    const title = screen.getByPlaceholderText('Title')
    fireEvent.change(title, { target: { value: 'Renamed' } })
    fireEvent.blur(title)
    expect(updateBookmark).toHaveBeenCalledWith(
      'bookmark:123',
      expect.objectContaining({ title: 'Renamed' })
    )
  })

  it('saves description changes on blur', () => {
    renderCard()
    const desc = screen.getByPlaceholderText('Add description...')
    fireEvent.change(desc, { target: { value: 'Some notes' } })
    fireEvent.blur(desc)
    expect(updateBookmark).toHaveBeenCalledWith(
      'bookmark:123',
      expect.objectContaining({ description: 'Some notes' })
    )
  })

  it('saves read-later toggles immediately', () => {
    renderCard()
    fireEvent.click(screen.getByRole('checkbox'))
    expect(updateBookmark).toHaveBeenCalledWith(
      'bookmark:123',
      expect.objectContaining({ readLater: true })
    )
  })

  it('calls onDone after saving via the Done button', () => {
    const onDone = vi.fn()
    renderCard({ onDone })
    fireEvent.click(screen.getByRole('button', { name: /Done/ }))
    expect(updateBookmark).toHaveBeenCalled()
    expect(onDone).toHaveBeenCalled()
  })

  it('closes without saving on Escape', () => {
    const onDiscard = vi.fn()
    renderCard({ onDiscard })
    fireEvent.keyDown(screen.getByPlaceholderText('Title'), { key: 'Escape' })
    expect(onDiscard).toHaveBeenCalled()
  })
})
