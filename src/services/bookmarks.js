/**
 * Bookmark Service
 * CRUD operations for bookmarks using Yjs
 */

import * as Y from 'yjs'
import { getYdocInstance, LOCAL_ORIGIN } from '../hooks/useYjs'

// Helper to get ydoc instance
function getYdoc() {
  const doc = getYdocInstance()
  if (!doc) {
    throw new Error('[Bookmarks] Yjs not initialized')
  }
  return doc
}

/**
 * Normalize URL to canonical form
 * @param {string} url - Raw URL input
 * @returns {string} - Normalized URL
 */
export function normalizeUrl(url) {
  try {
    // Add protocol if missing
    if (!url.match(/^https?:\/\//i)) {
      url = 'https://' + url
    }

    const urlObj = new URL(url)

    // Remove trailing slash from pathname
    if (urlObj.pathname.endsWith('/') && urlObj.pathname.length > 1) {
      urlObj.pathname = urlObj.pathname.slice(0, -1)
    }

    // Sort query parameters for consistency
    urlObj.searchParams.sort()

    // Convert to lowercase hostname
    urlObj.hostname = urlObj.hostname.toLowerCase()

    return urlObj.toString()
  } catch (err) {
    throw new Error('Invalid URL format')
  }
}

/**
 * Validate URL format
 * @param {string} url - URL to validate
 * @returns {boolean}
 */
export function isValidUrl(url) {
  try {
    const normalized = normalizeUrl(url)
    const urlObj = new URL(normalized)
    return urlObj.protocol === 'http:' || urlObj.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Validate bookmark data
 * @param {Object} data - Bookmark data to validate
 * @returns {Object} - Validated and normalized bookmark data
 * @throws {Error} - If validation fails
 */
export function validateBookmark(data) {
  // Validate URL
  if (!data.url || typeof data.url !== 'string') {
    throw new Error('URL is required')
  }

  if (!isValidUrl(data.url)) {
    throw new Error('Invalid URL format')
  }

  // Validate title (not required for inbox items)
  if (!data.inbox && (!data.title || typeof data.title !== 'string' || !data.title.trim())) {
    throw new Error('Title is required')
  }

  // Normalize and validate fields
  const validated = {
    url: normalizeUrl(data.url),
    title: data.title ? data.title.trim() : '',
    description: (data.description || '').trim(),
    tags: Array.isArray(data.tags)
      ? data.tags
          .map(tag => typeof tag === 'string' ? tag.trim().toLowerCase() : '')
          .filter(tag => tag.length > 0)
      : [],
    readLater: Boolean(data.readLater),
    inbox: Boolean(data.inbox),
    favicon: data.favicon || null,
    preview: data.preview || null,
  }

  return validated
}

/**
 * Get all bookmarks as array
 */
export function getAllBookmarks() {
  const bookmarksMap = getYdoc().getMap('bookmarks')
  const bookmarks = []

  for (const [id, bookmark] of bookmarksMap.entries()) {
    bookmarks.push(bookmarkToObject(id, bookmark))
  }

  // Sort by createdAt descending
  return bookmarks.sort((a, b) => b.createdAt - a.createdAt)
}

/**
 * Get single bookmark by ID
 */
export function getBookmark(id) {
  const bookmarksMap = getYdoc().getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }
  return bookmarkToObject(id, bookmark)
}

/**
 * Create new bookmark
 */
export function createBookmark(bookmarkData) {
  // Validate input
  const validated = validateBookmark(bookmarkData)

  const id = `bookmark:${generateId()}`
  const now = Date.now()

  // Create Y.Array for tags and populate it
  const tagsArray = new Y.Array()
  tagsArray.insert(0, validated.tags)

  // Create Y.Map for bookmark
  const bookmark = new Y.Map([
    ['id', id],
    ['url', validated.url],
    ['title', validated.title],
    ['description', validated.description],
    ['tags', tagsArray],
    ['readLater', validated.readLater],
    ['inbox', validated.inbox],
    ['favicon', validated.favicon],
    ['preview', validated.preview],
    ['createdAt', now],
    ['updatedAt', now],
  ])

  // Add to bookmarks map (wrapped in transaction for undo support)
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  doc.transact(() => {
    bookmarksMap.set(id, bookmark)
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Created:', id)
  return bookmarkToObject(id, bookmark)
}

/**
 * Update existing bookmark
 */
export function updateBookmark(id, updates) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  // Merge with existing for validation
  const existing = bookmarkToObject(id, bookmark)
  const merged = { ...existing, ...updates }
  const validated = validateBookmark(merged)

  // Wrap all updates in a single transaction for undo support
  doc.transact(() => {
    if (updates.title !== undefined) bookmark.set('title', validated.title)
    if (updates.url !== undefined) bookmark.set('url', validated.url)
    if (updates.description !== undefined) bookmark.set('description', validated.description)
    if (updates.readLater !== undefined) bookmark.set('readLater', validated.readLater)
    if (updates.inbox !== undefined) bookmark.set('inbox', validated.inbox)
    if (updates.favicon !== undefined) bookmark.set('favicon', validated.favicon)
    if (updates.preview !== undefined) bookmark.set('preview', validated.preview)

    // Update tags (replace entire array)
    if (updates.tags !== undefined) {
      const tagsArray = bookmark.get('tags')
      tagsArray.delete(0, tagsArray.length) // Clear
      tagsArray.insert(0, validated.tags) // Insert new
    }

    bookmark.set('updatedAt', Date.now())
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Updated:', id)
  return bookmarkToObject(id, bookmark)
}

/**
 * Delete bookmark
 */
export function deleteBookmark(id) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')

  if (!bookmarksMap.has(id)) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  doc.transact(() => {
    bookmarksMap.delete(id)
  }, LOCAL_ORIGIN)
  console.log('[Bookmarks] Deleted:', id)
}

/**
 * Toggle read-later status
 */
export function toggleReadLater(id) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const current = bookmark.get('readLater')
  doc.transact(() => {
    bookmark.set('readLater', !current)
    bookmark.set('updatedAt', Date.now())
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Toggled read-later:', id, !current)
  return !current
}

/**
 * Add tag to bookmark
 */
export function addTag(id, tag) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const normalized = tag.toLowerCase().trim()
  if (!normalized) {
    throw new Error('Tag cannot be empty')
  }

  const tags = bookmark.get('tags')
  const existingTags = tags.toArray()

  if (!existingTags.includes(normalized)) {
    doc.transact(() => {
      tags.push([normalized])
      bookmark.set('updatedAt', Date.now())
    }, LOCAL_ORIGIN)
    console.log('[Bookmarks] Added tag:', id, normalized)
  }
}

/**
 * Remove tag from bookmark
 */
export function removeTag(id, tag) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const normalized = tag.toLowerCase().trim()
  const tags = bookmark.get('tags')
  const index = tags.toArray().indexOf(normalized)

  if (index !== -1) {
    doc.transact(() => {
      tags.delete(index, 1)
      bookmark.set('updatedAt', Date.now())
    }, LOCAL_ORIGIN)
    console.log('[Bookmarks] Removed tag:', id, normalized)
  }
}

/**
 * Find bookmarks by URL
 */
export function findBookmarksByUrl(url) {
  const normalized = normalizeUrl(url)
  const all = getAllBookmarks()

  return all.filter(bookmark => {
    try {
      return normalizeUrl(bookmark.url) === normalized
    } catch {
      return false
    }
  })
}

/**
 * Get bookmarks by tag
 */
export function getBookmarksByTag(tag) {
  const normalized = tag.toLowerCase().trim()
  const all = getAllBookmarks()

  return all.filter(bookmark => bookmark.tags.includes(normalized))
}

/**
 * Get all read-later bookmarks
 */
export function getReadLaterBookmarks() {
  const all = getAllBookmarks()
  return all.filter(bookmark => bookmark.readLater)
}

/**
 * Get all inbox bookmarks
 */
export function getInboxBookmarks() {
  const all = getAllBookmarks()
  return all.filter(bookmark => bookmark.inbox)
}

/**
 * Create inbox item from URL
 * @param {string} url - URL to add to inbox
 * @returns {Object} - Created bookmark object
 * @throws {Error} - If URL is invalid or duplicate
 */
export function createInboxItem(url) {
  // Validate URL
  if (!url || typeof url !== 'string') {
    throw new Error('URL is required')
  }

  if (!isValidUrl(url)) {
    throw new Error('Invalid URL format')
  }

  // Check for duplicates
  const existing = findBookmarksByUrl(url)
  if (existing.length > 0) {
    throw new Error('Bookmark already exists for this URL')
  }

  // Extract domain as title
  const domain = new URL(normalizeUrl(url)).hostname

  // Create inbox bookmark
  const bookmarkData = {
    url,
    title: domain,
    description: '',
    tags: [],
    readLater: false,
    inbox: true,
  }

  return createBookmark(bookmarkData)
}

/**
 * Move bookmark from inbox (set inbox to false)
 * @param {string} id - Bookmark ID
 */
export function moveFromInbox(id) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const bookmark = bookmarksMap.get(id)

  if (!bookmark) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  doc.transact(() => {
    bookmark.set('inbox', false)
    bookmark.set('updatedAt', Date.now())
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Moved from inbox:', id)
}

/**
 * Get all unique tags
 */
export function getAllTags() {
  const bookmarksMap = getYdoc().getMap('bookmarks')
  const tagsSet = new Set()

  for (const [_, bookmark] of bookmarksMap.entries()) {
    const tags = bookmark.get('tags')
    if (tags) {
      tags.toArray().forEach(tag => tagsSet.add(tag))
    }
  }

  return Array.from(tagsSet).sort()
}

/**
 * Search bookmarks by query string
 */
export function searchBookmarks(query) {
  const all = getAllBookmarks()
  const lowerQuery = query.toLowerCase()

  return all.filter(bookmark => {
    return (
      bookmark.title.toLowerCase().includes(lowerQuery) ||
      bookmark.description.toLowerCase().includes(lowerQuery) ||
      bookmark.url.toLowerCase().includes(lowerQuery) ||
      bookmark.tags.some(tag => tag.toLowerCase().includes(lowerQuery))
    )
  })
}

// Helper functions

function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function bookmarkToObject(id, ymap) {
  return {
    _id: id,
    id: id,
    type: 'bookmark',
    url: ymap.get('url'),
    title: ymap.get('title'),
    description: ymap.get('description') || '',
    tags: ymap.get('tags')?.toArray() || [],
    readLater: ymap.get('readLater') || false,
    inbox: ymap.get('inbox') || false,
    favicon: ymap.get('favicon') || null,
    preview: ymap.get('preview') || null,
    createdAt: ymap.get('createdAt'),
    updatedAt: ymap.get('updatedAt'),
  }
}
