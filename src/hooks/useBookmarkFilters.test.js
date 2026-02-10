/**
 * useBookmarkFilters Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookmarkFilters } from './useBookmarkFilters.js'

const bookmarks = [
  { _id: 'b1', title: 'Zebra', url: 'https://z.com', description: '', tags: ['animals'], readLater: true, inbox: false, createdAt: 100, updatedAt: 200 },
  { _id: 'b2', title: 'Apple', url: 'https://a.com', description: '', tags: ['fruit'], readLater: false, inbox: true, createdAt: 200, updatedAt: 100 },
  { _id: 'b3', title: 'Mango', url: 'https://m.com', description: '', tags: ['fruit'], readLater: false, inbox: false, createdAt: 300, updatedAt: 300 },
]

const makeRouter = (overrides = {}) => ({
  filterView: 'all',
  selectedTag: null,
  navigate: vi.fn(),
  ...overrides,
})

describe('useBookmarkFilters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns all bookmarks by default', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))
    expect(result.current.filterView).toBe('all')
    expect(result.current.filteredBookmarks).toHaveLength(3)
  })

  it('sorts by recent (default)', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))
    expect(result.current.sortBy).toBe('recent')
    expect(result.current.filteredBookmarks[0]._id).toBe('b3') // createdAt 300
    expect(result.current.filteredBookmarks[2]._id).toBe('b1') // createdAt 100
  })

  it('sorts by oldest', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.setSortBy('oldest'))
    expect(result.current.filteredBookmarks[0]._id).toBe('b1')
    expect(result.current.filteredBookmarks[2]._id).toBe('b3')
  })

  it('sorts by title', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.setSortBy('title'))
    expect(result.current.filteredBookmarks[0].title).toBe('Apple')
    expect(result.current.filteredBookmarks[2].title).toBe('Zebra')
  })

  it('sorts by updated', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.setSortBy('updated'))
    expect(result.current.filteredBookmarks[0]._id).toBe('b3') // updatedAt 300
  })

  it('goToReadLater navigates to read-later hash', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.goToReadLater())
    expect(router.navigate).toHaveBeenCalledWith('#/read-later')
  })

  it('filters for readLater when filterView is read-later', () => {
    const router = makeRouter({ filterView: 'read-later' })
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    expect(result.current.filteredBookmarks).toHaveLength(1)
    expect(result.current.filteredBookmarks[0]._id).toBe('b1')
  })

  it('goToInbox navigates to inbox hash', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.goToInbox())
    expect(router.navigate).toHaveBeenCalledWith('#/inbox')
  })

  it('filters for inbox when filterView is inbox', () => {
    const router = makeRouter({ filterView: 'inbox' })
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    expect(result.current.filteredBookmarks).toHaveLength(1)
    expect(result.current.filteredBookmarks[0]._id).toBe('b2')
  })

  it('handleTagSelect navigates to tag hash', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.handleTagSelect('fruit'))
    expect(router.navigate).toHaveBeenCalledWith('#/tag/fruit')
  })

  it('filters by tag when filterView is tag', () => {
    const router = makeRouter({ filterView: 'tag', selectedTag: 'fruit' })
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    expect(result.current.filteredBookmarks).toHaveLength(2)
    expect(result.current.filteredBookmarks.every(b => b.tags.includes('fruit'))).toBe(true)
  })

  it('handleTagClick navigates to tag hash', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.handleTagClick('animals'))
    expect(router.navigate).toHaveBeenCalledWith('#/tag/animals')
  })

  it('handleFilterChange navigates to correct hash', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.handleFilterChange('all'))
    expect(router.navigate).toHaveBeenCalledWith('#/')
  })

  it('goToAllBookmarks navigates and clears search', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.setSearchQuery('test'))
    expect(result.current.searchQuery).toBe('test')

    act(() => result.current.goToAllBookmarks())
    expect(router.navigate).toHaveBeenCalledWith('#/')
    expect(result.current.searchQuery).toBe('')
  })

  it('setSearchQuery updates search query state', () => {
    const router = makeRouter()
    const { result } = renderHook(() => useBookmarkFilters(bookmarks, router))

    act(() => result.current.setSearchQuery('hello'))
    expect(result.current.searchQuery).toBe('hello')
  })

  it('handles bookmarks with missing tags array', () => {
    const messyBookmarks = [
      { _id: 'b1', title: 'No Tags', url: 'https://x.com', tags: null, readLater: false, inbox: false, createdAt: 100, updatedAt: 100 },
    ]
    const router = makeRouter({ filterView: 'tag', selectedTag: 'test' })
    const { result } = renderHook(() => useBookmarkFilters(messyBookmarks, router))

    // Should not crash when filtering by tag
    expect(result.current.filteredBookmarks).toHaveLength(0)
  })
})
