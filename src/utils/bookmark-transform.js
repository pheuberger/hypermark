/**
 * Bookmark data transformation utilities.
 *
 * Pure functions for converting between plain bookmark objects
 * and Yjs Y.Map instances. No React dependencies.
 *
 * Extracted from useNostrSync.js for reuse and testability.
 */

import * as Y from 'yjs'

/**
 * Convert a plain bookmark object to a Y.Map for Yjs storage.
 * @param {Object} bookmarkData - Plain bookmark object from Nostr
 * @returns {Y.Map} - Y.Map instance
 */
export function bookmarkDataToYMap(bookmarkData) {
  const ymap = new Y.Map()

  // Set all bookmark properties
  if (bookmarkData.url) ymap.set('url', bookmarkData.url)
  if (bookmarkData.title) ymap.set('title', bookmarkData.title)
  if (bookmarkData.description) ymap.set('description', bookmarkData.description)
  if (bookmarkData.favicon) ymap.set('favicon', bookmarkData.favicon)
  if (bookmarkData.preview) ymap.set('preview', bookmarkData.preview)
  if (bookmarkData.readLater !== undefined) ymap.set('readLater', bookmarkData.readLater)
  if (bookmarkData.createdAt) ymap.set('createdAt', bookmarkData.createdAt)
  if (bookmarkData.updatedAt) ymap.set('updatedAt', bookmarkData.updatedAt)

  // Handle tags array - convert to Y.Array
  if (bookmarkData.tags && Array.isArray(bookmarkData.tags) && bookmarkData.tags.length > 0) {
    const tagsArray = new Y.Array()
    // Filter out any undefined/null values before pushing
    const validTags = bookmarkData.tags.filter(t => t != null)
    if (validTags.length > 0) {
      tagsArray.push(validTags)
    }
    ymap.set('tags', tagsArray)
  } else {
    // Set empty tags array
    ymap.set('tags', new Y.Array())
  }

  return ymap
}

/**
 * Convert a Y.Map bookmark to a plain object for publishing.
 * Handles both Y.Map and plain object formats.
 * @param {Y.Map|Object} bookmark - Bookmark in Y.Map or plain object form
 * @returns {Object} - Plain bookmark object
 */
export function ymapToBookmarkData(bookmark) {
  if (bookmark.get) {
    return {
      url: bookmark.get('url'),
      title: bookmark.get('title'),
      description: bookmark.get('description') || '',
      tags: bookmark.get('tags')?.toArray?.() || bookmark.get('tags') || [],
      readLater: bookmark.get('readLater') || false,
      favicon: bookmark.get('favicon') || null,
      preview: bookmark.get('preview') || null,
      createdAt: bookmark.get('createdAt'),
      updatedAt: bookmark.get('updatedAt'),
    }
  }
  return { ...bookmark }
}
