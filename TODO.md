# UI Code Simplification Plan

> Analysis of Hypermark's UI codebase (~6,400 lines across 33 components) with 5 refactoring options to improve maintainability, reduce duplication, and simplify complex components.

---

## Current State Summary

| Metric | Value |
|--------|-------|
| Total UI component files | 33 JSX files |
| Custom hooks | 6 files |
| Largest component | `BookmarkList.jsx` (681 lines) |
| Max useState in single component | 17 (`BookmarkList`) |
| Major code duplications | 4 patterns |
| Average component size | ~190 lines |

### Most Complex Files

| File | Lines | Complexity | Issues |
|------|-------|------------|--------|
| `BookmarkList.jsx` | 681 | Very High | God component, 17 useState, 18+ useCallback |
| `DiagnosticsView.jsx` | 681 | Very High | Large but focused |
| `RelayConfigurationView.jsx` | 680 | Very High | WebSocket testing logic |
| `SettingsView.jsx` | 523 | High | Duplicated WebRTC subscription |
| `BookmarkInlineCard.jsx` | 448 | High | Duplicated edit UI pattern |

---

## Option 1: Extract `useWebrtcStatus` Hook

**Priority:** High
**Effort:** Low
**Impact:** ~60 lines removed

### Problem

Identical WebRTC provider subscription logic duplicated in 2 files:
- `src/components/bookmarks/TagSidebar.jsx` (lines 23-52)
- `src/components/SettingsView.jsx` (lines 42-66)

Both implement:
```javascript
const [connected, setConnected] = useState(false)
const [peerCount, setPeerCount] = useState(0)
const [synced, setSynced] = useState(false)

useEffect(() => {
  const unsubscribe = subscribeToWebrtcProvider((provider) => {
    if (!provider) {
      setConnected(false)
      setPeerCount(0)
      setSynced(false)
      return
    }
    const handleStatus = ({ connected }) => setConnected(connected)
    const handlePeers = ({ webrtcPeers }) => setPeerCount(webrtcPeers?.length || 0)
    provider.on('status', handleStatus)
    provider.on('peers', handlePeers)
    // ... cleanup logic
  })
  return unsubscribe
}, [])
```

Additionally, both files have separate status text functions:
- `SettingsView.jsx`: `getSyncStatus()`
- `TagSidebar.jsx`: `getSyncText()`

### Solution

Create `src/hooks/useWebrtcStatus.js`:

```javascript
import { useState, useEffect, useMemo } from 'react'
import { subscribeToWebrtcProvider } from './useYjs'

export function useWebrtcStatus() {
  const [connected, setConnected] = useState(false)
  const [peerCount, setPeerCount] = useState(0)
  const [synced, setSynced] = useState(false)

  useEffect(() => {
    const unsubscribe = subscribeToWebrtcProvider((provider) => {
      if (!provider) {
        setConnected(false)
        setPeerCount(0)
        setSynced(false)
        return
      }

      const handleStatus = ({ connected }) => setConnected(connected)
      const handlePeers = ({ webrtcPeers }) => {
        setPeerCount(webrtcPeers ? webrtcPeers.length : 0)
      }
      const handleSynced = ({ synced }) => setSynced(synced)

      provider.on('status', handleStatus)
      provider.on('peers', handlePeers)
      provider.on('synced', handleSynced)

      // Get initial state
      setConnected(provider.connected)
      if (provider.room?.webrtcConns) {
        setPeerCount(provider.room.webrtcConns.size)
      }

      return () => {
        provider.off('status', handleStatus)
        provider.off('peers', handlePeers)
        provider.off('synced', handleSynced)
      }
    })

    return unsubscribe
  }, [])

  const statusText = useMemo(() => {
    if (!connected) return 'Offline'
    if (peerCount === 0) return 'No peers connected'
    return `${peerCount} device${peerCount === 1 ? '' : 's'} connected`
  }, [connected, peerCount])

  const statusColor = useMemo(() => {
    if (!connected) return 'bg-muted-foreground/20'
    if (synced) return 'bg-green-500'
    return 'bg-yellow-500'
  }, [connected, synced])

  return {
    connected,
    peerCount,
    synced,
    statusText,
    statusColor
  }
}
```

### Usage After Refactor

```javascript
// In TagSidebar.jsx and SettingsView.jsx
const { connected, peerCount, synced, statusText, statusColor } = useWebrtcStatus()
```

### Files to Modify
- [ ] Create `src/hooks/useWebrtcStatus.js`
- [ ] Update `src/components/bookmarks/TagSidebar.jsx`
- [ ] Update `src/components/SettingsView.jsx`
- [ ] Add unit tests for the new hook

---

## Option 2: Extract `useDomainFavicon` Utility

**Priority:** Medium
**Effort:** Low
**Impact:** ~24 lines removed, improved consistency

### Problem

Domain extraction + favicon URL generation repeated in 3 files with inconsistent error handling:

**BookmarkInlineCard.jsx:40-50:**
```javascript
let domain = ''
if (localUrl) {
  try {
    domain = new URL(localUrl).hostname.replace('www.', '')
  } catch {
    domain = ''  // Falls back to empty
  }
}
const faviconUrl = domain ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32` : null
```

**BookmarkItem.jsx:10-17:**
```javascript
let domain = url
try {
  domain = new URL(url).hostname.replace('www.', '')
} catch {
  domain = url  // Falls back to original URL (different!)
}
const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
```

**InboxItem.jsx:29-37:**
```javascript
let domain = bookmark.url
try {
  domain = new URL(bookmark.url).hostname.replace('www.', '')
} catch {
  domain = bookmark.url  // Falls back to original URL
}
const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
```

### Issues
1. Inconsistent fallback behavior (`''` vs original URL)
2. Hardcoded favicon service URL
3. No centralized way to change favicon provider
4. Duplicated try/catch blocks

### Solution

Create `src/utils/url.js`:

```javascript
/**
 * Extract domain from URL, stripping www. prefix
 * @param {string} url - The URL to extract domain from
 * @returns {string} Domain or empty string if invalid
 */
export function extractDomain(url) {
  if (!url) return ''
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

/**
 * Get favicon URL for a given URL using Google's favicon service
 * @param {string} url - The URL to get favicon for
 * @param {number} size - Icon size (default 32)
 * @returns {string|null} Favicon URL or null if invalid
 */
export function getFaviconUrl(url, size = 32) {
  const domain = extractDomain(url)
  if (!domain) return null
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=${size}`
}

/**
 * Validate and normalize a URL
 * @param {string} url - The URL to validate
 * @returns {{ isValid: boolean, normalized: string }}
 */
export function normalizeUrl(url) {
  if (!url?.trim()) return { isValid: false, normalized: '' }

  try {
    new URL(url)
    return { isValid: true, normalized: url }
  } catch {
    // Try adding https://
    try {
      const withProtocol = 'https://' + url
      new URL(withProtocol)
      return { isValid: true, normalized: withProtocol }
    } catch {
      return { isValid: false, normalized: url }
    }
  }
}
```

Optional React hook for reactive usage:

```javascript
// src/hooks/useDomainFavicon.js
import { useMemo } from 'react'
import { extractDomain, getFaviconUrl } from '../utils/url'

export function useDomainFavicon(url) {
  return useMemo(() => ({
    domain: extractDomain(url),
    faviconUrl: getFaviconUrl(url),
  }), [url])
}
```

### Usage After Refactor

```javascript
// In components
import { extractDomain, getFaviconUrl } from '@/utils/url'

const domain = extractDomain(bookmark.url)
const faviconUrl = getFaviconUrl(bookmark.url)

// Or with hook
const { domain, faviconUrl } = useDomainFavicon(bookmark.url)
```

### Files to Modify
- [ ] Create `src/utils/url.js`
- [ ] Optionally create `src/hooks/useDomainFavicon.js`
- [ ] Update `src/components/bookmarks/BookmarkInlineCard.jsx`
- [ ] Update `src/components/bookmarks/BookmarkItem.jsx`
- [ ] Update `src/components/bookmarks/InboxItem.jsx`
- [ ] Add unit tests for URL utilities

---

## Option 3: Extract `useKeyboardNavigation` Hook

**Priority:** High
**Effort:** Medium
**Impact:** ~150 lines removed from BookmarkList, reusable for InboxView

### Problem

`BookmarkList.jsx` has 17 useState calls. Keyboard navigation alone accounts for:
- 6 state variables
- 12+ useCallback functions
- Complex interdependencies between hover, selection, and keyboard modes

**Current state in BookmarkList.jsx:**
```javascript
const [selectedIndex, setSelectedIndex] = useState(-1)
const [hoveredIndex, setHoveredIndex] = useState(-1)
const [keyboardNavActive, setKeyboardNavActive] = useState(false)
const [selectionMode, setSelectionMode] = useState(false)
const [selectedIds, setSelectedIds] = useState(new Set())
const ignoreHoverRef = useRef(false)

// Navigation callbacks (each with dependency arrays)
const selectNext = useCallback(() => { ... }, [filteredBookmarks.length, filterView, hoveredIndex])
const selectPrev = useCallback(() => { ... }, [filterView, filteredBookmarks.length, hoveredIndex])
const selectNextWithShift = useCallback(() => { ... }, [selectionMode, selectedIndex, filteredBookmarks])
const selectPrevWithShift = useCallback(() => { ... }, [selectionMode, selectedIndex, filteredBookmarks])
const toggleSelectCurrent = useCallback(() => { ... }, [...])
const selectAll = useCallback(() => { ... }, [...])
const handleBookmarkHover = useCallback(() => { ... }, [keyboardNavActive])
// ... more callbacks
```

### Solution

Create `src/hooks/useKeyboardNavigation.js`:

```javascript
import { useState, useCallback, useEffect, useRef, useMemo } from 'react'

/**
 * Hook for managing keyboard navigation in a list
 * @param {Array} items - The items to navigate through
 * @param {Object} options - Configuration options
 * @param {Function} options.getItemId - Function to get unique ID from item
 * @param {Function} options.onSelect - Callback when item is selected
 * @param {boolean} options.enableMultiSelect - Enable shift+arrow selection
 */
export function useKeyboardNavigation(items, options = {}) {
  const {
    getItemId = (item) => item._id,
    onSelect,
    enableMultiSelect = true,
  } = options

  // Navigation state
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [hoveredIndex, setHoveredIndex] = useState(-1)
  const [isKeyboardActive, setIsKeyboardActive] = useState(false)
  const ignoreHoverRef = useRef(false)

  // Multi-selection state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())

  // Reset when items change significantly
  useEffect(() => {
    if (selectedIndex >= items.length) {
      setSelectedIndex(items.length > 0 ? items.length - 1 : -1)
    }
  }, [items.length, selectedIndex])

  // Navigation functions
  const selectNext = useCallback(() => {
    setIsKeyboardActive(true)
    setSelectedIndex(prev => {
      if (items.length === 0) return -1
      if (prev === -1) return hoveredIndex >= 0 ? hoveredIndex : 0
      return prev < items.length - 1 ? prev + 1 : prev
    })
  }, [items.length, hoveredIndex])

  const selectPrev = useCallback(() => {
    setIsKeyboardActive(true)
    setSelectedIndex(prev => {
      if (items.length === 0) return -1
      if (prev === -1) return hoveredIndex >= 0 ? hoveredIndex : items.length - 1
      return prev > 0 ? prev - 1 : prev
    })
  }, [items.length, hoveredIndex])

  const selectNextWithShift = useCallback(() => {
    if (!enableMultiSelect) return selectNext()

    setSelectionMode(true)
    setSelectedIndex(prev => {
      const next = prev < items.length - 1 ? prev + 1 : prev
      if (next !== prev && items[prev]) {
        setSelectedIds(ids => new Set([...ids, getItemId(items[prev])]))
      }
      return next
    })
  }, [items, enableMultiSelect, selectNext, getItemId])

  const selectPrevWithShift = useCallback(() => {
    if (!enableMultiSelect) return selectPrev()

    setSelectionMode(true)
    setSelectedIndex(prev => {
      const next = prev > 0 ? prev - 1 : prev
      if (next !== prev && items[prev]) {
        setSelectedIds(ids => new Set([...ids, getItemId(items[prev])]))
      }
      return next
    })
  }, [items, enableMultiSelect, selectPrev, getItemId])

  const goToTop = useCallback(() => {
    setIsKeyboardActive(true)
    setSelectedIndex(items.length > 0 ? 0 : -1)
  }, [items.length])

  const goToBottom = useCallback(() => {
    setIsKeyboardActive(true)
    setSelectedIndex(items.length > 0 ? items.length - 1 : -1)
  }, [items.length])

  // Selection functions
  const toggleSelectCurrent = useCallback(() => {
    if (selectedIndex < 0 || selectedIndex >= items.length) return

    const id = getItemId(items[selectedIndex])
    setSelectionMode(true)
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }, [selectedIndex, items, getItemId])

  const selectAll = useCallback(() => {
    setSelectionMode(true)
    setSelectedIds(new Set(items.map(getItemId)))
  }, [items, getItemId])

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }, [])

  // Hover management
  const handleHover = useCallback((index) => {
    if (ignoreHoverRef.current) return
    if (!isKeyboardActive) {
      setHoveredIndex(index)
    }
  }, [isKeyboardActive])

  const handleMouseMove = useCallback(() => {
    setIsKeyboardActive(false)
    ignoreHoverRef.current = false
  }, [])

  const pauseHoverTemporarily = useCallback(() => {
    ignoreHoverRef.current = true
    setTimeout(() => {
      ignoreHoverRef.current = false
    }, 100)
  }, [])

  // Computed values
  const selectedItem = useMemo(() => {
    if (selectedIndex >= 0 && selectedIndex < items.length) {
      return items[selectedIndex]
    }
    return null
  }, [selectedIndex, items])

  const effectiveIndex = useMemo(() => {
    return isKeyboardActive ? selectedIndex : hoveredIndex
  }, [isKeyboardActive, selectedIndex, hoveredIndex])

  return {
    // State
    selectedIndex,
    hoveredIndex,
    isKeyboardActive,
    selectionMode,
    selectedIds,
    selectedItem,
    effectiveIndex,

    // Navigation
    selectNext,
    selectPrev,
    selectNextWithShift,
    selectPrevWithShift,
    goToTop,
    goToBottom,
    setSelectedIndex,

    // Selection
    toggleSelectCurrent,
    selectAll,
    clearSelection,
    exitSelectionMode,
    isSelected: (id) => selectedIds.has(id),

    // Hover
    handleHover,
    handleMouseMove,
    pauseHoverTemporarily,

    // Helpers
    isItemSelected: (index) => index === selectedIndex,
    isItemHovered: (index) => index === hoveredIndex,
  }
}
```

### Usage After Refactor

```javascript
// In BookmarkList.jsx
const nav = useKeyboardNavigation(filteredBookmarks, {
  getItemId: (b) => b._id,
  enableMultiSelect: true,
})

// Hotkeys become cleaner
useHotkeys({
  'j': nav.selectNext,
  'k': nav.selectPrev,
  'shift+j': nav.selectNextWithShift,
  'shift+k': nav.selectPrevWithShift,
  'g g': nav.goToTop,
  'shift+g': nav.goToBottom,
  'x': nav.toggleSelectCurrent,
  'mod+a': nav.selectAll,
  'escape': nav.exitSelectionMode,
})

// In JSX
<BookmarkItem
  isSelected={nav.isItemSelected(index)}
  onMouseEnter={() => nav.handleHover(index)}
/>
```

### Files to Modify
- [ ] Create `src/hooks/useKeyboardNavigation.js`
- [ ] Update `src/components/bookmarks/BookmarkList.jsx`
- [ ] Potentially update `src/components/bookmarks/InboxView.jsx` to use same hook
- [ ] Add comprehensive unit tests

---

## Option 4: Merge BookmarkInlineCard and InboxItem Expanded View

**Priority:** Medium
**Effort:** Medium
**Impact:** ~200 lines removed, single source of truth for edit UI

### Problem

`BookmarkInlineCard.jsx` (448 lines) and `InboxItem.jsx` expanded view share nearly identical UI:

| Feature | BookmarkInlineCard | InboxItem (expanded) |
|---------|-------------------|---------------------|
| Favicon + URL row | Yes | Yes |
| Title input | Yes | Yes |
| Description textarea | Yes | Yes |
| TagInput + Tag chips | Yes | Yes |
| Action footer (Done/Discard) | Yes | Yes |
| Tab navigation between fields | Yes | Yes |
| Escape to close | Yes | Yes |
| Blur-triggered auto-save | Yes | Yes |

**Key differences:**
- `BookmarkInlineCard`: URL is editable for new bookmarks, has readLater checkbox
- `InboxItem`: URL is always read-only, no readLater checkbox

### Solution

Create a shared `BookmarkEditCard` component that both can use:

```javascript
// src/components/bookmarks/BookmarkEditCard.jsx
import { forwardRef, useRef, useEffect, useState, useCallback } from 'react'
import { ExternalLink, Check, X } from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { Tag } from '../ui/Tag'
import { getAllTags, updateBookmark, createBookmark } from '../../services/bookmarks'
import { useHotkeys } from '../../hooks/useHotkeys'
import { extractDomain, getFaviconUrl, normalizeUrl } from '../../utils/url'

export const BookmarkEditCard = forwardRef(function BookmarkEditCard({
  bookmark = null,
  isNew = false,
  showUrlInput = false,
  showReadLater = true,
  onSave,
  onDiscard,
  onFieldChange,
  autoFocusField = 'title',
  className = '',
}, ref) {
  const isEditing = Boolean(bookmark?._id)

  // Refs for tab navigation
  const urlInputRef = useRef(null)
  const titleInputRef = useRef(null)
  const descInputRef = useRef(null)
  const tagsInputRef = useRef(null)

  // Local state
  const [localUrl, setLocalUrl] = useState(bookmark?.url || '')
  const [localTitle, setLocalTitle] = useState(bookmark?.title || '')
  const [localDesc, setLocalDesc] = useState(bookmark?.description || '')
  const [localTags, setLocalTags] = useState(bookmark?.tags || [])
  const [localReadLater, setLocalReadLater] = useState(bookmark?.readLater || false)
  const [allTags, setAllTags] = useState([])
  const [urlError, setUrlError] = useState('')

  const domain = extractDomain(localUrl)
  const faviconUrl = getFaviconUrl(localUrl)

  // Focus appropriate field on mount
  useEffect(() => {
    const focusMap = {
      url: urlInputRef,
      title: titleInputRef,
      desc: descInputRef,
      tags: tagsInputRef,
    }
    const targetRef = showUrlInput && isNew ? urlInputRef : focusMap[autoFocusField]
    targetRef?.current?.focus()
  }, [isNew, showUrlInput, autoFocusField])

  // Load all tags for autocomplete
  useEffect(() => {
    try {
      setAllTags(getAllTags())
    } catch {
      setAllTags([])
    }
  }, [])

  // Sync from props when bookmark changes
  useEffect(() => {
    if (bookmark) {
      setLocalUrl(bookmark.url || '')
      setLocalTitle(bookmark.title || '')
      setLocalDesc(bookmark.description || '')
      setLocalTags(bookmark.tags || [])
      setLocalReadLater(bookmark.readLater || false)
    }
  }, [bookmark])

  // Save logic
  const saveChanges = useCallback(() => {
    const { isValid, normalized } = normalizeUrl(localUrl)

    if (!isValid && localUrl.trim()) {
      setUrlError('Invalid URL')
      return false
    }

    setUrlError('')

    const data = {
      url: normalized,
      title: localTitle.trim() || normalized,
      description: localDesc,
      tags: localTags,
      ...(showReadLater && { readLater: localReadLater }),
    }

    try {
      if (isEditing) {
        updateBookmark(bookmark._id, data)
        onFieldChange?.(data)
      } else if (isNew) {
        createBookmark(data)
      }
      return true
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      return false
    }
  }, [localUrl, localTitle, localDesc, localTags, localReadLater, isEditing, bookmark, onFieldChange, isNew, showReadLater])

  // Blur handlers for auto-save
  const handleFieldBlur = useCallback((field, currentValue, originalValue) => {
    if (isEditing && currentValue !== originalValue) {
      saveChanges()
    }
  }, [isEditing, saveChanges])

  // ... rest of implementation (tag handling, keyboard nav, JSX)

  return (
    <div ref={ref} className={`relative bg-card shadow-lg ring-1 ring-border rounded-lg p-5 space-y-4 ${className}`}>
      {/* Implementation... */}
    </div>
  )
})
```

### Updated InboxItem Usage

```javascript
// In InboxItem.jsx
if (isFocusMode && isSelected) {
  return (
    <BookmarkEditCard
      ref={ref}
      bookmark={bookmark}
      showUrlInput={false}
      showReadLater={false}
      onSave={handleSave}
      onDiscard={() => onDeselect?.()}
      autoFocusField="title"
    />
  )
}

// Render compact view for non-selected items...
```

### Files to Modify
- [ ] Create `src/components/bookmarks/BookmarkEditCard.jsx`
- [ ] Update `src/components/bookmarks/BookmarkInlineCard.jsx` to use or extend it
- [ ] Update `src/components/bookmarks/InboxItem.jsx` to use it
- [ ] Add visual regression tests

---

## Option 5: Decompose BookmarkList into Feature Components

**Priority:** Medium
**Effort:** High
**Impact:** BookmarkList reduced from 681 to ~150 lines

### Problem

`BookmarkList.jsx` is a "God Component" handling:
1. Bookmark loading/observation (Yjs subscription)
2. Filtering and sorting
3. Keyboard navigation
4. Selection mode
5. Search
6. View switching (bookmarks/inbox/settings)
7. Modal management (Help, QuickTag)
8. Adding/editing bookmarks
9. Toast notifications

This makes it:
- Hard to test individual features
- Difficult to navigate (681 lines)
- Complex dependency chains between useState/useCallback

### Solution

Split into focused components and hooks:

```
src/components/bookmarks/
├── BookmarkList.jsx          # Slim coordinator (~150 lines)
├── BookmarkListView.jsx      # Main list rendering (~200 lines)
├── InboxView.jsx             # (existing)
├── FilterBar.jsx             # (existing)
├── SelectionActionBar.jsx    # (existing)

src/hooks/
├── useBookmarkData.js        # Yjs subscription + filtering + sorting
├── useKeyboardNavigation.js  # (from Option 3)
├── useBookmarkActions.js     # delete, edit, toggleReadLater actions
```

### New `useBookmarkData` Hook

```javascript
// src/hooks/useBookmarkData.js
import { useState, useEffect, useMemo } from 'react'
import { useYjs } from './useYjs'
import { useSearch } from './useSearch'
import { useDebounce } from './useDebounce'
import { getAllBookmarks } from '../services/bookmarks'

export function useBookmarkData({ filterView, selectedTag, sortBy, searchQuery }) {
  const { bookmarks: bookmarksMap, synced } = useYjs()
  const [bookmarks, setBookmarks] = useState([])

  // Subscribe to Yjs changes
  useEffect(() => {
    const loadBookmarks = () => {
      try {
        setBookmarks(getAllBookmarks())
      } catch (err) {
        console.error('Failed to load bookmarks:', err)
        setBookmarks([])
      }
    }

    loadBookmarks()
    bookmarksMap.observeDeep(loadBookmarks)
    return () => bookmarksMap.unobserveDeep(loadBookmarks)
  }, [bookmarksMap])

  // Debounced search
  const debouncedQuery = useDebounce(searchQuery, 300)
  const searchedBookmarks = useSearch(bookmarks, debouncedQuery)

  // Filter and sort
  const filteredBookmarks = useMemo(() => {
    let filtered = [...searchedBookmarks]

    // Apply view filter
    switch (filterView) {
      case 'read-later':
        filtered = filtered.filter(b => b.readLater)
        break
      case 'inbox':
        filtered = filtered.filter(b => b.inbox)
        break
      case 'tag':
        if (selectedTag) {
          filtered = filtered.filter(b => b.tags?.includes(selectedTag))
        }
        break
      // 'all' - no filter
    }

    // Apply sort
    switch (sortBy) {
      case 'recent':
        filtered.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        break
      case 'oldest':
        filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
        break
      case 'alpha':
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        break
    }

    return filtered
  }, [searchedBookmarks, filterView, selectedTag, sortBy])

  // Stats
  const stats = useMemo(() => ({
    total: bookmarks.length,
    readLater: bookmarks.filter(b => b.readLater).length,
    inbox: bookmarks.filter(b => b.inbox).length,
  }), [bookmarks])

  return {
    bookmarks,
    filteredBookmarks,
    synced,
    stats,
  }
}
```

### New `useBookmarkActions` Hook

```javascript
// src/hooks/useBookmarkActions.js
import { useCallback } from 'react'
import {
  deleteBookmark,
  updateBookmark,
  moveToInbox,
  archiveBookmark
} from '../services/bookmarks'
import { useToast } from './useToast'
import { undo } from './useYjs'

export function useBookmarkActions() {
  const { addToast } = useToast()

  const handleDelete = useCallback((bookmark) => {
    try {
      deleteBookmark(bookmark._id)
      addToast({
        message: 'Bookmark deleted',
        action: {
          label: 'Undo',
          onClick: () => undo(),
        },
      })
      return true
    } catch (err) {
      console.error('Failed to delete:', err)
      addToast({ message: 'Failed to delete bookmark', type: 'error' })
      return false
    }
  }, [addToast])

  const handleToggleReadLater = useCallback((bookmark) => {
    try {
      updateBookmark(bookmark._id, { readLater: !bookmark.readLater })
      return true
    } catch (err) {
      console.error('Failed to toggle read later:', err)
      return false
    }
  }, [])

  const handleBatchDelete = useCallback((ids) => {
    try {
      ids.forEach(id => deleteBookmark(id))
      addToast({
        message: `${ids.size} bookmarks deleted`,
        action: {
          label: 'Undo',
          onClick: () => undo(),
        },
      })
      return true
    } catch (err) {
      console.error('Failed to batch delete:', err)
      return false
    }
  }, [addToast])

  return {
    handleDelete,
    handleToggleReadLater,
    handleBatchDelete,
    handleMoveToInbox: moveToInbox,
    handleArchive: archiveBookmark,
  }
}
```

### Slim BookmarkList Coordinator

```javascript
// src/components/bookmarks/BookmarkList.jsx (~150 lines)
import { useState } from 'react'
import { useBookmarkData } from '../../hooks/useBookmarkData'
import { useKeyboardNavigation } from '../../hooks/useKeyboardNavigation'
import { useBookmarkActions } from '../../hooks/useBookmarkActions'
import { useHotkeys } from '../../hooks/useHotkeys'
import { useToast } from '../../hooks/useToast'
import { BookmarkListView } from './BookmarkListView'
import { InboxView } from './InboxView'
import { TagSidebar } from './TagSidebar'
import { FilterBar } from './FilterBar'
import { HelpModal } from '../ui/HelpModal'
import { QuickTagModal } from '../ui/QuickTagModal'
import { ToastContainer } from '../ui/ToastContainer'
import { SettingsView } from '../SettingsView'

export function BookmarkList() {
  // View state
  const [currentView, setCurrentView] = useState('bookmarks')
  const [filterView, setFilterView] = useState('all')
  const [selectedTag, setSelectedTag] = useState(null)
  const [sortBy, setSortBy] = useState('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  // Modal state
  const [isHelpOpen, setIsHelpOpen] = useState(false)
  const [tagModalBookmark, setTagModalBookmark] = useState(null)

  // Edit state
  const [isAddingNew, setIsAddingNew] = useState(false)
  const [editingBookmarkId, setEditingBookmarkId] = useState(null)

  // Data hook
  const { filteredBookmarks, synced, stats } = useBookmarkData({
    filterView,
    selectedTag,
    sortBy,
    searchQuery,
  })

  // Navigation hook
  const nav = useKeyboardNavigation(filteredBookmarks, {
    getItemId: (b) => b._id,
    enableMultiSelect: true,
  })

  // Actions hook
  const actions = useBookmarkActions()

  // Toast hook
  const { toasts, removeToast } = useToast()

  // Global hotkeys
  useHotkeys({
    'n': () => setIsAddingNew(true),
    '?': () => setIsHelpOpen(true),
    'g a': () => setFilterView('all'),
    'g l': () => setFilterView('read-later'),
    'g i': () => setFilterView('inbox'),
    // ... delegate navigation hotkeys to nav hook
    'j': nav.selectNext,
    'k': nav.selectPrev,
  })

  if (!synced) {
    return <div className="flex items-center justify-center h-dvh">Loading...</div>
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <TagSidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        stats={stats}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <FilterBar
          filterView={filterView}
          onFilterChange={setFilterView}
          sortBy={sortBy}
          onSortChange={setSortBy}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onToggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
        />

        {currentView === 'settings' ? (
          <SettingsView onBack={() => setCurrentView('bookmarks')} />
        ) : filterView === 'inbox' ? (
          <InboxView bookmarks={filteredBookmarks} />
        ) : (
          <BookmarkListView
            bookmarks={filteredBookmarks}
            navigation={nav}
            actions={actions}
            isAddingNew={isAddingNew}
            editingBookmarkId={editingBookmarkId}
            onStartAdd={() => setIsAddingNew(true)}
            onCancelAdd={() => setIsAddingNew(false)}
            onStartEdit={setEditingBookmarkId}
            onCancelEdit={() => setEditingBookmarkId(null)}
            onOpenTagModal={setTagModalBookmark}
          />
        )}
      </div>

      <HelpModal isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <QuickTagModal
        isOpen={!!tagModalBookmark}
        onClose={() => setTagModalBookmark(null)}
        bookmark={tagModalBookmark}
      />
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    </div>
  )
}
```

### Files to Create/Modify
- [ ] Create `src/hooks/useBookmarkData.js`
- [ ] Create `src/hooks/useBookmarkActions.js`
- [ ] Create `src/components/bookmarks/BookmarkListView.jsx`
- [ ] Refactor `src/components/bookmarks/BookmarkList.jsx`
- [ ] Update imports in `App.jsx`
- [ ] Add integration tests

---

## Implementation Order

**Recommended sequence:**

```
Phase 1 (Quick Wins)
├── Option 1: useWebrtcStatus hook
└── Option 2: URL utilities

Phase 2 (High Impact)
└── Option 3: useKeyboardNavigation hook

Phase 3 (Consolidation)
└── Option 4: BookmarkEditCard component

Phase 4 (Architecture)
└── Option 5: BookmarkList decomposition
```

Each phase builds on the previous:
- Phase 1 can be done independently with minimal risk
- Phase 2 requires Option 1 & 2 to be in place for clean imports
- Phase 3 benefits from the URL utilities from Phase 1
- Phase 4 requires the navigation hook from Phase 2

---

## Metrics to Track

After implementation, measure:

| Metric | Current | Target |
|--------|---------|--------|
| BookmarkList.jsx lines | 681 | <200 |
| Max useState in single component | 17 | <8 |
| Duplicated code patterns | 4 | 0 |
| Test coverage for UI hooks | ~0% | >80% |
| Average component size | 190 lines | <150 lines |

---

## Notes

- All refactors should maintain existing functionality
- Add unit tests for new hooks before modifying components
- Consider feature flags for gradual rollout
- Keep PR sizes manageable (one option per PR ideally)
