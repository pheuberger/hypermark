/**
 * useBookmarkSelection Tests
 */

import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBookmarkSelection } from './useBookmarkSelection.js'

const bookmarks = [
  { _id: 'b1', title: 'A' },
  { _id: 'b2', title: 'B' },
  { _id: 'b3', title: 'C' },
]

function setup(bm = bookmarks, index = -1) {
  let selectedIndex = index
  const setSelectedIndex = (fn) => {
    selectedIndex = typeof fn === 'function' ? fn(selectedIndex) : fn
  }
  return renderHook(() =>
    useBookmarkSelection(bm, { selectedIndex, setSelectedIndex })
  )
}

describe('useBookmarkSelection', () => {
  it('starts in non-selection mode with empty selection', () => {
    const { result } = setup()
    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggleSelectionMode enters and exits selection mode', () => {
    const { result } = setup()

    act(() => result.current.toggleSelectionMode())
    expect(result.current.selectionMode).toBe(true)

    act(() => result.current.toggleSelectionMode())
    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('exitSelectionMode clears selection', () => {
    const { result } = setup()

    act(() => result.current.toggleSelectionMode())
    act(() => result.current.toggleSelectBookmark('b1'))
    expect(result.current.selectedIds.has('b1')).toBe(true)

    act(() => result.current.exitSelectionMode())
    expect(result.current.selectionMode).toBe(false)
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggleSelectBookmark with initiateSelection starts selection mode', () => {
    const { result } = setup()

    act(() => result.current.toggleSelectBookmark('b1', true))
    expect(result.current.selectionMode).toBe(true)
    expect(result.current.selectedIds.has('b1')).toBe(true)
  })

  it('toggleSelectBookmark adds and removes IDs', () => {
    const { result } = setup()

    act(() => result.current.toggleSelectionMode())

    act(() => result.current.toggleSelectBookmark('b1'))
    expect(result.current.selectedIds.has('b1')).toBe(true)

    act(() => result.current.toggleSelectBookmark('b2'))
    expect(result.current.selectedIds.has('b2')).toBe(true)

    // Deselect b1
    act(() => result.current.toggleSelectBookmark('b1'))
    expect(result.current.selectedIds.has('b1')).toBe(false)
  })

  it('exits selection mode when last item is deselected', () => {
    const { result } = setup()

    act(() => result.current.toggleSelectBookmark('b1', true))
    expect(result.current.selectionMode).toBe(true)

    // Deselect only item → should exit selection mode
    act(() => result.current.toggleSelectBookmark('b1'))
    expect(result.current.selectionMode).toBe(false)
  })

  it('selectAllBookmarks selects all visible bookmarks', () => {
    const { result } = setup()

    act(() => result.current.selectAllBookmarks())
    expect(result.current.selectionMode).toBe(true)
    expect(result.current.selectedIds.size).toBe(3)
    expect(result.current.selectedIds.has('b1')).toBe(true)
    expect(result.current.selectedIds.has('b2')).toBe(true)
    expect(result.current.selectedIds.has('b3')).toBe(true)
  })

  it('toggleSelectCurrent does nothing when not in selection mode', () => {
    const { result } = setup(bookmarks, 0)

    act(() => result.current.toggleSelectCurrent())
    expect(result.current.selectedIds.size).toBe(0)
  })

  it('toggleSelectCurrent selects item at selectedIndex', () => {
    const { result } = setup(bookmarks, 0)

    act(() => result.current.toggleSelectionMode())
    act(() => result.current.toggleSelectCurrent())
    expect(result.current.selectedIds.has('b1')).toBe(true)
  })

  it('selectNextWithShift enters selection mode and selects items', () => {
    let selectedIndex = 0
    const setSelectedIndex = (fn) => {
      selectedIndex = typeof fn === 'function' ? fn(selectedIndex) : fn
    }
    const { result } = renderHook(() =>
      useBookmarkSelection(bookmarks, { selectedIndex, setSelectedIndex })
    )

    act(() => result.current.selectNextWithShift())
    expect(result.current.selectionMode).toBe(true)
  })

  it('selectPrevWithShift enters selection mode and selects items', () => {
    let selectedIndex = 2
    const setSelectedIndex = (fn) => {
      selectedIndex = typeof fn === 'function' ? fn(selectedIndex) : fn
    }
    const { result } = renderHook(() =>
      useBookmarkSelection(bookmarks, { selectedIndex, setSelectedIndex })
    )

    act(() => result.current.selectPrevWithShift())
    expect(result.current.selectionMode).toBe(true)
  })

  it('selectNextWithShift is no-op for empty bookmarks', () => {
    const { result } = setup([])

    act(() => result.current.selectNextWithShift())
    expect(result.current.selectionMode).toBe(false)
  })

  it('selectPrevWithShift is no-op for empty bookmarks', () => {
    const { result } = setup([])

    act(() => result.current.selectPrevWithShift())
    expect(result.current.selectionMode).toBe(false)
  })
})
