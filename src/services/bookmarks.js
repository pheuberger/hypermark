/**
 * Bookmark Service
 * CRUD operations for bookmarks using Yjs
 *
 * Bookmarks are stored as plain objects in a Y.Map for simplicity.
 * This gives us sync + undo/redo without the complexity of nested Yjs types.
 */

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

  // Validate title
  if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
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

  // Create plain object for bookmark
  const bookmark = {
    id,
    url: validated.url,
    title: validated.title,
    description: validated.description,
    tags: validated.tags,
    readLater: validated.readLater,
    favicon: validated.favicon,
    preview: validated.preview,
    createdAt: now,
    updatedAt: now,
  }

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
  const raw = bookmarksMap.get(id)

  if (!raw) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  // Convert to plain object (handles Y.Map migration)
  const existing = toPlainObject(id, raw)

  // Merge with existing for validation
  const merged = { ...existing, ...updates }
  const validated = validateBookmark(merged)

  // Create updated bookmark object
  const updated = {
    ...existing,
    url: validated.url,
    title: validated.title,
    description: validated.description,
    tags: validated.tags,
    readLater: validated.readLater,
    favicon: validated.favicon,
    preview: validated.preview,
    updatedAt: Date.now(),
  }

  // Replace entire bookmark (wrapped in transaction for undo support)
  doc.transact(() => {
    bookmarksMap.set(id, updated)
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Updated:', id)
  return bookmarkToObject(id, updated)
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
 * Delete multiple bookmarks in a single transaction (for undo support)
 * @param {string[]} ids - Array of bookmark IDs to delete
 * @returns {number} - Number of bookmarks deleted
 */
export function bulkDeleteBookmarks(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0
  }

  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')

  let deletedCount = 0
  doc.transact(() => {
    for (const id of ids) {
      if (bookmarksMap.has(id)) {
        bookmarksMap.delete(id)
        deletedCount++
      }
    }
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Bulk deleted:', deletedCount, 'bookmarks')
  return deletedCount
}

/**
 * Set read-later on multiple bookmarks in a single transaction
 * @param {string[]} ids - Array of bookmark IDs
 * @param {boolean} value - Target read-later value
 * @returns {number} - Number of bookmarks updated
 */
export function bulkSetReadLater(ids, value) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0
  }

  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')

  let updatedCount = 0
  doc.transact(() => {
    for (const id of ids) {
      const raw = bookmarksMap.get(id)
      if (!raw) continue

      const bookmark = toPlainObject(id, raw)
      if (bookmark.readLater !== value) {
        bookmarksMap.set(id, { ...bookmark, readLater: value, updatedAt: Date.now() })
        updatedCount++
      }
    }
  }, LOCAL_ORIGIN)

  console.log(`[Bookmarks] Bulk set read-later: ${updatedCount} bookmarks → ${value}`)
  return updatedCount
}

/**
 * Add tags to multiple bookmarks in a single transaction
 * @param {string[]} ids - Array of bookmark IDs
 * @param {string[]} tags - Array of tags to add
 * @returns {number} - Number of bookmarks modified
 */
export function bulkAddTags(ids, tags) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return 0
  }
  if (!Array.isArray(tags) || tags.length === 0) {
    return 0
  }

  const normalizedTags = tags.map(t => t.toLowerCase().trim()).filter(Boolean)
  if (normalizedTags.length === 0) {
    return 0
  }

  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')

  let modifiedCount = 0
  doc.transact(() => {
    for (const id of ids) {
      const raw = bookmarksMap.get(id)
      if (!raw) continue

      const bookmark = toPlainObject(id, raw)
      const existingTags = bookmark.tags || []
      const newTags = normalizedTags.filter(t => !existingTags.includes(t))

      if (newTags.length > 0) {
        bookmarksMap.set(id, { ...bookmark, tags: [...existingTags, ...newTags], updatedAt: Date.now() })
        modifiedCount++
      }
    }
  }, LOCAL_ORIGIN)

  console.log(`[Bookmarks] Bulk added tags: ${modifiedCount} bookmarks modified`)
  return modifiedCount
}

/**
 * Toggle read-later status
 */
export function toggleReadLater(id) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const raw = bookmarksMap.get(id)

  if (!raw) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const bookmark = toPlainObject(id, raw)
  const newValue = !bookmark.readLater
  const updated = {
    ...bookmark,
    readLater: newValue,
    updatedAt: Date.now(),
  }

  doc.transact(() => {
    bookmarksMap.set(id, updated)
  }, LOCAL_ORIGIN)

  console.log('[Bookmarks] Toggled read-later:', id, newValue)
  return newValue
}

/**
 * Add tag to bookmark
 */
export function addTag(id, tag) {
  const doc = getYdoc()
  const bookmarksMap = doc.getMap('bookmarks')
  const raw = bookmarksMap.get(id)

  if (!raw) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const bookmark = toPlainObject(id, raw)
  const normalized = tag.toLowerCase().trim()
  if (!normalized) {
    throw new Error('Tag cannot be empty')
  }

  const tags = bookmark.tags || []
  if (!tags.includes(normalized)) {
    const updated = {
      ...bookmark,
      tags: [...tags, normalized],
      updatedAt: Date.now(),
    }

    doc.transact(() => {
      bookmarksMap.set(id, updated)
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
  const raw = bookmarksMap.get(id)

  if (!raw) {
    throw new Error(`Bookmark not found: ${id}`)
  }

  const bookmark = toPlainObject(id, raw)
  const normalized = tag.toLowerCase().trim()
  const tags = bookmark.tags || []
  const index = tags.indexOf(normalized)

  if (index !== -1) {
    const updated = {
      ...bookmark,
      tags: tags.filter(t => t !== normalized),
      updatedAt: Date.now(),
    }

    doc.transact(() => {
      bookmarksMap.set(id, updated)
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
 * Get all unique tags
 */
export function getAllTags() {
  const bookmarksMap = getYdoc().getMap('bookmarks')
  const tagsSet = new Set()

  for (const [id, raw] of bookmarksMap.entries()) {
    const bookmark = toPlainObject(id, raw)
    const tags = bookmark.tags || []
    tags.forEach(tag => tagsSet.add(tag))
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

/**
 * Normalize bookmark data to plain object (handles Y.Map migration)
 */
function toPlainObject(id, bookmark) {
  const isYMap = typeof bookmark.get === 'function'

  if (isYMap) {
    const tags = bookmark.get('tags')
    return {
      id: bookmark.get('id') || id,
      url: bookmark.get('url'),
      title: bookmark.get('title'),
      description: bookmark.get('description') || '',
      tags: tags?.toArray?.() || tags || [],
      readLater: bookmark.get('readLater') || false,
      favicon: bookmark.get('favicon') || null,
      preview: bookmark.get('preview') || null,
      createdAt: bookmark.get('createdAt'),
      updatedAt: bookmark.get('updatedAt'),
    }
  }

  return bookmark
}

function bookmarkToObject(id, bookmark) {
  // Handle both old Y.Map format and new plain object format
  // This enables migration from the old nested Yjs types
  const isYMap = typeof bookmark.get === 'function'

  if (isYMap) {
    // Old format: Y.Map with nested Y.Array for tags
    const tags = bookmark.get('tags')
    return {
      _id: id,
      id: bookmark.get('id') || id,
      type: 'bookmark',
      url: bookmark.get('url'),
      title: bookmark.get('title'),
      description: bookmark.get('description') || '',
      tags: tags?.toArray?.() || tags || [],
      readLater: bookmark.get('readLater') || false,
      favicon: bookmark.get('favicon') || null,
      preview: bookmark.get('preview') || null,
      createdAt: bookmark.get('createdAt'),
      updatedAt: bookmark.get('updatedAt'),
    }
  }

  // New format: plain object
  return {
    _id: id,
    id: bookmark.id || id,
    type: 'bookmark',
    url: bookmark.url,
    title: bookmark.title,
    description: bookmark.description || '',
    tags: bookmark.tags || [],
    readLater: bookmark.readLater || false,
    favicon: bookmark.favicon || null,
    preview: bookmark.preview || null,
    createdAt: bookmark.createdAt,
    updatedAt: bookmark.updatedAt,
  }
}
