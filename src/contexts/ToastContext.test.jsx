import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { ToastProvider, useToastContext } from './ToastContext.jsx'

const wrapper = ({ children }) => <ToastProvider>{children}</ToastProvider>

describe('ToastContext', () => {
  it('addToast creates a toast with correct defaults', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper })

    act(() => {
      result.current.addToast({ message: 'Hello' })
    })

    expect(result.current.toasts).toHaveLength(1)
    expect(result.current.toasts[0].message).toBe('Hello')
    expect(result.current.toasts[0].type).toBe('info')
    expect(result.current.toasts[0].duration).toBe(5000)
  })

  it('addToast returns a unique numeric ID', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper })

    let id1, id2
    act(() => {
      id1 = result.current.addToast({ message: 'First' })
      id2 = result.current.addToast({ message: 'Second' })
    })

    expect(typeof id1).toBe('number')
    expect(typeof id2).toBe('number')
    expect(id1).not.toBe(id2)
  })

  it('removeToast removes the specified toast', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper })

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

  it('adding 4 toasts keeps only the last 3 (MAX_VISIBLE cap)', () => {
    const { result } = renderHook(() => useToastContext(), { wrapper })

    act(() => {
      result.current.addToast({ message: 'Toast 1' })
      result.current.addToast({ message: 'Toast 2' })
      result.current.addToast({ message: 'Toast 3' })
      result.current.addToast({ message: 'Toast 4' })
    })

    expect(result.current.toasts).toHaveLength(3)
    expect(result.current.toasts[0].message).toBe('Toast 2')
    expect(result.current.toasts[1].message).toBe('Toast 3')
    expect(result.current.toasts[2].message).toBe('Toast 4')
  })

  it('useToastContext throws when used outside ToastProvider', () => {
    // Suppress console.error from React for the expected error
    suppressConsoleErrors()

    expect(() => {
      renderHook(() => useToastContext())
    }).toThrow('useToastContext must be used within a ToastProvider')

    restoreConsole()
  })
})
