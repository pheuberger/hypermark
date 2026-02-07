/**
 * useSearch and useDebounce Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useSearch, useDebounce } from './useSearch.js'

describe('useDebounce', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300))
    expect(result.current).toBe('hello')
  })

  it('debounces value changes', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    )

    expect(result.current).toBe('a')

    rerender({ value: 'ab' })
    expect(result.current).toBe('a') // not yet updated

    act(() => vi.advanceTimersByTime(300))
    expect(result.current).toBe('ab')
  })

  it('resets timer on rapid changes', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'ab' })
    act(() => vi.advanceTimersByTime(200)) // not enough
    rerender({ value: 'abc' }) // restart
    act(() => vi.advanceTimersByTime(200)) // not enough from restart
    expect(result.current).toBe('a') // still original

    act(() => vi.advanceTimersByTime(100)) // 300ms from last change
    expect(result.current).toBe('abc')
  })

  it('uses custom delay', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'updated' })
    act(() => vi.advanceTimersByTime(100))
    expect(result.current).toBe('updated')
  })
})

describe('useSearch', () => {
  const bookmarks = [
    { _id: 'b1', title: 'JavaScript Guide', url: 'https://js.dev', description: 'Learn JS', tags: ['programming'] },
    { _id: 'b2', title: 'React Tutorial', url: 'https://react.dev', description: 'Learn React', tags: ['frontend'] },
    { _id: 'b3', title: 'Node.js Docs', url: 'https://nodejs.org', description: 'Server-side JS', tags: ['backend'] },
  ]

  it('returns all bookmarks when query is empty', () => {
    const { result } = renderHook(() => useSearch(bookmarks, ''))
    expect(result.current).toEqual(bookmarks)
  })

  it('returns all bookmarks when query is null', () => {
    const { result } = renderHook(() => useSearch(bookmarks, null))
    expect(result.current).toEqual(bookmarks)
  })

  it('returns all bookmarks when query is whitespace', () => {
    const { result } = renderHook(() => useSearch(bookmarks, '   '))
    expect(result.current).toEqual(bookmarks)
  })

  it('filters bookmarks by title search', () => {
    const { result } = renderHook(() => useSearch(bookmarks, 'React'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0]._id).toBe('b2')
  })

  it('filters bookmarks by description search', () => {
    const { result } = renderHook(() => useSearch(bookmarks, 'Server'))
    expect(result.current).toHaveLength(1)
    expect(result.current[0]._id).toBe('b3')
  })

  it('returns empty array for no matches', () => {
    const { result } = renderHook(() => useSearch(bookmarks, 'python'))
    expect(result.current).toHaveLength(0)
  })

  it('returns empty array for null bookmarks', () => {
    const { result } = renderHook(() => useSearch(null, 'test'))
    expect(result.current).toEqual([])
  })

  it('returns empty array for empty bookmarks with query', () => {
    const { result } = renderHook(() => useSearch([], 'test'))
    expect(result.current).toEqual([])
  })

  it('updates results when bookmarks change', () => {
    const { result, rerender } = renderHook(
      ({ bm, query }) => useSearch(bm, query),
      { initialProps: { bm: bookmarks, query: 'React' } }
    )

    expect(result.current).toHaveLength(1)

    const updatedBookmarks = [
      ...bookmarks,
      { _id: 'b4', title: 'React Native', url: 'https://rn.dev', description: 'Mobile React', tags: [] },
    ]
    rerender({ bm: updatedBookmarks, query: 'React' })
    expect(result.current).toHaveLength(2)
  })

  it('updates results when query changes', () => {
    const { result, rerender } = renderHook(
      ({ bm, query }) => useSearch(bm, query),
      { initialProps: { bm: bookmarks, query: 'React' } }
    )

    expect(result.current).toHaveLength(1)

    rerender({ bm: bookmarks, query: 'JavaScript' })
    expect(result.current).toHaveLength(1)
    expect(result.current[0]._id).toBe('b1')
  })
})
