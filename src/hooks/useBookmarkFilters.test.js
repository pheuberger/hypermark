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

describe('useBookmarkFilters', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns all bookmarks by default', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))
    expect(result.current.filterView).toBe('all')
    expect(result.current.filteredBookmarks).toHaveLength(3)
  })

  it('sorts by recent (default)', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))
    expect(result.current.sortBy).toBe('recent')
    expect(result.current.filteredBookmarks[0]._id).toBe('b3') // createdAt 300
    expect(result.current.filteredBookmarks[2]._id).toBe('b1') // createdAt 100
  })

  it('sorts by oldest', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.setSortBy('oldest'))
    expect(result.current.filteredBookmarks[0]._id).toBe('b1')
    expect(result.current.filteredBookmarks[2]._id).toBe('b3')
  })

  it('sorts by title', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.setSortBy('title'))
    expect(result.current.filteredBookmarks[0].title).toBe('Apple')
    expect(result.current.filteredBookmarks[2].title).toBe('Zebra')
  })

  it('sorts by updated', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.setSortBy('updated'))
    expect(result.current.filteredBookmarks[0]._id).toBe('b3') // updatedAt 300
  })

  it('goToReadLater filters for readLater only', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.goToReadLater())
    expect(result.current.filterView).toBe('read-later')
    expect(result.current.filteredBookmarks).toHaveLength(1)
    expect(result.current.filteredBookmarks[0]._id).toBe('b1')
  })

  it('goToInbox filters for inbox only', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.goToInbox())
    expect(result.current.filterView).toBe('inbox')
    expect(result.current.filteredBookmarks).toHaveLength(1)
    expect(result.current.filteredBookmarks[0]._id).toBe('b2')
  })

  it('handleTagSelect filters by tag', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.handleTagSelect('fruit'))
    expect(result.current.filterView).toBe('tag')
    expect(result.current.selectedTag).toBe('fruit')
    expect(result.current.filteredBookmarks).toHaveLength(2)
    expect(result.current.filteredBookmarks.every(b => b.tags.includes('fruit'))).toBe(true)
  })

  it('handleTagClick filters by tag', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.handleTagClick('animals'))
    expect(result.current.filterView).toBe('tag')
    expect(result.current.selectedTag).toBe('animals')
    expect(result.current.filteredBookmarks).toHaveLength(1)
  })

  it('handleFilterChange sets filter view and clears tag', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    // First set a tag filter
    act(() => result.current.handleTagSelect('fruit'))
    expect(result.current.selectedTag).toBe('fruit')

    // Then change filter - should clear tag
    act(() => result.current.handleFilterChange('all'))
    expect(result.current.filterView).toBe('all')
    expect(result.current.selectedTag).toBeNull()
  })

  it('goToAllBookmarks resets everything', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.goToReadLater())
    act(() => result.current.setSearchQuery('test'))

    act(() => result.current.goToAllBookmarks())
    expect(result.current.filterView).toBe('all')
    expect(result.current.selectedTag).toBeNull()
    expect(result.current.searchQuery).toBe('')
  })

  it('setSearchQuery updates search query state', () => {
    const { result } = renderHook(() => useBookmarkFilters(bookmarks))

    act(() => result.current.setSearchQuery('hello'))
    expect(result.current.searchQuery).toBe('hello')
  })

  it('handles bookmarks with missing tags array', () => {
    const messyBookmarks = [
      { _id: 'b1', title: 'No Tags', url: 'https://x.com', tags: null, readLater: false, inbox: false, createdAt: 100, updatedAt: 100 },
    ]
    const { result } = renderHook(() => useBookmarkFilters(messyBookmarks))

    // Should not crash when filtering by tag
    act(() => result.current.handleTagSelect('test'))
    expect(result.current.filteredBookmarks).toHaveLength(0)
  })
})
