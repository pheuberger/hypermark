/**
 * Bookmark CRUD operations and validation
 */

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
    title: data.title.trim(),
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
 * Create a new bookmark
 * @param {Database} db - Fireproof database instance
 * @param {Object} bookmarkData - Bookmark data
 * @returns {Promise<Object>} - Created bookmark with _id
 */
export async function createBookmark(db, bookmarkData) {
  // Validate input
  const validated = validateBookmark(bookmarkData)

  // Create bookmark document
  const now = Date.now()
  const bookmark = {
    _id: `bookmark:${crypto.randomUUID()}`,
    type: 'bookmark',
    ...validated,
    createdAt: now,
    updatedAt: now,
  }

  // Save to database
  await db.put(bookmark)

  return bookmark
}

/**
 * Update an existing bookmark
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID to update
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} - Updated bookmark
 */
export async function updateBookmark(db, bookmarkId, updates) {
  // Get existing bookmark
  const existing = await db.get(bookmarkId)

  if (!existing || existing.type !== 'bookmark') {
    throw new Error('Bookmark not found')
  }

  // Merge updates with existing data
  const merged = {
    ...existing,
    ...updates,
    _id: bookmarkId, // Preserve ID
    type: 'bookmark', // Preserve type
    createdAt: existing.createdAt, // Preserve creation time
    updatedAt: Date.now(), // Update timestamp
  }

  // Validate merged data
  const validated = validateBookmark(merged)

  // Create updated document
  const updated = {
    ...existing,
    ...validated,
    updatedAt: Date.now(),
  }

  // Save to database
  await db.put(updated)

  return updated
}

/**
 * Delete a bookmark
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID to delete
 * @returns {Promise<void>}
 */
export async function deleteBookmark(db, bookmarkId) {
  // Get existing bookmark to verify it exists
  const existing = await db.get(bookmarkId)

  if (!existing || existing.type !== 'bookmark') {
    throw new Error('Bookmark not found')
  }

  // Delete from database
  await db.del(bookmarkId)
}

/**
 * Get a single bookmark by ID
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID
 * @returns {Promise<Object>} - Bookmark document
 */
export async function getBookmark(db, bookmarkId) {
  const doc = await db.get(bookmarkId)

  if (!doc || doc.type !== 'bookmark') {
    throw new Error('Bookmark not found')
  }

  return doc
}

/**
 * Get all bookmarks
 * @param {Database} db - Fireproof database instance
 * @returns {Promise<Array>} - Array of bookmark documents
 */
export async function getAllBookmarks(db) {
  const result = await db.allDocs()

  // Filter for bookmark documents only
  const bookmarks = result.rows
    .map(row => row.doc)
    .filter(doc => doc && doc.type === 'bookmark')

  return bookmarks
}

/**
 * Check if a URL already exists in bookmarks
 * @param {Database} db - Fireproof database instance
 * @param {string} url - URL to check
 * @returns {Promise<Array>} - Array of existing bookmarks with this URL
 */
export async function findBookmarksByUrl(db, url) {
  const normalized = normalizeUrl(url)
  const allBookmarks = await getAllBookmarks(db)

  return allBookmarks.filter(bookmark => {
    try {
      return normalizeUrl(bookmark.url) === normalized
    } catch {
      return false
    }
  })
}

/**
 * Get bookmarks by tag
 * @param {Database} db - Fireproof database instance
 * @param {string} tag - Tag to filter by
 * @returns {Promise<Array>} - Array of bookmarks with this tag
 */
export async function getBookmarksByTag(db, tag) {
  const normalized = tag.toLowerCase().trim()
  const allBookmarks = await getAllBookmarks(db)

  return allBookmarks.filter(bookmark =>
    Array.isArray(bookmark.tags) &&
    bookmark.tags.some(t => t.toLowerCase() === normalized)
  )
}

/**
 * Get all unique tags from all bookmarks
 * @param {Database} db - Fireproof database instance
 * @returns {Promise<Array>} - Array of unique tag strings
 */
export async function getAllTags(db) {
  const allBookmarks = await getAllBookmarks(db)

  const tagSet = new Set()
  allBookmarks.forEach(bookmark => {
    if (Array.isArray(bookmark.tags)) {
      bookmark.tags.forEach(tag => tagSet.add(tag))
    }
  })

  return Array.from(tagSet).sort()
}

/**
 * Toggle read-later status on a bookmark
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID
 * @returns {Promise<Object>} - Updated bookmark
 */
export async function toggleReadLater(db, bookmarkId) {
  const bookmark = await getBookmark(db, bookmarkId)

  return updateBookmark(db, bookmarkId, {
    readLater: !bookmark.readLater
  })
}

/**
 * Add a tag to a bookmark
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID
 * @param {string} tag - Tag to add
 * @returns {Promise<Object>} - Updated bookmark
 */
export async function addTag(db, bookmarkId, tag) {
  const bookmark = await getBookmark(db, bookmarkId)
  const normalized = tag.toLowerCase().trim()

  if (!normalized) {
    throw new Error('Tag cannot be empty')
  }

  // Check if tag already exists
  const tags = bookmark.tags || []
  if (tags.some(t => t.toLowerCase() === normalized)) {
    return bookmark // Already has this tag
  }

  return updateBookmark(db, bookmarkId, {
    tags: [...tags, normalized]
  })
}

/**
 * Remove a tag from a bookmark
 * @param {Database} db - Fireproof database instance
 * @param {string} bookmarkId - Bookmark ID
 * @param {string} tag - Tag to remove
 * @returns {Promise<Object>} - Updated bookmark
 */
export async function removeTag(db, bookmarkId, tag) {
  const bookmark = await getBookmark(db, bookmarkId)
  const normalized = tag.toLowerCase().trim()

  const tags = bookmark.tags || []
  const filtered = tags.filter(t => t.toLowerCase() !== normalized)

  return updateBookmark(db, bookmarkId, {
    tags: filtered
  })
}
