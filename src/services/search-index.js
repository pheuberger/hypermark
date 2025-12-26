import MiniSearch from 'minisearch'

/**
 * Create and configure MiniSearch instance
 */
export function createSearchIndex() {
  return new MiniSearch({
    fields: ['title', 'description', 'tags'], // Fields to index
    storeFields: ['_id', 'title', 'url', 'tags'], // Fields to return in results
    searchOptions: {
      boost: { title: 2, tags: 1.5 }, // Boost title and tags in relevance
      fuzzy: 0.2, // Enable fuzzy matching
      prefix: true, // Enable prefix search
    },
  })
}

/**
 * Build search index from documents
 * @param {Array} bookmarks - Array of bookmark documents
 * @returns {MiniSearch} - Configured and indexed MiniSearch instance
 */
export function buildSearchIndex(bookmarks) {
  const searchIndex = createSearchIndex()

  // Prepare documents for indexing
  const documents = bookmarks.map((bookmark) => ({
    id: bookmark._id,
    _id: bookmark._id,
    title: bookmark.title || '',
    description: bookmark.description || '',
    url: bookmark.url || '',
    tags: Array.isArray(bookmark.tags) ? bookmark.tags.join(' ') : '',
  }))

  // Add all documents to index
  searchIndex.addAll(documents)

  return searchIndex
}

/**
 * Search bookmarks
 * @param {MiniSearch} searchIndex - MiniSearch instance
 * @param {string} query - Search query
 * @returns {Array} - Array of search result IDs with scores
 */
export function searchBookmarks(searchIndex, query) {
  if (!query || !query.trim()) {
    return []
  }

  try {
    const results = searchIndex.search(query.trim(), {
      fuzzy: 0.2,
      prefix: true,
    })

    // Return just the IDs and scores
    return results.map((result) => ({
      id: result.id,
      score: result.score,
    }))
  } catch (error) {
    console.error('Search error:', error)
    return []
  }
}

/**
 * Update search index with new/modified bookmark
 * @param {MiniSearch} searchIndex - MiniSearch instance
 * @param {Object} bookmark - Bookmark document
 */
export function updateSearchIndex(searchIndex, bookmark) {
  try {
    // Remove old version if exists
    if (searchIndex.has(bookmark._id)) {
      searchIndex.discard(bookmark._id)
    }

    // Add updated version
    searchIndex.add({
      id: bookmark._id,
      _id: bookmark._id,
      title: bookmark.title || '',
      description: bookmark.description || '',
      url: bookmark.url || '',
      tags: Array.isArray(bookmark.tags) ? bookmark.tags.join(' ') : '',
    })
  } catch (error) {
    console.error('Failed to update search index:', error)
  }
}

/**
 * Remove bookmark from search index
 * @param {MiniSearch} searchIndex - MiniSearch instance
 * @param {string} bookmarkId - Bookmark ID
 */
export function removeFromSearchIndex(searchIndex, bookmarkId) {
  try {
    if (searchIndex.has(bookmarkId)) {
      searchIndex.discard(bookmarkId)
    }
  } catch (error) {
    console.error('Failed to remove from search index:', error)
  }
}
