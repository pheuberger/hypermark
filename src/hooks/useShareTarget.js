import { useEffect, useRef } from 'react'
import { isValidUrl } from '../services/bookmarks'

/**
 * Extract a valid URL from the share target query params.
 * iOS/Android may put the URL in either the `shared_url` or `shared_text` param.
 * @param {URLSearchParams} params
 * @returns {string|null}
 */
function extractSharedUrl(params) {
  const url = params.get('shared_url')
  if (url && isValidUrl(url)) return url

  const text = params.get('shared_text') || ''
  // Some apps put the URL at the end of the text field
  const urlMatch = text.match(/https?:\/\/\S+/i)
  if (urlMatch && isValidUrl(urlMatch[0])) return urlMatch[0]

  // text itself might be a bare URL
  if (isValidUrl(text)) return text

  return null
}

/**
 * Hook that handles incoming Web Share Target data.
 * When the PWA is launched via the share sheet, the service worker redirects
 * to /?shared_url=...&shared_title=...&shared_text=... — this hook picks up
 * those params, creates a bookmark, and cleans up the URL.
 *
 * @param {Function} onSuccess - Called with the URL when a bookmark is created
 * @param {Function} onDuplicate - Called when the shared URL already exists
 */
export function useShareTarget(onSuccess, onDuplicate) {
  const processed = useRef(false)

  useEffect(() => {
    if (processed.current) return

    const params = new URLSearchParams(window.location.search)
    if (!params.has('shared_url') && !params.has('shared_text')) return

    processed.current = true

    const url = extractSharedUrl(params)
    if (!url) {
      cleanUpUrl()
      return
    }

    const title = params.get('shared_title') || ''

    handleSharedUrl(url, title, onSuccess, onDuplicate).then(cleanUpUrl)
  }, [onSuccess, onDuplicate])
}

/**
 * Remove share target query params from the URL without triggering navigation.
 */
function cleanUpUrl() {
  const url = new URL(window.location.href)
  url.searchParams.delete('shared_url')
  url.searchParams.delete('shared_title')
  url.searchParams.delete('shared_text')
  const clean = url.searchParams.toString()
    ? `${url.pathname}?${url.searchParams.toString()}${url.hash}`
    : `${url.pathname}${url.hash}`
  window.history.replaceState(null, '', clean)
}

/**
 * Create a bookmark from the shared URL, mirroring usePasteToBookmark logic.
 */
async function handleSharedUrl(sharedUrl, sharedTitle, onSuccess, onDuplicate) {
  try {
    const { createBookmark, findBookmarksByUrl, normalizeUrl, updateBookmark } =
      await import('../services/bookmarks')

    const normalized = normalizeUrl(sharedUrl)
    const existing = findBookmarksByUrl(normalized)

    if (existing.length > 0) {
      if (onDuplicate) onDuplicate(sharedUrl)
      return
    }

    const domain = new URL(normalized).hostname.replace('www.', '')
    const title = sharedTitle || domain

    const bookmark = createBookmark({
      url: sharedUrl,
      title,
      description: '',
      tags: [],
      readLater: false,
    })

    if (onSuccess) onSuccess(sharedUrl)

    // Async: fetch suggestions if enabled
    try {
      const { isSuggestionsEnabled, fetchSuggestions } =
        await import('../services/content-suggestion')
      if (isSuggestionsEnabled()) {
        const suggestions = await fetchSuggestions(normalized)
        const updates = {}
        if (suggestions.title) updates.title = suggestions.title
        if (suggestions.description) updates.description = suggestions.description
        if (suggestions.suggestedTags?.length) updates.tags = suggestions.suggestedTags
        if (suggestions.favicon) updates.favicon = suggestions.favicon
        if (Object.keys(updates).length > 0) {
          updateBookmark(bookmark.id, updates)
        }
      }
    } catch {
      // Suggestions are best-effort
    }
  } catch (error) {
    console.error('[useShareTarget] Error creating bookmark:', error)
  }
}
