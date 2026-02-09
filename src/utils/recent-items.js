/**
 * Utility for managing recent bookmarks and commands in localStorage with automatic expiry
 */

export const STORAGE_KEYS = {
  recentBookmarks: 'hypermark:recent-bookmarks',
  recentCommands: 'hypermark:recent-commands',
}

export const MAX_RECENT_BOOKMARKS = 10
export const MAX_RECENT_COMMANDS = 5
export const BOOKMARK_EXPIRY_DAYS = 7
export const COMMAND_EXPIRY_DAYS = 30

/**
 * Add a bookmark to recent items (dedup and move to front if exists)
 * @param {string} bookmarkId - The bookmark ID to add
 */
export function addRecentBookmark(bookmarkId) {
  try {
    // Read current list from localStorage
    const stored = localStorage.getItem(STORAGE_KEYS.recentBookmarks)
    let recentItems = []

    if (stored) {
      try {
        recentItems = JSON.parse(stored) || []
      } catch (parseError) {
        // If parse fails, start with empty array
        recentItems = []
      }
    }

    // Remove any existing entry with same id (deduplication)
    recentItems = recentItems.filter(item => item.id !== bookmarkId)

    // Prepend new entry
    recentItems.unshift({ id: bookmarkId, timestamp: Date.now() })

    // Trim to max limit
    recentItems = recentItems.slice(0, MAX_RECENT_BOOKMARKS)

    // Write back to localStorage
    localStorage.setItem(STORAGE_KEYS.recentBookmarks, JSON.stringify(recentItems))
  } catch (error) {
    // Silently fail if localStorage is unavailable
    // console.warn('Failed to add recent bookmark:', error)
  }
}

/**
 * Get recent bookmarks, filtering out expired items
 * @returns {string[]} Array of bookmark IDs
 */
export function getRecentBookmarks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.recentBookmarks)
    if (!stored) {
      return []
    }

    let recentItems
    try {
      recentItems = JSON.parse(stored) || []
    } catch (parseError) {
      return []
    }

    // Filter out expired items (older than BOOKMARK_EXPIRY_DAYS)
    const expiryThreshold = Date.now() - (BOOKMARK_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const validItems = recentItems.filter(item => item.timestamp > expiryThreshold)

    // Return just the IDs
    return validItems.map(item => item.id)
  } catch (error) {
    // On any error, return empty array
    return []
  }
}

/**
 * Add a command to recent items (dedup and move to front if exists)
 * @param {string} commandId - The command ID to add
 */
export function addRecentCommand(commandId) {
  try {
    // Read current list from localStorage
    const stored = localStorage.getItem(STORAGE_KEYS.recentCommands)
    let recentItems = []

    if (stored) {
      try {
        recentItems = JSON.parse(stored) || []
      } catch (parseError) {
        // If parse fails, start with empty array
        recentItems = []
      }
    }

    // Remove any existing entry with same id (deduplication)
    recentItems = recentItems.filter(item => item.id !== commandId)

    // Prepend new entry
    recentItems.unshift({ id: commandId, timestamp: Date.now() })

    // Trim to max limit
    recentItems = recentItems.slice(0, MAX_RECENT_COMMANDS)

    // Write back to localStorage
    localStorage.setItem(STORAGE_KEYS.recentCommands, JSON.stringify(recentItems))
  } catch (error) {
    // Silently fail if localStorage is unavailable
    // console.warn('Failed to add recent command:', error)
  }
}

/**
 * Get recent commands, filtering out expired items
 * @returns {string[]} Array of command IDs
 */
export function getRecentCommands() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.recentCommands)
    if (!stored) {
      return []
    }

    let recentItems
    try {
      recentItems = JSON.parse(stored) || []
    } catch (parseError) {
      return []
    }

    // Filter out expired items (older than COMMAND_EXPIRY_DAYS)
    const expiryThreshold = Date.now() - (COMMAND_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
    const validItems = recentItems.filter(item => item.timestamp > expiryThreshold)

    // Return just the IDs
    return validItems.map(item => item.id)
  } catch (error) {
    // On any error, return empty array
    return []
  }
}

/**
 * Clear all recent items from localStorage
 * Used for testing and the "Reset all data" feature
 */
export function clearRecentItems() {
  try {
    localStorage.removeItem(STORAGE_KEYS.recentBookmarks)
    localStorage.removeItem(STORAGE_KEYS.recentCommands)
  } catch (error) {
    // Silently fail if localStorage is unavailable
    // console.warn('Failed to clear recent items:', error)
  }
}