/**
 * Bookmark Import/Export Service
 *
 * Handles export and import of bookmarks using the Netscape Bookmark HTML format,
 * which is compatible with Chrome, Firefox, Safari, and Edge.
 */

import { getAllBookmarks, createBookmark, findBookmarksByUrl, normalizeUrl, isValidUrl } from './bookmarks'

/**
 * Export bookmarks to Netscape Bookmark HTML format
 * @returns {string} HTML content
 */
export function exportToNetscapeHtml() {
  const bookmarks = getAllBookmarks()

  const lines = [
    '<!DOCTYPE NETSCAPE-Bookmark-file-1>',
    '<!-- This is an automatically generated file.',
    '     It will be read and overwritten.',
    '     DO NOT EDIT! -->',
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
    '<TITLE>Bookmarks</TITLE>',
    '<H1>Bookmarks</H1>',
    '<DL><p>',
  ]

  for (const bookmark of bookmarks) {
    const addDate = Math.floor(bookmark.createdAt / 1000)
    const lastModified = Math.floor(bookmark.updatedAt / 1000)

    // Build attributes
    const attrs = [
      `HREF="${escapeHtml(bookmark.url)}"`,
      `ADD_DATE="${addDate}"`,
      `LAST_MODIFIED="${lastModified}"`,
    ]

    // Add tags as TAGS attribute (comma-separated, supported by Chrome/Firefox)
    if (bookmark.tags && bookmark.tags.length > 0) {
      attrs.push(`TAGS="${escapeHtml(bookmark.tags.join(','))}"`)
    }

    const title = escapeHtml(bookmark.title || bookmark.url)
    lines.push(`    <DT><A ${attrs.join(' ')}>${title}</A>`)

    // Add description as DD element if present
    if (bookmark.description) {
      lines.push(`    <DD>${escapeHtml(bookmark.description)}`)
    }
  }

  lines.push('</DL><p>')

  return lines.join('\n')
}

/**
 * Trigger download of exported bookmarks
 */
export function downloadExport() {
  const html = exportToNetscapeHtml()
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)

  const date = new Date().toISOString().split('T')[0]
  const filename = `hypermark-bookmarks-${date}.html`

  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Parse Netscape Bookmark HTML and import bookmarks
 * @param {string} html - HTML content to parse
 * @returns {Object} Import result with counts
 */
export function importFromNetscapeHtml(html) {
  const result = {
    total: 0,
    imported: 0,
    skipped: 0,
    errors: [],
  }

  // Parse HTML using DOMParser
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Find all anchor tags (bookmarks)
  // DOMParser lowercases HTML elements, so use lowercase selector
  const anchors = doc.querySelectorAll('dt > a')

  for (const anchor of anchors) {
    result.total++

    try {
      // DOMParser lowercases attributes too
      const url = anchor.getAttribute('href')
      const title = anchor.textContent?.trim() || ''

      // Skip invalid URLs
      if (!url || !isValidUrl(url)) {
        result.errors.push(`Invalid URL: ${url}`)
        continue
      }

      // Check for duplicates
      const existing = findBookmarksByUrl(url)
      if (existing.length > 0) {
        result.skipped++
        continue
      }

      // Extract tags from multiple sources
      const tags = extractTags(anchor)

      // Extract description from following DD element
      const description = extractDescription(anchor)

      // Extract timestamps
      const addDate = anchor.getAttribute('ADD_DATE')
      const createdAt = addDate ? parseInt(addDate, 10) * 1000 : Date.now()

      // Create bookmark
      createBookmark({
        url,
        title: title || new URL(normalizeUrl(url)).hostname,
        description,
        tags,
        readLater: false,
        inbox: false,
      })

      result.imported++
    } catch (err) {
      result.errors.push(`Failed to import: ${err.message}`)
    }
  }

  return result
}

/**
 * Import bookmarks from a File object
 * @param {File} file - File to import
 * @returns {Promise<Object>} Import result
 */
export async function importFromFile(file) {
  const html = await file.text()
  return importFromNetscapeHtml(html)
}

/**
 * Extract tags from anchor element
 * Sources: TAGS attribute, folder hierarchy
 */
function extractTags(anchor) {
  const tags = new Set()

  // 1. Check TAGS attribute (Chrome/Firefox format)
  // DOMParser lowercases attributes
  const tagsAttr = anchor.getAttribute('tags')
  if (tagsAttr) {
    tagsAttr.split(',').forEach(tag => {
      const trimmed = tag.trim().toLowerCase()
      if (trimmed) tags.add(trimmed)
    })
  }

  // 2. Extract folder hierarchy as tags
  // Traverse up through the DOM looking for DL elements
  // For each DL, check its preceding siblings for folder name (H3)
  // Note: Different parsers handle Netscape format differently:
  // - Some wrap H3 in DT: <DT><H3>Folder</H3></DT>
  // - Some leave H3 as sibling: <H3>Folder</H3><DL>...
  let current = anchor.parentElement
  while (current) {
    if (current.tagName.toLowerCase() === 'dl') {
      // Look through preceding siblings for folder header
      let sibling = current.previousElementSibling
      while (sibling) {
        const tagName = sibling.tagName.toLowerCase()
        // Case 1: H3 is direct sibling (some parsers)
        if (tagName === 'h3') {
          const folderName = sibling.textContent?.trim().toLowerCase()
          if (folderName && !isRootFolder(folderName)) {
            tags.add(folderName)
          }
          break
        }
        // Case 2: H3 is inside DT (standard Netscape format)
        if (tagName === 'dt') {
          const h3 = sibling.querySelector('h3')
          if (h3) {
            const folderName = h3.textContent?.trim().toLowerCase()
            if (folderName && !isRootFolder(folderName)) {
              tags.add(folderName)
            }
            break
          }
        }
        sibling = sibling.previousElementSibling
      }
    }
    current = current.parentElement
  }

  return Array.from(tags)
}

/**
 * Check if folder name is a browser root folder (should not become a tag)
 */
function isRootFolder(name) {
  const rootFolders = [
    'bookmarks bar',
    'bookmarks toolbar',
    'toolbar',
    'other bookmarks',
    'other',
    'mobile bookmarks',
    'mobile',
    'bookmarks menu',
    'menu',
    'unfiled bookmarks',
    'imported',
    'imported bookmarks',
  ]
  return rootFolders.includes(name.toLowerCase())
}

/**
 * Extract description from DD element following the anchor's DT
 */
function extractDescription(anchor) {
  const dt = anchor.parentElement
  // DOMParser lowercases tagName
  if (dt?.tagName.toLowerCase() !== 'dt') return ''

  let sibling = dt.nextElementSibling
  if (sibling?.tagName.toLowerCase() === 'dd') {
    return sibling.textContent?.trim() || ''
  }

  return ''
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
