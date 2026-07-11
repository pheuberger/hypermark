import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { AddBookmarkDialog } from './AddBookmarkDialog.jsx'

// jsdom doesn't implement scrollIntoView (used by TagInput dropdown)
Element.prototype.scrollIntoView = vi.fn()

vi.mock('../../services/bookmarks', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...actual,
    getAllTags: vi.fn(() => ['react', 'design']),
    createBookmark: vi.fn(() => ({ id: 'bookmark:new' })),
  }
})

const suggestionState = vi.hoisted(() => ({
  suggestions: null,
  loading: false,
  error: null,
  suggest: vi.fn(),
  clear: vi.fn(),
  cancel: vi.fn(),
  enabled: false,
}))

vi.mock('../../hooks/useContentSuggestion', () => ({
  useContentSuggestion: () => ({ ...suggestionState }),
}))

import { createBookmark } from '../../services/bookmarks'

function mockClipboard(readTextImpl) {
  Object.defineProperty(navigator, 'clipboard', {
    value: readTextImpl ? { readText: readTextImpl } : undefined,
    configurable: true,
  })
}

describe('AddBookmarkDialog', () => {
  const onClose = vi.fn()
  const onSaved = vi.fn()

  beforeEach(() => {
    onClose.mockClear()
    onSaved.mockClear()
    createBookmark.mockClear()
    suggestionState.suggestions = null
    suggestionState.loading = false
    suggestionState.enabled = false
    suggestionState.suggest.mockClear()
    suggestionState.clear.mockClear()
    mockClipboard(vi.fn(async () => 'https://example.com/article'))
  })

  afterEach(() => {
    mockClipboard(null)
  })

  const renderDialog = (props = {}) =>
    render(<AddBookmarkDialog open={true} onClose={onClose} onSaved={onSaved} {...props} />)

  const getUrlInput = () => screen.getByPlaceholderText('Paste or type a link')

  it('renders nothing when closed', () => {
    render(<AddBookmarkDialog open={false} onClose={onClose} onSaved={onSaved} />)
    expect(screen.queryByText('New bookmark')).not.toBeInTheDocument()
  })

  it('gives the URL input mobile-friendly keyboard attributes', () => {
    renderDialog()
    const url = getUrlInput()
    expect(url).toHaveAttribute('inputmode', 'url')
    expect(url).toHaveAttribute('autocapitalize', 'none')
    expect(url).toHaveAttribute('autocorrect', 'off')
    expect(url).toHaveAttribute('spellcheck', 'false')
    expect(url).toHaveAttribute('enterkeyhint', 'go')
  })

  it('focuses the URL input on open', () => {
    renderDialog()
    expect(getUrlInput()).toHaveFocus()
  })

  describe('Paste button', () => {
    it('fills the URL from the clipboard and moves focus to title', async () => {
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      await waitFor(() => {
        expect(getUrlInput()).toHaveValue('https://example.com/article')
      })
      expect(screen.getByPlaceholderText('Title (optional)')).toHaveFocus()
    })

    it('normalizes a bare domain from the clipboard', async () => {
      navigator.clipboard.readText.mockResolvedValue('example.com/post')
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      await waitFor(() => {
        expect(getUrlInput()).toHaveValue('https://example.com/post')
      })
    })

    it('hides once the URL field has content', () => {
      renderDialog()
      fireEvent.change(getUrlInput(), { target: { value: 'https://typed.example' } })
      expect(
        screen.queryByRole('button', { name: 'Paste link from clipboard' })
      ).not.toBeInTheDocument()
    })

    it('shows an error when the clipboard has no link', async () => {
      navigator.clipboard.readText.mockResolvedValue('not a url at all %%%')
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText("Clipboard doesn't contain a link")).toBeInTheDocument()
    })

    it('shows an error when the clipboard is empty', async () => {
      navigator.clipboard.readText.mockResolvedValue('   ')
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText('Clipboard is empty')).toBeInTheDocument()
    })

    it('shows an error when clipboard read is denied', async () => {
      navigator.clipboard.readText.mockRejectedValue(new Error('denied'))
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: 'Paste link from clipboard' }))
      expect(await screen.findByText("Couldn't read clipboard")).toBeInTheDocument()
    })

    it('is not rendered when the Clipboard API is unavailable', () => {
      mockClipboard(null)
      renderDialog()
      expect(
        screen.queryByRole('button', { name: 'Paste link from clipboard' })
      ).not.toBeInTheDocument()
    })
  })

  describe('saving', () => {
    it('creates the bookmark with a normalized URL on Save', () => {
      renderDialog()
      fireEvent.change(getUrlInput(), { target: { value: 'example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }))
      expect(createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ url: 'https://example.com/' })
      )
      expect(onSaved).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it('creates the bookmark on Enter in the URL field', () => {
      renderDialog()
      const url = getUrlInput()
      fireEvent.change(url, { target: { value: 'https://example.com/a' } })
      fireEvent.keyDown(url, { key: 'Enter' })
      expect(createBookmark).toHaveBeenCalled()
      expect(onClose).toHaveBeenCalled()
    })

    it('disables Save until a URL is entered', () => {
      renderDialog()
      const save = screen.getByRole('button', { name: 'Save bookmark' })
      expect(save).toBeDisabled()
      fireEvent.change(getUrlInput(), { target: { value: 'example.com' } })
      expect(save).toBeEnabled()
    })

    it('shows an error and does not save an invalid URL', () => {
      renderDialog()
      fireEvent.change(getUrlInput(), { target: { value: 'not a url %%%' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }))
      expect(screen.getByText('Invalid URL')).toBeInTheDocument()
      expect(createBookmark).not.toHaveBeenCalled()
      expect(onClose).not.toHaveBeenCalled()
    })

    it('saves title, description, tags and read-later together', () => {
      renderDialog()
      fireEvent.change(getUrlInput(), { target: { value: 'https://example.com' } })
      fireEvent.change(screen.getByPlaceholderText('Title (optional)'), {
        target: { value: 'My title' },
      })
      fireEvent.change(screen.getByPlaceholderText('Notes (optional)'), {
        target: { value: 'line one\nline two' },
      })
      fireEvent.click(screen.getByRole('switch', { name: /Read later/ }))
      fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }))
      expect(createBookmark).toHaveBeenCalledWith({
        url: 'https://example.com/',
        title: 'My title',
        description: 'line one\nline two',
        tags: [],
        readLater: true,
      })
    })

    it('keeps newlines in the description (Enter does not save there)', () => {
      renderDialog()
      const desc = screen.getByPlaceholderText('Notes (optional)')
      fireEvent.change(getUrlInput(), { target: { value: 'https://example.com' } })
      fireEvent.keyDown(desc, { key: 'Enter' })
      expect(createBookmark).not.toHaveBeenCalled()
    })

    it('closes without saving on Cancel', () => {
      renderDialog()
      fireEvent.change(getUrlInput(), { target: { value: 'https://example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
      expect(onClose).toHaveBeenCalled()
      expect(createBookmark).not.toHaveBeenCalled()
    })
  })

  describe('soft keyboard (visual viewport) handling', () => {
    afterEach(() => {
      delete window.visualViewport
    })

    it('lifts the sheet by the keyboard height via CSS variables', () => {
      const listeners = {}
      window.visualViewport = {
        height: 500,
        offsetTop: 0,
        addEventListener: (ev, fn) => { listeners[ev] = fn },
        removeEventListener: vi.fn(),
      }
      window.innerHeight = 844
      renderDialog()

      const content = document.querySelector('.add-dialog-content')
      expect(content.style.getPropertyValue('--keyboard-inset')).toBe('344px')
      expect(content.style.getPropertyValue('--visual-viewport-height')).toBe('500px')

      // Keyboard dismissed → viewport grows back, inset returns to 0
      window.visualViewport.height = 844
      listeners.resize()
      expect(content.style.getPropertyValue('--keyboard-inset')).toBe('0px')
    })

    it('accounts for the visual viewport being scrolled down', () => {
      window.visualViewport = {
        height: 500,
        offsetTop: 100,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }
      window.innerHeight = 844
      renderDialog()
      const content = document.querySelector('.add-dialog-content')
      expect(content.style.getPropertyValue('--keyboard-inset')).toBe('244px')
    })
  })

  describe('content suggestions', () => {
    it('requests suggestions when a URL is committed and suggestions are enabled', () => {
      suggestionState.enabled = true
      renderDialog()
      const url = getUrlInput()
      fireEvent.change(url, { target: { value: 'example.com' } })
      fireEvent.blur(url)
      expect(suggestionState.suggest).toHaveBeenCalledWith('https://example.com/')
    })

    it('does not request suggestions when disabled', () => {
      suggestionState.enabled = false
      renderDialog()
      const url = getUrlInput()
      fireEvent.change(url, { target: { value: 'example.com' } })
      fireEvent.blur(url)
      expect(suggestionState.suggest).not.toHaveBeenCalled()
    })

    it('fills empty title and description from suggestions', () => {
      suggestionState.enabled = true
      suggestionState.suggestions = {
        title: 'Suggested title',
        description: 'Suggested description',
        suggestedTags: [],
        favicon: null,
      }
      renderDialog()
      expect(screen.getByPlaceholderText('Title (optional)')).toHaveValue('Suggested title')
      expect(screen.getByPlaceholderText('Notes (optional)')).toHaveValue(
        'Suggested description'
      )
    })

    it('never overwrites a title the user has typed', () => {
      suggestionState.enabled = true
      const { rerender } = renderDialog()
      fireEvent.change(screen.getByPlaceholderText('Title (optional)'), {
        target: { value: 'Mine' },
      })
      suggestionState.suggestions = {
        title: 'Suggested title',
        description: '',
        suggestedTags: [],
        favicon: null,
      }
      rerender(<AddBookmarkDialog open={true} onClose={onClose} onSaved={onSaved} />)
      expect(screen.getByPlaceholderText('Title (optional)')).toHaveValue('Mine')
    })

    it('offers suggested tags as one-tap chips', () => {
      suggestionState.enabled = true
      suggestionState.suggestions = {
        title: '',
        description: '',
        suggestedTags: ['JavaScript', 'webdev'],
        favicon: null,
      }
      renderDialog()
      fireEvent.click(screen.getByRole('button', { name: /javascript/i }))
      fireEvent.change(getUrlInput(), { target: { value: 'https://example.com' } })
      fireEvent.click(screen.getByRole('button', { name: 'Save bookmark' }))
      expect(createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ tags: ['javascript'] })
      )
    })
  })
})
