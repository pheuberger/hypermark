/**
 * Bookmark Transform Tests
 * Tests for src/utils/bookmark-transform.js
 */

import { describe, it, expect } from 'vitest'
import * as Y from 'yjs'
import { bookmarkDataToYMap, ymapToBookmarkData } from './bookmark-transform.js'

/**
 * Helper: integrate a standalone Y.Map into a Y.Doc so .get() works reliably.
 */
function integrateYMap(ymap, key = 'test') {
  const doc = new Y.Doc()
  doc.getMap('root').set(key, ymap)
  return doc.getMap('root').get(key)
}

describe('bookmark-transform', () => {
  describe('bookmarkDataToYMap', () => {
    it('converts basic bookmark data to Y.Map', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        description: 'A test',
        readLater: false,
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))

      expect(ymap).toBeInstanceOf(Y.Map)
      expect(ymap.get('url')).toBe('https://example.com')
      expect(ymap.get('title')).toBe('Example')
      expect(ymap.get('description')).toBe('A test')
      expect(ymap.get('readLater')).toBe(false)
      expect(ymap.get('createdAt')).toBe(1000)
      expect(ymap.get('updatedAt')).toBe(2000)
    })

    it('converts tags array to Y.Array', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        tags: ['js', 'react'],
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      const tags = ymap.get('tags')

      expect(tags).toBeInstanceOf(Y.Array)
      expect(tags.toArray()).toEqual(['js', 'react'])
    })

    it('creates empty Y.Array for missing tags', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      const tags = ymap.get('tags')

      expect(tags).toBeInstanceOf(Y.Array)
      expect(tags.toArray()).toEqual([])
    })

    it('creates empty Y.Array for empty tags array', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        tags: [],
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      expect(ymap.get('tags').toArray()).toEqual([])
    })

    it('filters null/undefined values from tags', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        tags: ['valid', null, undefined, 'also-valid'],
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      expect(ymap.get('tags').toArray()).toEqual(['valid', 'also-valid'])
    })

    it('sets optional fields when provided', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        favicon: 'https://example.com/favicon.ico',
        preview: 'https://example.com/preview.png',
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      expect(ymap.get('favicon')).toBe('https://example.com/favicon.ico')
      expect(ymap.get('preview')).toBe('https://example.com/preview.png')
    })

    it('does not set falsy optional fields', () => {
      const data = {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        favicon: null,
        preview: null,
        createdAt: 1000,
        updatedAt: 2000,
      }

      const ymap = integrateYMap(bookmarkDataToYMap(data))
      // Empty description and null fields are falsy, so not set by the function
      expect(ymap.get('description')).toBeUndefined()
      expect(ymap.get('favicon')).toBeUndefined()
      expect(ymap.get('preview')).toBeUndefined()
    })
  })

  describe('ymapToBookmarkData', () => {
    it('converts Y.Map to plain object', () => {
      const doc = new Y.Doc()
      const ymap = doc.getMap('test')
      ymap.set('url', 'https://example.com')
      ymap.set('title', 'Example')
      ymap.set('description', 'A test')
      ymap.set('readLater', true)
      ymap.set('inbox', false)
      ymap.set('favicon', 'favicon.ico')
      ymap.set('preview', 'preview.png')
      ymap.set('createdAt', 1000)
      ymap.set('updatedAt', 2000)

      const tagsArray = new Y.Array()
      ymap.set('tags', tagsArray)
      ymap.get('tags').push(['js', 'react'])

      const result = ymapToBookmarkData(ymap)

      expect(result.url).toBe('https://example.com')
      expect(result.title).toBe('Example')
      expect(result.description).toBe('A test')
      expect(result.tags).toEqual(['js', 'react'])
      expect(result.readLater).toBe(true)
      expect(result.inbox).toBe(false)
      expect(result.favicon).toBe('favicon.ico')
      expect(result.preview).toBe('preview.png')
      expect(result.createdAt).toBe(1000)
      expect(result.updatedAt).toBe(2000)
    })

    it('returns plain object as-is (shallow copy)', () => {
      const plainObj = {
        url: 'https://example.com',
        title: 'Example',
        tags: ['test'],
      }

      const result = ymapToBookmarkData(plainObj)
      expect(result).toEqual(plainObj)
      // Should be a new object (spread copy)
      expect(result).not.toBe(plainObj)
    })

    it('provides defaults for missing Y.Map fields', () => {
      const doc = new Y.Doc()
      const ymap = doc.getMap('test')
      ymap.set('url', 'https://example.com')
      ymap.set('title', 'Example')

      const result = ymapToBookmarkData(ymap)

      expect(result.description).toBe('')
      expect(result.tags).toEqual([])
      expect(result.readLater).toBe(false)
      expect(result.inbox).toBe(false)
      expect(result.favicon).toBeNull()
      expect(result.preview).toBeNull()
    })
  })
})
