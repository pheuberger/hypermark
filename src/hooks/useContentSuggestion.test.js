import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useContentSuggestion } from './useContentSuggestion.js'
import { setSuggestionsEnabled, setSuggestionServiceUrl } from '../services/content-suggestion'

describe('useContentSuggestion', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('returns disabled when suggestions are off', () => {
    const { result } = renderHook(() => useContentSuggestion())
    expect(result.current.enabled).toBe(false)
    expect(result.current.suggestions).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('returns enabled when suggestions are on', () => {
    setSuggestionsEnabled(true)
    const { result } = renderHook(() => useContentSuggestion())
    expect(result.current.enabled).toBe(true)
  })

  it('suggest does nothing when disabled', async () => {
    const { result } = renderHook(() => useContentSuggestion())
    await act(async () => {
      await result.current.suggest('https://example.com')
    })
    expect(result.current.suggestions).toBeNull()
    expect(result.current.loading).toBe(false)
  })

  it('suggest does nothing with empty url', async () => {
    setSuggestionsEnabled(true)
    const { result } = renderHook(() => useContentSuggestion())
    await act(async () => {
      await result.current.suggest('')
    })
    expect(result.current.suggestions).toBeNull()
  })

  it('fetches suggestions successfully', async () => {
    setSuggestionsEnabled(true)
    setSuggestionServiceUrl('https://test.example.com')

    const mockData = {
      title: 'Example',
      description: 'A page',
      suggestedTags: ['web'],
      favicon: null,
    }

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockData),
    })

    const { result } = renderHook(() => useContentSuggestion())

    await act(async () => {
      await result.current.suggest('https://example.com')
    })

    expect(result.current.suggestions).toEqual(mockData)
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('sets error on fetch failure', async () => {
    setSuggestionsEnabled(true)
    setSuggestionServiceUrl('https://test.example.com')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.resolve({ error: 'Server error' }),
    })

    const { result } = renderHook(() => useContentSuggestion())

    await act(async () => {
      await result.current.suggest('https://example.com')
    })

    expect(result.current.suggestions).toBeNull()
    expect(result.current.error).toBe('Server error')
    expect(result.current.loading).toBe(false)
  })

  it('clear resets all state', async () => {
    setSuggestionsEnabled(true)
    setSuggestionServiceUrl('https://test.example.com')

    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ title: 'Test', description: '', suggestedTags: [], favicon: null }),
    })

    const { result } = renderHook(() => useContentSuggestion())

    await act(async () => {
      await result.current.suggest('https://example.com')
    })
    expect(result.current.suggestions).not.toBeNull()

    act(() => {
      result.current.clear()
    })

    expect(result.current.suggestions).toBeNull()
    expect(result.current.loading).toBe(false)
    expect(result.current.error).toBeNull()
  })
})
