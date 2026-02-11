import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { parseHash, toHash, useHashRouter } from './useHashRouter.js'

describe('parseHash', () => {
  it('returns defaults for empty string', () => {
    expect(parseHash('')).toEqual({ view: 'bookmarks', filter: 'all', tag: null })
  })

  it('returns defaults for #/', () => {
    expect(parseHash('#/')).toEqual({ view: 'bookmarks', filter: 'all', tag: null })
  })

  it('parses #/inbox as fallback to all', () => {
    expect(parseHash('#/inbox')).toEqual({ view: 'bookmarks', filter: 'all', tag: null })
  })

  it('parses #/read-later', () => {
    expect(parseHash('#/read-later')).toEqual({ view: 'bookmarks', filter: 'read-later', tag: null })
  })

  it('parses #/tag/design', () => {
    expect(parseHash('#/tag/design')).toEqual({ view: 'bookmarks', filter: 'tag', tag: 'design' })
  })

  it('decodes encoded tag names', () => {
    expect(parseHash('#/tag/my%20tag')).toEqual({ view: 'bookmarks', filter: 'tag', tag: 'my tag' })
  })

  it('parses #/settings', () => {
    expect(parseHash('#/settings')).toEqual({ view: 'settings', filter: 'all', tag: null })
  })

  it('falls back to defaults for unknown routes', () => {
    expect(parseHash('#/unknown')).toEqual({ view: 'bookmarks', filter: 'all', tag: null })
  })
})

describe('toHash', () => {
  it('returns #/settings for settings view', () => {
    expect(toHash('settings', 'all', null)).toBe('#/settings')
  })

  it('returns #/ for inbox filter (removed feature)', () => {
    expect(toHash('bookmarks', 'inbox', null)).toBe('#/')
  })

  it('returns #/read-later for read-later filter', () => {
    expect(toHash('bookmarks', 'read-later', null)).toBe('#/read-later')
  })

  it('returns encoded tag hash for tag filter', () => {
    expect(toHash('bookmarks', 'tag', 'my tag')).toBe('#/tag/my%20tag')
  })

  it('returns #/ for default all filter', () => {
    expect(toHash('bookmarks', 'all', null)).toBe('#/')
  })
})

describe('parseHash/toHash round-trip', () => {
  const cases = [
    { view: 'bookmarks', filter: 'all', tag: null },
    { view: 'bookmarks', filter: 'read-later', tag: null },
    { view: 'settings', filter: 'all', tag: null },
    { view: 'bookmarks', filter: 'tag', tag: 'design' },
    { view: 'bookmarks', filter: 'tag', tag: 'my tag' },
  ]

  cases.forEach(({ view, filter, tag }) => {
    it(`round-trips ${view}/${filter}/${tag}`, () => {
      const hash = toHash(view, filter, tag)
      expect(parseHash(hash)).toEqual({ view, filter, tag })
    })
  })
})

describe('useHashRouter', () => {
  let originalHash

  beforeEach(() => {
    originalHash = window.location.hash
    window.location.hash = ''
  })

  afterEach(() => {
    window.location.hash = originalHash
  })

  it('returns initial state from current hash', () => {
    window.location.hash = '#/read-later'
    const { result } = renderHook(() => useHashRouter())
    expect(result.current.view).toBe('bookmarks')
    expect(result.current.filter).toBe('read-later')
    expect(result.current.tag).toBeNull()
  })

  it('returns default state for empty hash', () => {
    const { result } = renderHook(() => useHashRouter())
    expect(result.current.view).toBe('bookmarks')
    expect(result.current.filter).toBe('all')
    expect(result.current.tag).toBeNull()
  })

  it('navigate updates window.location.hash', () => {
    const { result } = renderHook(() => useHashRouter())

    act(() => {
      result.current.navigate('#/read-later')
    })

    expect(window.location.hash).toBe('#/read-later')
  })

  it('responds to hashchange events', () => {
    const { result } = renderHook(() => useHashRouter())

    act(() => {
      window.location.hash = '#/settings'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })

    expect(result.current.view).toBe('settings')
    expect(result.current.filter).toBe('all')
  })

  it('navigate does not set hash if already current', () => {
    window.location.hash = '#/read-later'
    const { result } = renderHook(() => useHashRouter())

    const hashBefore = window.location.hash

    act(() => {
      result.current.navigate('#/read-later')
    })

    expect(window.location.hash).toBe(hashBefore)
  })

  it('provides navigate as a stable callback', () => {
    const { result, rerender } = renderHook(() => useHashRouter())
    const firstNavigate = result.current.navigate
    rerender()
    expect(result.current.navigate).toBe(firstNavigate)
  })
})
