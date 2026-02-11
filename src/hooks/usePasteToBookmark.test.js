/**
 * usePasteToBookmark Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePasteToBookmark } from './usePasteToBookmark.js'

// Mock the bookmarks service
vi.mock('../services/bookmarks', () => ({
  isValidUrl: vi.fn((text) => {
    try {
      new URL(text)
      return true
    } catch {
      return false
    }
  }),
  createBookmark: vi.fn(() => ({ id: 'bookmark:new-1', url: 'https://example.com/', title: 'example.com' })),
  findBookmarksByUrl: vi.fn(() => []),
  normalizeUrl: vi.fn((url) => url),
  updateBookmark: vi.fn(),
}))

// Mock content suggestion service
vi.mock('../services/content-suggestion', () => ({
  isSuggestionsEnabled: vi.fn(() => false),
  fetchSuggestions: vi.fn(),
}))

function firePaste(text, target = document.body) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  event.clipboardData = { getData: () => text }
  Object.defineProperty(event, 'target', { value: target })
  event.preventDefault = vi.fn()
  document.dispatchEvent(event)
  return event
}

describe('usePasteToBookmark', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const bookmarks = await import('../services/bookmarks')
    bookmarks.findBookmarksByUrl.mockReturnValue([])
    bookmarks.createBookmark.mockReturnValue({ id: 'bookmark:new-1', url: 'https://example.com/', title: 'example.com' })
  })

  it('creates bookmark from pasted URL', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    await act(async () => firePaste('https://example.com'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com',
        title: expect.any(String),
      })
    )
    expect(onSuccess).toHaveBeenCalledWith('https://example.com')
  })

  it('ignores non-URL pastes', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    await act(async () => firePaste('just some text'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('ignores paste in input elements', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    const input = document.createElement('input')
    document.body.appendChild(input)

    await act(async () => firePaste('https://example.com', input))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('ignores paste in textarea elements', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    await act(async () => firePaste('https://example.com', textarea))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('calls onDuplicate when URL already exists', async () => {
    const onSuccess = vi.fn()
    const onDuplicate = vi.fn()

    const bookmarks = await import('../services/bookmarks')
    bookmarks.findBookmarksByUrl.mockReturnValue([{ _id: 'existing' }])

    renderHook(() => usePasteToBookmark(onSuccess, onDuplicate))

    await act(async () => firePaste('https://existing.com'))

    expect(onDuplicate).toHaveBeenCalledWith('https://existing.com')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
  })

  it('handles empty clipboard data', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    await act(async () => firePaste(''))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
  })

  it('cleans up event listener on unmount', async () => {
    const onSuccess = vi.fn()
    const { unmount } = renderHook(() => usePasteToBookmark(onSuccess))

    unmount()

    await act(async () => firePaste('https://example.com'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
  })

  it('handles createBookmark errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bookmarks = await import('../services/bookmarks')
    bookmarks.createBookmark.mockImplementation(() => { throw new Error('DB error') })

    const onSuccess = vi.fn()
    renderHook(() => usePasteToBookmark(onSuccess))

    await act(async () => firePaste('https://example.com'))

    expect(onSuccess).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
  })

  it('does not set inbox flag on created bookmark', async () => {
    renderHook(() => usePasteToBookmark(vi.fn()))

    await act(async () => firePaste('https://example.com'))

    const bookmarks = await import('../services/bookmarks')
    const callArgs = bookmarks.createBookmark.mock.calls[0][0]
    expect(callArgs.inbox).toBeUndefined()
  })
})
