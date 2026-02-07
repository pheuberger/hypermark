/**
 * useBookmarkKeyboardNav Tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookmarkKeyboardNav } from './useBookmarkKeyboardNav.js'

const bookmarks = [
  { _id: 'b1', title: 'A' },
  { _id: 'b2', title: 'B' },
  { _id: 'b3', title: 'C' },
]

function setup(bm = bookmarks, opts = {}) {
  const defaultOpts = {
    filterView: 'all',
    inboxViewRef: { current: null },
    selectedTag: null,
    debouncedSearchQuery: '',
    ...opts,
  }
  return renderHook(() => useBookmarkKeyboardNav(bm, defaultOpts))
}

describe('useBookmarkKeyboardNav', () => {
  it('starts with no selection', () => {
    const { result } = setup()
    expect(result.current.selectedIndex).toBe(-1)
    expect(result.current.hoveredIndex).toBe(-1)
    expect(result.current.keyboardNavActive).toBe(false)
  })

  it('selectNext moves to first item from no selection', () => {
    const { result } = setup()

    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(0)
    expect(result.current.keyboardNavActive).toBe(true)
  })

  it('selectNext advances through items', () => {
    const { result } = setup()

    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(0)

    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(1)

    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(2)
  })

  it('selectNext does not go past last item', () => {
    const { result } = setup()

    act(() => result.current.selectNext())
    act(() => result.current.selectNext())
    act(() => result.current.selectNext())
    act(() => result.current.selectNext()) // attempt to go past end

    expect(result.current.selectedIndex).toBe(2) // stays at last
  })

  it('selectPrev moves to last item from no selection', () => {
    const { result } = setup()

    act(() => result.current.selectPrev())
    expect(result.current.selectedIndex).toBe(2) // last
    expect(result.current.keyboardNavActive).toBe(true)
  })

  it('selectPrev moves backward through items', () => {
    const { result } = setup()

    act(() => result.current.selectPrev())
    expect(result.current.selectedIndex).toBe(2)

    act(() => result.current.selectPrev())
    expect(result.current.selectedIndex).toBe(1)

    act(() => result.current.selectPrev())
    expect(result.current.selectedIndex).toBe(0)
  })

  it('selectPrev does not go below 0', () => {
    const { result } = setup()

    act(() => result.current.selectPrev())
    act(() => result.current.selectPrev())
    act(() => result.current.selectPrev())
    act(() => result.current.selectPrev()) // attempt to go below 0

    expect(result.current.selectedIndex).toBe(0)
  })

  it('goToTop selects first item', () => {
    const { result } = setup()

    act(() => result.current.goToTop())
    expect(result.current.selectedIndex).toBe(0)
  })

  it('goToBottom selects last item', () => {
    const { result } = setup()

    act(() => result.current.goToBottom())
    expect(result.current.selectedIndex).toBe(2)
  })

  it('getSelectedBookmark returns null when no selection', () => {
    const { result } = setup()
    expect(result.current.getSelectedBookmark()).toBeNull()
  })

  it('getSelectedBookmark returns the selected bookmark', () => {
    const { result } = setup()

    act(() => result.current.selectNext())
    expect(result.current.getSelectedBookmark()).toEqual(bookmarks[0])
  })

  it('handleBookmarkHover sets hovered index', () => {
    const { result } = setup()

    act(() => result.current.handleBookmarkHover(1))
    expect(result.current.hoveredIndex).toBe(1)
  })

  it('handleBookmarkHover deactivates keyboard nav', () => {
    const { result } = setup()

    // First activate keyboard nav
    act(() => result.current.selectNext())
    expect(result.current.keyboardNavActive).toBe(true)

    // Hover should deactivate keyboard nav
    act(() => result.current.handleBookmarkHover(2))
    expect(result.current.keyboardNavActive).toBe(false)
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('selectNext starts at hovered index if available', () => {
    const { result } = setup()

    act(() => result.current.handleBookmarkHover(1))
    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(1)
  })

  it('delegates to inboxViewRef when filterView is inbox', () => {
    const inboxMock = {
      selectNext: vi.fn(),
      selectPrev: vi.fn(),
      goToTop: vi.fn(),
      goToBottom: vi.fn(),
    }
    const { result } = setup(bookmarks, {
      filterView: 'inbox',
      inboxViewRef: { current: inboxMock },
    })

    act(() => result.current.selectNext())
    expect(inboxMock.selectNext).toHaveBeenCalled()

    act(() => result.current.selectPrev())
    expect(inboxMock.selectPrev).toHaveBeenCalled()

    act(() => result.current.goToTop())
    expect(inboxMock.goToTop).toHaveBeenCalled()

    act(() => result.current.goToBottom())
    expect(inboxMock.goToBottom).toHaveBeenCalled()
  })

  it('selectNext with empty bookmarks stays at -1', () => {
    const { result } = setup([])

    act(() => result.current.selectNext())
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('selectPrev with empty bookmarks stays at -1', () => {
    const { result } = setup([])

    act(() => result.current.selectPrev())
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('goToTop with empty bookmarks does nothing', () => {
    const { result } = setup([])

    act(() => result.current.goToTop())
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('goToBottom with empty bookmarks does nothing', () => {
    const { result } = setup([])

    act(() => result.current.goToBottom())
    expect(result.current.selectedIndex).toBe(-1)
  })

  it('suppressHoverBriefly ignores hover temporarily', () => {
    vi.useFakeTimers()
    const { result } = setup()

    act(() => result.current.suppressHoverBriefly())
    act(() => result.current.handleBookmarkHover(1))
    // Should be ignored
    expect(result.current.hoveredIndex).toBe(-1)

    // After timeout, should work again
    act(() => vi.advanceTimersByTime(200))
    act(() => result.current.handleBookmarkHover(2))
    expect(result.current.hoveredIndex).toBe(2)

    vi.useRealTimers()
  })
})
