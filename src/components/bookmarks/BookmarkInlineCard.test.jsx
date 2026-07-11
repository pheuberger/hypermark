import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { BookmarkInlineCard } from './BookmarkInlineCard.jsx'

// jsdom doesn't implement scrollIntoView (used by TagInput dropdown)
Element.prototype.scrollIntoView = vi.fn()

vi.mock('../../services/bookmarks', () => ({
  getAllTags: vi.fn(() => ['react', 'design']),
  createBookmark: vi.fn(() => ({ id: 'bookmark:new' })),
  updateBookmark: vi.fn(),
}))

import { createBookmark, updateBookmark } from '../../services/bookmarks'

function mockClipboard(readTextImpl) {
  Object.defineProperty(navigator, 'clipboard', {
    value: readTextImpl ? { readText: readTextImpl } : undefined,
    configurable: true,
  })
}

describe('BookmarkInlineCard (new bookmark)', () => {
  const onDone = vi.fn()
  const onDiscard = vi.fn()

  beforeEach(() => {
    onDone.mockClear()
    onDiscard.mockClear()
    createBookmark.mockClear()
    updateBookmark.mockClear()
    mockClipboard(vi.fn(async () => 'https://example.com/article'))
  })

  afterEach(() => {
    mockClipboard(null)
  })

  const renderNew = () =>
    render(<BookmarkInlineCard isNew={true} onDone={onDone} onDiscard={onDiscard} />)

  it('gives the URL input mobile-friendly keyboard attributes', () => {
    renderNew()
    const url = screen.getByPlaceholderText('https://example.com')
    expect(url).toHaveAttribute('inputmode', 'url')
    expect(url).toHaveAttribute('autocapitalize', 'none')
    expect(url).toHaveAttribute('autocorrect', 'off')
    expect(url).toHaveAttribute('spellcheck', 'false')
    expect(url).toHaveAttribute('enterkeyhint', 'go')
  })

  it('focuses the URL input on open', () => {
    renderNew()
    expect(screen.getByPlaceholderText('https://example.com')).toHaveFocus()
  })

  it('disables autocapitalize/autocorrect on the tag input', () => {
    renderNew()
    const tags = screen.getByPlaceholderText('Add tags...')
    expect(tags).toHaveAttribute('autocapitalize', 'none')
    expect(tags).toHaveAttribute('autocorrect', 'off')
    expect(tags).toHaveAttribute('spellcheck', 'false')
  })

  describe('Paste button', () => {
    it('fills the URL from the clipboard and moves focus to title', async () => {
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      await waitFor(() => {
        expect(screen.getByPlaceholderText('https://example.com')).toHaveValue(
          'https://example.com/article'
        )
      })
      expect(screen.getByPlaceholderText('Title')).toHaveFocus()
    })

    it('normalizes a bare domain from the clipboard', async () => {
      navigator.clipboard.readText.mockResolvedValue('example.com/post')
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      await waitFor(() => {
        expect(screen.getByPlaceholderText('https://example.com')).toHaveValue(
          'https://example.com/post'
        )
      })
    })

    it('hides once the URL field has content', async () => {
      renderNew()
      fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
        target: { value: 'https://typed.example' },
      })
      expect(
        screen.queryByRole('button', { name: 'Paste link from clipboard' })
      ).not.toBeInTheDocument()
    })

    it('shows an error when the clipboard has no link', async () => {
      navigator.clipboard.readText.mockResolvedValue('not a url at all %%%')
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText("Clipboard doesn't contain a link")).toBeInTheDocument()
    })

    it('shows an error when the clipboard is empty', async () => {
      navigator.clipboard.readText.mockResolvedValue('   ')
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText('Clipboard is empty')).toBeInTheDocument()
    })

    it('shows an error when clipboard read is denied', async () => {
      navigator.clipboard.readText.mockRejectedValue(new Error('denied'))
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText("Couldn't read clipboard")).toBeInTheDocument()
    })

    it('is not rendered when the Clipboard API is unavailable', () => {
      mockClipboard(null)
      renderNew()
      expect(
        screen.queryByRole('button', { name: 'Paste link from clipboard' })
      ).not.toBeInTheDocument()
    })
  })

  describe('saving', () => {
    it('creates the bookmark with a normalized URL on Save', () => {
      renderNew()
      fireEvent.change(screen.getByPlaceholderText('https://example.com'), {
        target: { value: 'example.com' },
      })
      fireEvent.click(screen.getByRole('button', { name: /Save/ }))
      expect(createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com' })
      )
      expect(onDone).toHaveBeenCalled()
    })

    it('creates the bookmark on Enter in the URL field', () => {
      renderNew()
      const url = screen.getByPlaceholderText('https://example.com')
      fireEvent.change(url, { target: { value: 'https://example.com/a' } })
      fireEvent.keyDown(url, { key: 'Enter' })
      expect(createBookmark).toHaveBeenCalled()
      expect(onDone).toHaveBeenCalled()
    })

    it('shows an error and does not save without a URL', () => {
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: /Save/ }))
      expect(screen.getByText('URL is required')).toBeInTheDocument()
      expect(createBookmark).not.toHaveBeenCalled()
      expect(onDone).not.toHaveBeenCalled()
    })

    it('discards on Cancel', () => {
      renderNew()
      fireEvent.click(screen.getByRole('button', { name: /Cancel/ }))
      expect(onDiscard).toHaveBeenCalled()
      expect(createBookmark).not.toHaveBeenCalled()
    })
  })
})

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
    mockClipboard(vi.fn(async () => 'https://example.com'))
  })

  afterEach(() => {
    mockClipboard(null)
  })

  it('focuses the title input and does not show a Paste button', () => {
    render(<BookmarkInlineCard bookmark={bookmark} onDone={vi.fn()} onDiscard={vi.fn()} />)
    expect(screen.getByPlaceholderText('Title')).toHaveFocus()
    expect(
      screen.queryByRole('button', { name: 'Paste link from clipboard' })
    ).not.toBeInTheDocument()
  })

  it('saves title changes on blur', () => {
    render(<BookmarkInlineCard bookmark={bookmark} onDone={vi.fn()} onDiscard={vi.fn()} />)
    const title = screen.getByPlaceholderText('Title')
    fireEvent.change(title, { target: { value: 'Renamed' } })
    fireEvent.blur(title)
    expect(updateBookmark).toHaveBeenCalledWith(
      'bookmark:123',
      expect.objectContaining({ title: 'Renamed' })
    )
  })
})
