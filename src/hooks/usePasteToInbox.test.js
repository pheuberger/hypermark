/**
 * usePasteToInbox Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePasteToInbox } from './usePasteToInbox.js'

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
  createInboxItem: vi.fn(),
  findBookmarksByUrl: vi.fn(() => []),
  normalizeUrl: vi.fn((url) => url),
}))

function firePaste(text, target = document.body) {
  const event = new Event('paste', { bubbles: true, cancelable: true })
  event.clipboardData = { getData: () => text }
  Object.defineProperty(event, 'target', { value: target })
  event.preventDefault = vi.fn()
  document.dispatchEvent(event)
  return event
}

describe('usePasteToInbox', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const bookmarks = await import('../services/bookmarks')
    bookmarks.findBookmarksByUrl.mockReturnValue([])
    bookmarks.createInboxItem.mockResolvedValue({ _id: 'new-inbox' })
  })

  it('creates inbox item from pasted URL', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    await act(async () => firePaste('https://example.com'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).toHaveBeenCalledWith('https://example.com')
    expect(onSuccess).toHaveBeenCalledWith('https://example.com')
  })

  it('ignores non-URL pastes', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    await act(async () => firePaste('just some text'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('ignores paste in input elements', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    const input = document.createElement('input')
    document.body.appendChild(input)

    await act(async () => firePaste('https://example.com', input))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('ignores paste in textarea elements', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)

    await act(async () => firePaste('https://example.com', textarea))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
    document.body.removeChild(textarea)
  })

  it('calls onDuplicate when URL already exists', async () => {
    const onSuccess = vi.fn()
    const onDuplicate = vi.fn()

    const bookmarks = await import('../services/bookmarks')
    bookmarks.findBookmarksByUrl.mockReturnValue([{ _id: 'existing' }])

    renderHook(() => usePasteToInbox(onSuccess, onDuplicate))

    await act(async () => firePaste('https://existing.com'))

    expect(onDuplicate).toHaveBeenCalledWith('https://existing.com')
    expect(onSuccess).not.toHaveBeenCalled()
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
  })

  it('handles empty clipboard data', async () => {
    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    await act(async () => firePaste(''))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
  })

  it('cleans up event listener on unmount', async () => {
    const onSuccess = vi.fn()
    const { unmount } = renderHook(() => usePasteToInbox(onSuccess))

    unmount()

    await act(async () => firePaste('https://example.com'))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createInboxItem).not.toHaveBeenCalled()
  })

  it('handles createInboxItem errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bookmarks = await import('../services/bookmarks')
    bookmarks.createInboxItem.mockRejectedValueOnce(new Error('DB error'))

    const onSuccess = vi.fn()
    renderHook(() => usePasteToInbox(onSuccess))

    await act(async () => firePaste('https://example.com'))

    expect(onSuccess).not.toHaveBeenCalled()
    expect(consoleSpy).toHaveBeenCalled()
  })
})
