import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useToast } from './useToast.js'

describe('useToast', () => {
  it('starts with empty toasts array', () => {
    const { result } = renderHook(() => useToast())
    expect(result.current.toasts).toEqual([])
  })

  it('addToast adds a toast and returns its id', () => {
    const { result } = renderHook(() => useToast())

    let id
    act(() => {
      id = result.current.addToast({ message: 'Test message' })
    })

    expect(id).toBeGreaterThan(0)
    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Test message')
    expect(result.current.toasts[0].duration).toBe(5000) // default
  })

  it('addToast respects custom duration', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast({ message: 'Test', duration: 3000 })
    })

    expect(result.current.toasts[0].duration).toBe(3000)
  })

  it('addToast supports action and actionLabel', () => {
    const { result } = renderHook(() => useToast())
    const action = () => {}

    act(() => {
      result.current.addToast({
        message: 'Undo?',
        action,
        actionLabel: 'Undo'
      })
    })

    expect(result.current.toasts[0].action).toBe(action)
    expect(result.current.toasts[0].actionLabel).toBe('Undo')
  })

  it('removeToast removes specific toast by id', () => {
    const { result } = renderHook(() => useToast())

    let id1, id2
    act(() => {
      id1 = result.current.addToast({ message: 'First' })
      id2 = result.current.addToast({ message: 'Second' })
    })

    expect(result.current.toasts).toHaveLength(2)

    act(() => {
      result.current.removeToast(id1)
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].id).toBe(id2)
  })

  it('clearToasts removes all toasts', () => {
    const { result } = renderHook(() => useToast())

    act(() => {
      result.current.addToast({ message: 'First' })
      result.current.addToast({ message: 'Second' })
    })

    expect(result.current.toasts).toHaveLength(2)

    act(() => {
      result.current.clearToasts()
    })

    expect(result.current.toasts).toEqual([])
  })
})
