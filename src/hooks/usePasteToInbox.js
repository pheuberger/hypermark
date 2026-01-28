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
 * Hook to listen for paste events and create inbox items from URLs
 * Silently ignores non-URL pastes and pastes in input fields/modals
 * 
 * @param {Function} onSuccess - Callback when inbox item created (optional)
 * @param {Function} onDuplicate - Callback when URL already exists (optional)
 */
export function usePasteToInbox(onSuccess, onDuplicate) {
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
        const { createInboxItem, findBookmarksByUrl } = await import('../services/bookmarks')
        
        // Check for duplicates
        const normalized = (await import('../services/bookmarks')).normalizeUrl(text)
        const existing = findBookmarksByUrl(normalized)
        
        if (existing.length > 0) {
          // URL already exists
          if (onDuplicate) {
            onDuplicate(text)
          }
          return
        }
        
        // Create inbox item
        await createInboxItem(text)
        
        if (onSuccess) {
          onSuccess(text)
        }
      } catch (error) {
        console.error('[usePasteToInbox] Error creating inbox item:', error)
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
