/**
 * useShareTarget Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useShareTarget } from './useShareTarget.js'

// Mock the bookmarks service
vi.mock('../services/bookmarks', () => ({
  isValidUrl: vi.fn((text) => {
    try {
      const url = new URL(text)
      return url.protocol === 'http:' || url.protocol === 'https:'
    } catch {
      return false
    }
  }),
  createBookmark: vi.fn(() => ({
    id: 'bookmark:new-1',
    url: 'https://example.com/',
    title: 'example.com',
  })),
  findBookmarksByUrl: vi.fn(() => []),
  normalizeUrl: vi.fn((url) => url),
  updateBookmark: vi.fn(),
}))

// Mock content suggestion service
vi.mock('../services/content-suggestion', () => ({
  isSuggestionsEnabled: vi.fn(() => false),
  fetchSuggestions: vi.fn(),
}))

let replaceStateSpy

beforeEach(async () => {
  vi.clearAllMocks()
  const bookmarks = await import('../services/bookmarks')
  bookmarks.findBookmarksByUrl.mockReturnValue([])
  bookmarks.createBookmark.mockReturnValue({
    id: 'bookmark:new-1',
    url: 'https://example.com/',
    title: 'example.com',
  })
  replaceStateSpy = vi.spyOn(window.history, 'replaceState').mockImplementation(() => {})
})

afterEach(() => {
  // Reset URL search params
  replaceStateSpy.mockRestore()
  // Reset location to clean state via jsdom
  Object.defineProperty(window, 'location', {
    value: new URL('http://localhost/'),
    writable: true,
    configurable: true,
  })
})

function setSearchParams(params) {
  const url = new URL('http://localhost/')
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value)
  }
  Object.defineProperty(window, 'location', {
    value: url,
    writable: true,
    configurable: true,
  })
}

describe('useShareTarget', () => {
  it('creates bookmark from shared_url param', async () => {
    setSearchParams({ shared_url: 'https://example.com' })

    const onSuccess = vi.fn()
    renderHook(() => useShareTarget(onSuccess))

    // Wait for async handleSharedUrl
    await vi.waitFor(async () => {
      const bookmarks = await import('../services/bookmarks')
      expect(bookmarks.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          title: 'example.com',
        })
      )
    })

    expect(onSuccess).toHaveBeenCalledWith('https://example.com')
  })

  it('uses shared_title when provided', async () => {
    setSearchParams({
      shared_url: 'https://example.com',
      shared_title: 'Example Site',
    })

    renderHook(() => useShareTarget(vi.fn()))

    await vi.waitFor(async () => {
      const bookmarks = await import('../services/bookmarks')
      expect(bookmarks.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Example Site',
        })
      )
    })
  })

  it('extracts URL from shared_text param', async () => {
    setSearchParams({ shared_text: 'Check this out https://example.com/page' })

    const onSuccess = vi.fn()
    renderHook(() => useShareTarget(onSuccess))

    await vi.waitFor(async () => {
      const bookmarks = await import('../services/bookmarks')
      expect(bookmarks.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com/page',
        })
      )
    })

    expect(onSuccess).toHaveBeenCalledWith('https://example.com/page')
  })

  it('does nothing when no share params present', async () => {
    // No search params set (default clean URL)
    const onSuccess = vi.fn()
    renderHook(() => useShareTarget(onSuccess))

    // Give it a tick to ensure nothing fires
    await new Promise((r) => setTimeout(r, 10))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
    expect(onSuccess).not.toHaveBeenCalled()
  })

  it('calls onDuplicate when URL already exists', async () => {
    setSearchParams({ shared_url: 'https://existing.com' })

    const bookmarks = await import('../services/bookmarks')
    bookmarks.findBookmarksByUrl.mockReturnValue([{ _id: 'existing' }])

    const onSuccess = vi.fn()
    const onDuplicate = vi.fn()
    renderHook(() => useShareTarget(onSuccess, onDuplicate))

    await vi.waitFor(() => {
      expect(onDuplicate).toHaveBeenCalledWith('https://existing.com')
    })

    expect(onSuccess).not.toHaveBeenCalled()
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
  })

  it('cleans up URL params after processing', async () => {
    setSearchParams({ shared_url: 'https://example.com' })

    renderHook(() => useShareTarget(vi.fn()))

    await vi.waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalled()
    })

    // The cleaned URL should not contain share params
    const cleanedUrl = replaceStateSpy.mock.calls[0][2]
    expect(cleanedUrl).not.toContain('shared_url')
    expect(cleanedUrl).not.toContain('shared_title')
    expect(cleanedUrl).not.toContain('shared_text')
  })

  it('cleans up URL even when shared text has no valid URL', async () => {
    setSearchParams({ shared_text: 'just plain text no url' })

    renderHook(() => useShareTarget(vi.fn()))

    await vi.waitFor(() => {
      expect(replaceStateSpy).toHaveBeenCalled()
    })

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).not.toHaveBeenCalled()
  })

  it('handles createBookmark errors gracefully', async () => {
    setSearchParams({ shared_url: 'https://example.com' })

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const bookmarks = await import('../services/bookmarks')
    bookmarks.createBookmark.mockImplementation(() => {
      throw new Error('DB error')
    })

    const onSuccess = vi.fn()
    renderHook(() => useShareTarget(onSuccess))

    await vi.waitFor(() => {
      expect(consoleSpy).toHaveBeenCalled()
    })

    expect(onSuccess).not.toHaveBeenCalled()
    consoleSpy.mockRestore()
  })

  it('processes share params only once', async () => {
    setSearchParams({ shared_url: 'https://example.com' })

    const onSuccess = vi.fn()
    const { rerender } = renderHook(() => useShareTarget(onSuccess))

    await vi.waitFor(() => {
      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    // Re-render should not process again
    rerender()
    await new Promise((r) => setTimeout(r, 10))

    const bookmarks = await import('../services/bookmarks')
    expect(bookmarks.createBookmark).toHaveBeenCalledTimes(1)
  })
})
