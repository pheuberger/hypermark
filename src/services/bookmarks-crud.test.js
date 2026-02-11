/**
 * Bookmarks CRUD Service Tests
 * Tests CRUD operations that require Yjs integration.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import * as Y from 'yjs'

// Create a real Yjs doc for testing
let testDoc

vi.mock('../hooks/useYjs', () => ({
  getYdocInstance: () => testDoc,
  LOCAL_ORIGIN: 'local',
}))

// Import after mock is set up
const {
  getAllBookmarks,
  getBookmark,
  createBookmark,
  updateBookmark,
  deleteBookmark,
  bulkDeleteBookmarks,
  toggleReadLater,
  addTag,
  removeTag,
  findBookmarksByUrl,
  getBookmarksByTag,
  getReadLaterBookmarks,
  getAllTags,
  searchBookmarks,
} = await import('./bookmarks.js')

describe('bookmarks CRUD', () => {
  beforeEach(() => {
    testDoc = new Y.Doc()
  })

  describe('createBookmark', () => {
    it('creates a bookmark and stores it in Y.Map', () => {
      const result = createBookmark({
        url: 'https://example.com',
        title: 'Example',
        description: 'Test desc',
        tags: ['test'],
      })

      expect(result.url).toBe('https://example.com/')
      expect(result.title).toBe('Example')
      expect(result.description).toBe('Test desc')
      expect(result.tags).toEqual(['test'])
      expect(result.id).toMatch(/^bookmark:/)
      expect(result.createdAt).toBeDefined()
      expect(result.updatedAt).toBeDefined()
    })

    it('stores bookmark in Yjs map', () => {
      createBookmark({ url: 'https://example.com', title: 'Test' })
      const bookmarksMap = testDoc.getMap('bookmarks')
      expect(bookmarksMap.size).toBe(1)
    })

    it('throws on invalid data', () => {
      expect(() => createBookmark({ url: '', title: 'Test' })).toThrow()
    })
  })

  describe('getAllBookmarks', () => {
    it('returns empty array when no bookmarks', () => {
      expect(getAllBookmarks()).toEqual([])
    })

    it('returns all bookmarks sorted by createdAt descending', () => {
      const b1 = createBookmark({ url: 'https://a.com', title: 'A' })
      const b2 = createBookmark({ url: 'https://b.com', title: 'B' })

      const all = getAllBookmarks()
      expect(all).toHaveLength(2)
      // Most recent first
      expect(all[0].createdAt).toBeGreaterThanOrEqual(all[1].createdAt)
    })
  })

  describe('getBookmark', () => {
    it('returns a bookmark by ID', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test' })
      const found = getBookmark(created.id)
      expect(found.url).toBe(created.url)
      expect(found.title).toBe(created.title)
    })

    it('throws for non-existent ID', () => {
      expect(() => getBookmark('bookmark:nonexistent')).toThrow('Bookmark not found')
    })
  })

  describe('updateBookmark', () => {
    it('updates bookmark fields', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Original' })
      const updated = updateBookmark(created.id, { title: 'Updated' })

      expect(updated.title).toBe('Updated')
      expect(updated.url).toBe(created.url)
      expect(updated.updatedAt).toBeGreaterThanOrEqual(created.updatedAt)
    })

    it('throws for non-existent ID', () => {
      expect(() => updateBookmark('bookmark:nonexistent', { title: 'Test' })).toThrow('Bookmark not found')
    })
  })

  describe('deleteBookmark', () => {
    it('removes a bookmark', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test' })
      deleteBookmark(created.id)
      expect(getAllBookmarks()).toHaveLength(0)
    })

    it('throws for non-existent ID', () => {
      expect(() => deleteBookmark('bookmark:nonexistent')).toThrow('Bookmark not found')
    })
  })

  describe('bulkDeleteBookmarks', () => {
    it('deletes multiple bookmarks', () => {
      const b1 = createBookmark({ url: 'https://a.com', title: 'A' })
      const b2 = createBookmark({ url: 'https://b.com', title: 'B' })
      createBookmark({ url: 'https://c.com', title: 'C' })

      const count = bulkDeleteBookmarks([b1.id, b2.id])
      expect(count).toBe(2)
      expect(getAllBookmarks()).toHaveLength(1)
    })

    it('returns 0 for empty array', () => {
      expect(bulkDeleteBookmarks([])).toBe(0)
    })

    it('returns 0 for non-array input', () => {
      expect(bulkDeleteBookmarks(null)).toBe(0)
    })

    it('skips non-existent IDs gracefully', () => {
      createBookmark({ url: 'https://a.com', title: 'A' })
      const count = bulkDeleteBookmarks(['bookmark:nonexistent'])
      expect(count).toBe(0)
      expect(getAllBookmarks()).toHaveLength(1)
    })
  })

  describe('toggleReadLater', () => {
    it('toggles readLater from false to true', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', readLater: false })
      const result = toggleReadLater(created.id)
      expect(result).toBe(true)
    })

    it('toggles readLater from true to false', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', readLater: true })
      const result = toggleReadLater(created.id)
      expect(result).toBe(false)
    })

    it('throws for non-existent ID', () => {
      expect(() => toggleReadLater('bookmark:nonexistent')).toThrow('Bookmark not found')
    })
  })

  describe('addTag', () => {
    it('adds a tag to a bookmark', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', tags: [] })
      addTag(created.id, 'newtag')
      const updated = getBookmark(created.id)
      expect(updated.tags).toContain('newtag')
    })

    it('normalizes tag to lowercase', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', tags: [] })
      addTag(created.id, '  JavaScript  ')
      const updated = getBookmark(created.id)
      expect(updated.tags).toContain('javascript')
    })

    it('does not add duplicate tags', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', tags: ['existing'] })
      addTag(created.id, 'existing')
      const updated = getBookmark(created.id)
      expect(updated.tags.filter(t => t === 'existing')).toHaveLength(1)
    })

    it('throws for empty tag', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test' })
      expect(() => addTag(created.id, '  ')).toThrow('Tag cannot be empty')
    })

    it('throws for non-existent ID', () => {
      expect(() => addTag('bookmark:nonexistent', 'tag')).toThrow('Bookmark not found')
    })
  })

  describe('removeTag', () => {
    it('removes an existing tag', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', tags: ['remove-me', 'keep'] })
      removeTag(created.id, 'remove-me')
      const updated = getBookmark(created.id)
      expect(updated.tags).not.toContain('remove-me')
      expect(updated.tags).toContain('keep')
    })

    it('is no-op when tag does not exist', () => {
      const created = createBookmark({ url: 'https://example.com', title: 'Test', tags: ['keep'] })
      removeTag(created.id, 'nonexistent')
      const updated = getBookmark(created.id)
      expect(updated.tags).toEqual(['keep'])
    })

    it('throws for non-existent ID', () => {
      expect(() => removeTag('bookmark:nonexistent', 'tag')).toThrow('Bookmark not found')
    })
  })

  describe('findBookmarksByUrl', () => {
    it('finds bookmarks with matching URL', () => {
      createBookmark({ url: 'https://example.com', title: 'Match' })
      createBookmark({ url: 'https://other.com', title: 'Other' })

      const results = findBookmarksByUrl('https://example.com')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Match')
    })

    it('normalizes URL for comparison', () => {
      createBookmark({ url: 'https://example.com', title: 'Match' })
      const results = findBookmarksByUrl('EXAMPLE.COM')
      expect(results).toHaveLength(1)
    })

    it('returns empty array when no match', () => {
      createBookmark({ url: 'https://example.com', title: 'Test' })
      expect(findBookmarksByUrl('https://nomatch.com')).toEqual([])
    })
  })

  describe('getBookmarksByTag', () => {
    it('returns bookmarks with matching tag', () => {
      createBookmark({ url: 'https://a.com', title: 'A', tags: ['match'] })
      createBookmark({ url: 'https://b.com', title: 'B', tags: ['other'] })

      const results = getBookmarksByTag('match')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('A')
    })

    it('normalizes tag for search', () => {
      createBookmark({ url: 'https://a.com', title: 'A', tags: ['javascript'] })
      const results = getBookmarksByTag('  JavaScript  ')
      expect(results).toHaveLength(1)
    })
  })

  describe('getReadLaterBookmarks', () => {
    it('returns only read-later bookmarks', () => {
      createBookmark({ url: 'https://a.com', title: 'A', readLater: true })
      createBookmark({ url: 'https://b.com', title: 'B', readLater: false })

      const results = getReadLaterBookmarks()
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('A')
    })
  })

  describe('getAllTags', () => {
    it('returns unique sorted tags across all bookmarks', () => {
      createBookmark({ url: 'https://a.com', title: 'A', tags: ['beta', 'alpha'] })
      createBookmark({ url: 'https://b.com', title: 'B', tags: ['alpha', 'gamma'] })

      const tags = getAllTags()
      expect(tags).toEqual(['alpha', 'beta', 'gamma'])
    })

    it('returns empty array when no bookmarks', () => {
      expect(getAllTags()).toEqual([])
    })
  })

  describe('searchBookmarks', () => {
    it('searches by title', () => {
      createBookmark({ url: 'https://a.com', title: 'JavaScript Guide' })
      createBookmark({ url: 'https://b.com', title: 'Python Tutorial' })

      const results = searchBookmarks('javascript')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('JavaScript Guide')
    })

    it('searches by description', () => {
      createBookmark({ url: 'https://a.com', title: 'Test', description: 'A great resource' })
      const results = searchBookmarks('great resource')
      expect(results).toHaveLength(1)
    })

    it('searches by URL', () => {
      createBookmark({ url: 'https://github.com/test', title: 'Test' })
      const results = searchBookmarks('github')
      expect(results).toHaveLength(1)
    })

    it('searches by tag', () => {
      createBookmark({ url: 'https://a.com', title: 'Test', tags: ['react'] })
      createBookmark({ url: 'https://b.com', title: 'Other', tags: ['vue'] })

      const results = searchBookmarks('react')
      expect(results).toHaveLength(1)
    })

    it('is case-insensitive', () => {
      createBookmark({ url: 'https://a.com', title: 'JavaScript' })
      expect(searchBookmarks('JAVASCRIPT')).toHaveLength(1)
    })
  })
})
