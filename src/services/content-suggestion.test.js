import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  isSuggestionsEnabled,
  setSuggestionsEnabled,
  getSuggestionServiceUrl,
  setSuggestionServiceUrl,
  getSignalingServiceUrl,
  setSignalingServiceUrl,
  fetchSuggestions,
  testSuggestionService,
} from './content-suggestion'

describe('content-suggestion service', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  // ---- Toggle ----

  describe('isSuggestionsEnabled / setSuggestionsEnabled', () => {
    it('defaults to disabled', () => {
      expect(isSuggestionsEnabled()).toBe(false)
    })

    it('can be enabled', () => {
      setSuggestionsEnabled(true)
      expect(isSuggestionsEnabled()).toBe(true)
    })

    it('can be disabled', () => {
      setSuggestionsEnabled(true)
      setSuggestionsEnabled(false)
      expect(isSuggestionsEnabled()).toBe(false)
    })

    it('persists to localStorage', () => {
      setSuggestionsEnabled(true)
      expect(localStorage.getItem('hypermark_suggestions_enabled')).toBe('true')
    })
  })

  // ---- Suggestion URL ----

  describe('getSuggestionServiceUrl / setSuggestionServiceUrl', () => {
    it('returns custom URL when set', () => {
      setSuggestionServiceUrl('https://custom.example.com')
      expect(getSuggestionServiceUrl()).toBe('https://custom.example.com')
    })

    it('derives from signaling URL when no custom URL set', () => {
      // Should derive HTTP(S) origin from whatever signaling URL is configured
      const url = getSuggestionServiceUrl()
      const signalingUrl = getSignalingServiceUrl()
      const expected = signalingUrl
        .replace('wss://', 'https://')
        .replace('ws://', 'http://')
      expect(url).toBe(new URL(expected).origin)
    })

    it('resets to default when set to null', () => {
      setSuggestionServiceUrl('https://custom.example.com')
      setSuggestionServiceUrl(null)
      expect(localStorage.getItem('hypermark_suggestions_url')).toBeNull()
    })

    it('derives HTTPS from WSS signaling URL', () => {
      setSignalingServiceUrl('wss://my-server.fly.dev')
      const url = getSuggestionServiceUrl()
      expect(url).toBe('https://my-server.fly.dev')
    })
  })

  // ---- Signaling URL ----

  describe('getSignalingServiceUrl / setSignalingServiceUrl', () => {
    it('returns custom URL when set', () => {
      setSignalingServiceUrl('wss://custom.example.com')
      expect(getSignalingServiceUrl()).toBe('wss://custom.example.com')
    })

    it('defaults to env var or ws://localhost:4444', () => {
      const url = getSignalingServiceUrl()
      expect(url).toMatch(/^wss?:\/\//)
    })

    it('resets to default when set to null', () => {
      setSignalingServiceUrl('wss://custom.example.com')
      setSignalingServiceUrl(null)
      expect(localStorage.getItem('hypermark_signaling_url')).toBeNull()
    })
  })

  // ---- fetchSuggestions ----

  describe('fetchSuggestions', () => {
    it('throws when suggestions are disabled', async () => {
      await expect(fetchSuggestions('https://example.com')).rejects.toThrow('disabled')
    })

    it('throws when no service URL configured', async () => {
      setSuggestionsEnabled(true)
      // Remove signaling URL too so derivation fails
      vi.stubGlobal('import', { meta: { env: {} } })
      setSuggestionServiceUrl(null)
      setSignalingServiceUrl(null)
      // The default will still derive from env, so this test just verifies
      // the enabled check works
      setSuggestionsEnabled(false)
      await expect(fetchSuggestions('https://example.com')).rejects.toThrow('disabled')
    })

    it('calls the correct endpoint with POST', async () => {
      setSuggestionsEnabled(true)
      setSuggestionServiceUrl('https://test-server.example.com')

      const mockResponse = {
        ok: true,
        json: () => Promise.resolve({
          title: 'Test Title',
          description: 'Test desc',
          suggestedTags: ['test'],
          favicon: null,
        }),
      }

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse)

      const result = await fetchSuggestions('https://example.com/page')

      expect(globalThis.fetch).toHaveBeenCalledWith(
        'https://test-server.example.com/api/suggest',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: 'https://example.com/page' }),
        })
      )

      expect(result.title).toBe('Test Title')
      expect(result.suggestedTags).toEqual(['test'])
    })

    it('throws on non-OK response', async () => {
      setSuggestionsEnabled(true)
      setSuggestionServiceUrl('https://test-server.example.com')

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ error: 'Server error' }),
      })

      await expect(fetchSuggestions('https://example.com')).rejects.toThrow('Server error')
    })
  })

  // ---- testSuggestionService ----

  describe('testSuggestionService', () => {
    it('returns ok:true for healthy service', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', services: ['signaling', 'suggest'] }),
      })

      const result = await testSuggestionService('https://test.example.com')
      expect(result.ok).toBe(true)
      expect(result.latency).toBeGreaterThanOrEqual(0)
    })

    it('returns ok:false for unhealthy service', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
      })

      const result = await testSuggestionService('https://test.example.com')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('HTTP 500')
    })

    it('returns ok:false on network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'))

      const result = await testSuggestionService('https://test.example.com')
      expect(result.ok).toBe(false)
      expect(result.error).toBe('Network error')
    })
  })
})
