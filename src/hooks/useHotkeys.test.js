/**
 * useHotkeys Tests
 */

import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useHotkeys, useGlobalHotkey } from './useHotkeys.js'

function fireKeydown(key, opts = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts,
  })
  // Dispatch on body so e.target has a tagName (document doesn't)
  document.body.dispatchEvent(event)
  return event
}

describe('useHotkeys', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls handler on matching key press', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ j: handler }))

    act(() => fireKeydown('j'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls handler for escape key', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ escape: handler }))

    act(() => fireKeydown('Escape'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('calls handler for esc key alias', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ esc: handler }))

    act(() => fireKeydown('Escape'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('handles modifier keys (mod+k)', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'mod+k': handler }))

    act(() => fireKeydown('k', { ctrlKey: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('handles shift modifier', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'shift+j': handler }))

    act(() => fireKeydown('j', { shiftKey: true }))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not fire on non-matching key', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ j: handler }))

    act(() => fireKeydown('k'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('ignores input elements by default', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ j: handler }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'j',
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    act(() => document.dispatchEvent(event))

    expect(handler).not.toHaveBeenCalled()
    document.body.removeChild(input)
  })

  it('fires on inputs when enableOnInputs is true', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'mod+k': handler }, { enableOnInputs: true }))

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()

    const event = new KeyboardEvent('keydown', {
      key: 'k',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    })
    Object.defineProperty(event, 'target', { value: input })
    act(() => document.dispatchEvent(event))

    expect(handler).toHaveBeenCalledTimes(1)
    document.body.removeChild(input)
  })

  it('does nothing when disabled', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ j: handler }, { enabled: false }))

    act(() => fireKeydown('j'))
    expect(handler).not.toHaveBeenCalled()
  })

  it('supports key sequences (g h)', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'g h': handler }))

    act(() => fireKeydown('g'))
    expect(handler).not.toHaveBeenCalled()

    act(() => fireKeydown('h'))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('resets sequence on timeout', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'g h': handler }))

    act(() => fireKeydown('g'))
    act(() => vi.advanceTimersByTime(1000)) // > 800ms timeout
    act(() => fireKeydown('h'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('resets sequence on escape', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useHotkeys({ 'g h': handler }))

    act(() => fireKeydown('g'))
    act(() => fireKeydown('Escape'))
    act(() => fireKeydown('h'))

    expect(handler).not.toHaveBeenCalled()
  })

  it('handles space key', () => {
    const handler = vi.fn()
    renderHook(() => useHotkeys({ space: handler }))

    act(() => fireKeydown(' '))
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('multiple handlers work independently', () => {
    const handlerJ = vi.fn()
    const handlerK = vi.fn()
    renderHook(() => useHotkeys({ j: handlerJ, k: handlerK }))

    act(() => fireKeydown('j'))
    expect(handlerJ).toHaveBeenCalledTimes(1)
    expect(handlerK).not.toHaveBeenCalled()

    act(() => fireKeydown('k'))
    expect(handlerK).toHaveBeenCalledTimes(1)
  })

  it('cleans up event listener on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useHotkeys({ j: handler }))

    unmount()

    act(() => fireKeydown('j'))
    expect(handler).not.toHaveBeenCalled()
  })
})

describe('useGlobalHotkey', () => {
  it('registers a single hotkey', () => {
    const handler = vi.fn()
    renderHook(() => useGlobalHotkey('j', handler))

    act(() => fireKeydown('j'))
    expect(handler).toHaveBeenCalledTimes(1)
  })
})
