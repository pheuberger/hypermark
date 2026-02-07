/**
 * Wordlist Tests
 * Tests for src/services/wordlist.js
 */

import { describe, it, expect } from 'vitest'
import { wordlist, deriveVerificationWords, getWordlistInfo } from './wordlist.js'

describe('wordlist', () => {
  describe('wordlist array', () => {
    it('has a reasonable number of words', () => {
      expect(wordlist.length).toBeGreaterThan(100)
    })

    it('contains only non-empty strings', () => {
      wordlist.forEach(word => {
        expect(typeof word).toBe('string')
        expect(word.length).toBeGreaterThan(0)
      })
    })
  })

  describe('getWordlistInfo', () => {
    it('returns count matching wordlist length', () => {
      const info = getWordlistInfo()
      expect(info.count).toBe(wordlist.length)
    })

    it('returns sample of first 10 words', () => {
      const info = getWordlistInfo()
      expect(info.sample).toHaveLength(10)
      expect(info.sample).toEqual(wordlist.slice(0, 10))
    })
  })

  describe('deriveVerificationWords', () => {
    it('returns two words from the wordlist', async () => {
      // Create a CryptoKey for testing
      const rawKey = crypto.getRandomValues(new Uint8Array(32))
      const sessionKey = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'HMAC', hash: 'SHA-256' },
        true,
        ['sign']
      )

      const words = await deriveVerificationWords(sessionKey, 'test-session')

      expect(words).toHaveLength(2)
      expect(wordlist).toContain(words[0])
      expect(wordlist).toContain(words[1])
    })

    it('is deterministic for same key and session', async () => {
      const rawKey = new Uint8Array(32).fill(42)
      const sessionKey = await crypto.subtle.importKey(
        'raw',
        rawKey,
        { name: 'HMAC', hash: 'SHA-256' },
        true,
        ['sign']
      )

      const words1 = await deriveVerificationWords(sessionKey, 'session-1')
      const words2 = await deriveVerificationWords(sessionKey, 'session-1')

      expect(words1).toEqual(words2)
    })

    it('produces different words for different keys', async () => {
      const rawKey1 = new Uint8Array(32).fill(42)
      const rawKey2 = new Uint8Array(32).fill(99)
      const sessionKey1 = await crypto.subtle.importKey(
        'raw', rawKey1, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']
      )
      const sessionKey2 = await crypto.subtle.importKey(
        'raw', rawKey2, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']
      )

      const words1 = await deriveVerificationWords(sessionKey1, 'same-session')
      const words2 = await deriveVerificationWords(sessionKey2, 'same-session')

      // Different keys should produce different words
      expect(words1[0] !== words2[0] || words1[1] !== words2[1]).toBe(true)
    })

    it('handles non-extractable keys via fallback', async () => {
      // Create a non-extractable AES key (cannot be exported with exportKey('raw'))
      const key = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        false, // non-extractable
        ['encrypt', 'decrypt']
      )

      const words = await deriveVerificationWords(key, 'test-session')
      expect(words).toHaveLength(2)
      expect(wordlist).toContain(words[0])
      expect(wordlist).toContain(words[1])
    })
  })
})
