import { useEffect, useCallback } from 'react'
import { isValidUrl } from '../services/bookmarks'

/**
 * Check if element is an input field
 * @param {Element} element - DOM element to check
 * @returns {boolean}
 */
function isInputElement(element) {
  if (!element) return false
  const tagName = element.tagName.toLowerCase()
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.isContentEditable
  )
}

/**
 * Check if any modal is currently open
 * @returns {boolean}
 */
function isModalOpen() {
  // Check for DaisyUI modal-open class
  if (document.documentElement.classList.contains('modal-open')) {
    return true
  }

  // Check for elements with data-state="open" (common modal pattern)
  if (document.querySelector('[data-state="open"]')) {
    return true
  }

  return false
}

/**
 * Hook to listen for paste events and create bookmarks from URLs.
 * If content suggestions are enabled, fetches and applies them async.
 * Silently ignores non-URL pastes and pastes in input fields/modals.
 *
 * @param {Function} onSuccess - Callback when bookmark created (optional)
 * @param {Function} onDuplicate - Callback when URL already exists (optional)
 */
export function usePasteToBookmark(onSuccess, onDuplicate) {
  const handlePaste = useCallback(
    async (e) => {
      // Don't capture paste in input fields
      if (isInputElement(e.target)) {
        return
      }

      // Don't capture paste when modal is open
      if (isModalOpen()) {
        return
      }

      // Extract text from clipboard
      const text = e.clipboardData?.getData('text')
      if (!text) {
        return
      }

      // Validate if text is a URL
      if (!isValidUrl(text)) {
        // Silently ignore non-URL pastes
        return
      }

      // Prevent default paste behavior for valid URLs
      e.preventDefault()

      try {
        // Import here to avoid circular dependencies
        const { createBookmark, findBookmarksByUrl, normalizeUrl, updateBookmark } = await import('../services/bookmarks')

        // Check for duplicates
        const normalized = normalizeUrl(text)
        const existing = findBookmarksByUrl(normalized)

        if (existing.length > 0) {
          // URL already exists
          if (onDuplicate) {
            onDuplicate(text)
          }
          return
        }

        // Extract domain as title
        const domain = new URL(normalized).hostname.replace('www.', '')

        // Create regular bookmark
        const bookmark = createBookmark({
          url: text,
          title: domain,
          description: '',
          tags: [],
          readLater: false,
        })

        if (onSuccess) {
          onSuccess(text)
        }

        // Async: fetch suggestions if enabled
        try {
          const { isSuggestionsEnabled, fetchSuggestions } = await import('../services/content-suggestion')
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
          // Suggestions are best-effort; don't fail the bookmark creation
        }
      } catch (error) {
        console.error('[usePasteToBookmark] Error creating bookmark:', error)
      }
    },
    [onSuccess, onDuplicate]
  )

  useEffect(() => {
    document.addEventListener('paste', handlePaste)
    return () => {
      document.removeEventListener('paste', handlePaste)
    }
  }, [handlePaste])
}
