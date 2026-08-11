import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import {
  X,
  Link2,
  ClipboardPaste,
  Loader2,
  Plus,
  Hash,
  Search,
  Check,
} from 'lucide-react'
import { TagInput } from '../ui/TagInput'
import { Tag } from '../ui/Tag'
import {
  getAllTags,
  createBookmark,
  isValidUrl,
  normalizeUrl,
} from '../../services/bookmarks'
import { useContentSuggestion } from '../../hooks/useContentSuggestion'
import { useMediaQuery } from '../../hooks/useMediaQuery'
import { cn } from '@/utils/cn'

// Matches the sheet/dialog breakpoint in app.css (Tailwind `sm` = 40rem)
const MOBILE_QUERY = '(max-width: 39.99rem)'

function firstNonEmptyLine(text, { skipComments = false } = {}) {
  return (
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && (!skipComments || !line.startsWith('#'))) || ''
  )
}

/**
 * Read text from the clipboard, preferring the richer read() API.
 *
 * iOS Safari puts a link copied from the share sheet on the pasteboard as
 * text/uri-list with no text/plain flavor, so readText() resolves to an
 * empty string ("Clipboard is empty") even though a URL is right there.
 * read() sees the URL flavor.
 */
async function readClipboardText() {
  const clipboard = navigator.clipboard
  if (clipboard?.read) {
    try {
      const items = await clipboard.read()
      for (const item of items) {
        // uri-list first: it's the flavor that actually holds the link
        if (item.types?.includes('text/uri-list')) {
          const blob = await item.getType('text/uri-list')
          const line = firstNonEmptyLine(await blob.text(), { skipComments: true })
          if (line) return line
        }
        if (item.types?.includes('text/plain')) {
          const blob = await item.getType('text/plain')
          const line = firstNonEmptyLine(await blob.text())
          if (line) return line
        }
      }
      return ''
    } catch {
      // Fall through — some browsers gate read() harder than readText()
    }
  }
  if (clipboard?.readText) {
    return firstNonEmptyLine((await clipboard.readText()) || '')
  }
  return ''
}

/**
 * TagPickerView - Full-sheet tag picking mode for mobile (Linear-style).
 *
 * The dropdown-under-the-input pattern is unusable inside a bottom sheet:
 * the list renders below the field, under the footer and soft keyboard.
 * Instead, the whole sheet becomes the picker: search pinned at the top,
 * selected tags as chips, and the tag list filling all remaining space
 * above the keyboard.
 */
function TagPickerView({ tags, allTags, onAddTag, onRemoveTag, onDone }) {
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  useEffect(() => {
    searchRef.current?.focus()
  }, [])

  const normalized = query.trim().toLowerCase()
  const matching = useMemo(
    () => allTags.filter((tag) => !normalized || tag.toLowerCase().includes(normalized)),
    [allTags, normalized]
  )
  const canCreate =
    normalized !== '' && !allTags.some((tag) => tag.toLowerCase() === normalized)

  const pickTag = (tag) => {
    onAddTag(tag)
    setQuery('')
    searchRef.current?.focus()
  }

  const toggleTag = (tag) => {
    if (tags.includes(tag)) {
      onRemoveTag(tag)
    } else {
      pickTag(tag)
    }
  }

  // Enter picks the first visible option; on an empty query it means "done"
  const handleSearchKeyDown = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (!normalized) {
      onDone()
      return
    }
    const firstMatch = matching.find((tag) => !tags.includes(tag))
    if (firstMatch) {
      pickTag(firstMatch)
    } else if (canCreate) {
      pickTag(normalized)
    }
  }

  return (
    <>
      {/* Picker header */}
      <div className="flex items-center justify-between pl-5 pr-2 pt-3 pb-1">
        <DialogPrimitive.Title className="text-base font-semibold">
          Add tags
        </DialogPrimitive.Title>
        <button
          type="button"
          onClick={onDone}
          className="h-11 px-4 inline-flex items-center rounded-md text-sm font-semibold text-primary hover:bg-accent transition-colors"
        >
          Done
        </button>
      </div>

      {/* Search — pinned at the top so results list downward, always visible */}
      <div className="px-5 pb-2.5">
        <div className="flex items-center gap-2.5 rounded-lg border border-input bg-background px-3 h-12 focus-within:ring-2 focus-within:ring-ring transition-shadow">
          <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <input
            ref={searchRef}
            type="text"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="off"
            enterKeyHint="done"
            aria-label="Search or add tags"
            placeholder="Search or add tags"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/60 focus:ring-0"
          />
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('')
                searchRef.current?.focus()
              }}
              aria-label="Clear search"
              className="flex-shrink-0 p-1 -mr-1 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Selected tags */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-5 pb-2.5">
          {tags.map((tag) => (
            <Tag key={tag} onRemove={() => onRemoveTag(tag)}>
              {tag}
            </Tag>
          ))}
        </div>
      )}

      {/* Tag list fills everything left above the keyboard */}
      <ul className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-border/60 pt-1.5">
        {matching.map((tag) => {
          const selected = tags.includes(tag)
          return (
            <li key={tag}>
              <button
                type="button"
                onClick={() => toggleTag(tag)}
                aria-pressed={selected}
                className="w-full flex items-center gap-3 min-h-12 px-3 rounded-lg text-left text-sm text-foreground active:bg-accent transition-colors"
              >
                <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <span className="flex-1 truncate">{tag}</span>
                {selected && <Check className="w-4 h-4 text-primary flex-shrink-0" />}
              </button>
            </li>
          )
        })}
        {canCreate && (
          <li>
            <button
              type="button"
              onClick={() => pickTag(normalized)}
              className="w-full flex items-center gap-3 min-h-12 px-3 rounded-lg text-left text-sm text-foreground active:bg-accent transition-colors"
            >
              <Plus className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <span className="flex-1 truncate">
                Create "<span className="font-medium">{normalized}</span>"
              </span>
            </button>
          </li>
        )}
        {matching.length === 0 && !canCreate && (
          <li className="px-3 py-8 text-center text-sm text-muted-foreground">
            No tags yet — type to create one
          </li>
        )}
      </ul>
    </>
  )
}

/**
 * AddBookmarkDialog - The add-bookmark flow, redesigned around one job:
 * capture a link fast.
 *
 * - URL is the only required field and gets the hero spot, with one-tap
 *   Paste when the clipboard is available.
 * - Renders as a bottom sheet on mobile (save button always visible above
 *   the keyboard) and a centered dialog on desktop.
 * - On mobile, tags are picked in a full-sheet picker (search on top, list
 *   below) instead of a dropdown that would clip under the keyboard.
 * - If content suggestions are enabled, committing a URL auto-fills the
 *   title/description and offers suggested tags.
 * - Enter in URL/title saves; Enter in the description inserts a newline
 *   (Cmd/Ctrl+Enter saves from anywhere).
 * - Tapping outside won't discard a non-empty draft; Cancel/Esc will.
 */
export function AddBookmarkDialog({ open, onClose, onSaved }) {
  const urlInputRef = useRef(null)
  const titleInputRef = useRef(null)

  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState([])
  const [readLater, setReadLater] = useState(false)
  const [urlError, setUrlError] = useState('')
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  // Callback-ref state (not a plain ref): Radix assigns the forwarded ref
  // after parent effects run, so the keyboard-inset effect keys off this.
  const [contentEl, setContentEl] = useState(null)
  const [allTags, setAllTags] = useState([])
  // Async Clipboard API is unavailable in some browsers (e.g. Firefox
  // without permission) — only offer the Paste button when it exists.
  const [canPasteFromClipboard] = useState(
    () =>
      typeof navigator !== 'undefined' &&
      Boolean(navigator.clipboard?.read || navigator.clipboard?.readText)
  )

  const isMobile = useMediaQuery(MOBILE_QUERY)
  const showTagPicker = isMobile && tagPickerOpen

  const {
    suggestions,
    loading: suggestionsLoading,
    suggest,
    clear: clearSuggestions,
    enabled: suggestionsEnabled,
  } = useContentSuggestion()

  // Track which fields the user has typed in, so suggestions never
  // overwrite manual input.
  const userEditedRef = useRef({ title: false, description: false })
  const lastSuggestedUrlRef = useRef('')

  // Reset to a blank draft every time the dialog opens
  useEffect(() => {
    if (open) {
      setUrl('')
      setTitle('')
      setDescription('')
      setTags([])
      setReadLater(false)
      setUrlError('')
      setTagPickerOpen(false)
      userEditedRef.current = { title: false, description: false }
      lastSuggestedUrlRef.current = ''
      clearSuggestions()
      try {
        setAllTags(getAllTags())
      } catch {
        setAllTags([])
      }
    }
  }, [open, clearSuggestions])

  // iOS Safari overlays the soft keyboard instead of resizing the layout
  // viewport (it ignores interactive-widget=resizes-content), which would
  // leave the sheet's save footer hidden behind the keyboard. Track the
  // visual viewport and lift the sheet by the keyboard's height via CSS
  // variables consumed only by the mobile positioning rules in app.css.
  useEffect(() => {
    if (!open || !contentEl) return
    const vv = window.visualViewport
    if (!vv) return

    const update = () => {
      const keyboardInset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      contentEl.style.setProperty('--keyboard-inset', `${keyboardInset}px`)
      contentEl.style.setProperty('--visual-viewport-height', `${vv.height}px`)
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  }, [open, contentEl])

  // Fill empty fields when suggestions arrive
  useEffect(() => {
    if (!suggestions) return
    if (suggestions.title && !userEditedRef.current.title) {
      setTitle(suggestions.title)
    }
    if (suggestions.description && !userEditedRef.current.description) {
      setDescription(suggestions.description)
    }
  }, [suggestions])

  const suggestedTags = useMemo(() => {
    if (!suggestions?.suggestedTags) return []
    return suggestions.suggestedTags
      .map((t) => t.toLowerCase())
      .filter((t) => !tags.includes(t))
      .slice(0, 6)
  }, [suggestions, tags])

  let domain = ''
  if (url && isValidUrl(url)) {
    try {
      domain = new URL(normalizeUrl(url)).hostname.replace('www.', '')
    } catch {
      domain = ''
    }
  }
  const faviconUrl = domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=32`
    : null

  // Fetch title/description/tag suggestions once per committed URL
  const requestSuggestions = useCallback(
    (rawUrl) => {
      if (!suggestionsEnabled || !isValidUrl(rawUrl)) return
      const normalized = normalizeUrl(rawUrl)
      if (normalized === lastSuggestedUrlRef.current) return
      lastSuggestedUrlRef.current = normalized
      suggest(normalized)
    },
    [suggestionsEnabled, suggest]
  )

  const handleUrlBlur = () => {
    if (!url.trim()) return
    if (isValidUrl(url)) {
      setUrlError('')
      requestSuggestions(url)
    } else {
      setUrlError('Invalid URL')
    }
  }

  // One-tap paste for touch devices, where the document-level
  // paste-to-bookmark shortcut can't fire
  const handlePasteUrl = async () => {
    let text = ''
    try {
      text = await readClipboardText()
    } catch {
      setUrlError("Couldn't read clipboard")
      return
    }
    if (!text) {
      setUrlError('Clipboard is empty')
      return
    }
    if (!isValidUrl(text)) {
      setUrlError("Clipboard doesn't contain a link")
      return
    }
    const normalized = normalizeUrl(text)
    setUrl(normalized)
    setUrlError('')
    requestSuggestions(normalized)
    titleInputRef.current?.focus()
  }

  const handleSave = useCallback(() => {
    if (!url.trim()) {
      setUrlError('URL is required')
      urlInputRef.current?.focus()
      return
    }
    if (!isValidUrl(url)) {
      setUrlError('Invalid URL')
      urlInputRef.current?.focus()
      return
    }

    const normalized = normalizeUrl(url)
    const data = {
      url: normalized,
      title: title.trim() || normalized,
      description,
      tags,
      readLater,
    }

    try {
      createBookmark(data)
      onSaved?.(data)
      onClose?.()
    } catch (error) {
      console.error('Failed to save bookmark:', error)
      setUrlError('Failed to save bookmark')
    }
  }, [url, title, description, tags, readLater, onSaved, onClose])

  const isDirty =
    url.trim() !== '' || title.trim() !== '' || description.trim() !== '' || tags.length > 0

  const handleOpenChange = (nextOpen) => {
    if (!nextOpen) onClose?.()
  }

  // Cmd/Ctrl+Enter saves from any field
  const handleContentKeyDown = (e) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSave()
    }
  }

  const handleEnterSaves = (e) => {
    if (e.key === 'Enter' && !e.metaKey && !e.ctrlKey) {
      e.preventDefault()
      handleSave()
    }
  }

  const addTag = useCallback((tag) => {
    const normalized = tag.trim().toLowerCase()
    if (!normalized) return
    setTags((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]))
  }, [])

  const removeTag = useCallback((tag) => {
    setTags((prev) => prev.filter((t) => t !== tag))
  }, [])

  const canSave = url.trim() !== ''

  return (
    <DialogPrimitive.Root open={open} onOpenChange={handleOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 add-dialog-overlay" />
        <DialogPrimitive.Content
          ref={setContentEl}
          onOpenAutoFocus={(e) => {
            e.preventDefault()
            urlInputRef.current?.focus()
          }}
          onEscapeKeyDown={(e) => {
            // Esc in the tag picker backs out to the form, not out of the dialog
            if (showTagPicker) {
              e.preventDefault()
              setTagPickerOpen(false)
            }
          }}
          onInteractOutside={(e) => {
            // Don't silently discard a non-empty draft on an outside tap
            if (isDirty || showTagPicker) e.preventDefault()
          }}
          onKeyDown={handleContentKeyDown}
          aria-describedby={undefined}
          className={cn(
            'add-dialog-content fixed z-50 flex flex-col bg-card shadow-2xl outline-none',
            // Mobile: bottom sheet pinned above the keyboard
            'inset-x-0 bottom-0 max-h-[85dvh] rounded-t-2xl border-t border-border',
            // Desktop: top-anchored centered panel (doesn't jump when suggestions fill in)
            'sm:inset-x-auto sm:bottom-auto sm:left-1/2 sm:top-[14vh] sm:-translate-x-1/2',
            'sm:w-full sm:max-w-lg sm:max-h-[72vh] sm:rounded-xl sm:border',
            // Tag picker: fix the sheet at full height so the list is stable
            showTagPicker && 'add-dialog-content--full'
          )}
        >
          {showTagPicker ? (
            <TagPickerView
              tags={tags}
              allTags={allTags}
              onAddTag={addTag}
              onRemoveTag={removeTag}
              onDone={() => setTagPickerOpen(false)}
            />
          ) : (
            <>
              {/* Header */}
              <div className="flex items-center justify-between pl-5 pr-2 pt-3 pb-1 sm:pt-4 sm:pb-2">
                <DialogPrimitive.Title className="text-base font-semibold">
                  New bookmark
                </DialogPrimitive.Title>
                <DialogPrimitive.Close
                  className="h-11 w-11 sm:h-9 sm:w-9 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Close"
                >
                  <X className="w-4 h-4" />
                </DialogPrimitive.Close>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 pb-4 space-y-4">
                {/* URL — the only required field, gets the hero spot */}
                <div>
                  <div
                    className={cn(
                      'flex items-center gap-2.5 rounded-lg border bg-background px-3 h-12 sm:h-11',
                      'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-0 transition-shadow',
                      urlError ? 'border-destructive' : 'border-input'
                    )}
                  >
                    {faviconUrl ? (
                      <img
                        src={faviconUrl}
                        alt=""
                        className="w-4 h-4 rounded-[3px] flex-shrink-0"
                        onError={(e) => {
                          e.target.style.opacity = 0
                        }}
                      />
                    ) : (
                      <Link2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    )}
                    <input
                      ref={urlInputRef}
                      type="text"
                      inputMode="url"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      enterKeyHint="go"
                      autoFocus
                      autoComplete="off"
                      aria-label="Link URL"
                      value={url}
                      onChange={(e) => {
                        setUrl(e.target.value)
                        setUrlError('')
                      }}
                      onBlur={handleUrlBlur}
                      onKeyDown={handleEnterSaves}
                      className="flex-1 min-w-0 h-full bg-transparent border-none outline-none text-sm placeholder:text-muted-foreground/60 focus:ring-0"
                      placeholder="Paste or type a link"
                    />
                    {canPasteFromClipboard && !url.trim() && (
                      <button
                        type="button"
                        onClick={handlePasteUrl}
                        className="flex-shrink-0 inline-flex items-center gap-1.5 h-8 px-3 -mr-1 rounded-md bg-accent/60 text-xs font-medium text-foreground/80 hover:bg-accent hover:text-foreground transition-colors"
                        aria-label="Paste link from clipboard"
                      >
                        <ClipboardPaste className="w-3.5 h-3.5" />
                        Paste
                      </button>
                    )}
                  </div>
                  {urlError && (
                    <p className="mt-1.5 text-xs text-destructive">{urlError}</p>
                  )}
                  {suggestionsLoading && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Fetching page info…
                    </p>
                  )}
                </div>

                {/* Title */}
                <input
                  ref={titleInputRef}
                  type="text"
                  enterKeyHint="done"
                  aria-label="Title"
                  value={title}
                  onChange={(e) => {
                    userEditedRef.current.title = true
                    setTitle(e.target.value)
                  }}
                  onKeyDown={handleEnterSaves}
                  className="w-full h-12 sm:h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium placeholder:text-muted-foreground/60 placeholder:font-normal outline-none focus:ring-2 focus:ring-ring transition-shadow"
                  placeholder="Title (optional)"
                />

                {/* Description — Enter inserts a newline, like any textarea */}
                <textarea
                  aria-label="Description"
                  value={description}
                  onChange={(e) => {
                    userEditedRef.current.description = true
                    setDescription(e.target.value)
                  }}
                  rows={2}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 outline-none focus:ring-2 focus:ring-ring transition-shadow resize-none"
                  placeholder="Notes (optional)"
                />

                {/* Tags — full-sheet picker on mobile, inline autocomplete on desktop */}
                <div>
                  {isMobile ? (
                    <button
                      type="button"
                      onClick={() => setTagPickerOpen(true)}
                      aria-label="Add tags"
                      className="w-full flex items-center gap-2.5 h-12 rounded-lg border border-input bg-background px-3 text-sm text-left transition-colors hover:border-ring"
                    >
                      <Hash className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <span className="flex-1 text-muted-foreground/60">
                        {tags.length > 0 ? 'Add more tags…' : 'Add tags...'}
                      </span>
                    </button>
                  ) : (
                    <TagInput
                      value={tags}
                      onChange={setTags}
                      allTags={allTags}
                      placeholder="Add tags..."
                    />
                  )}
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {tags.map((tag) => (
                        <Tag key={tag} onRemove={() => removeTag(tag)}>
                          {tag}
                        </Tag>
                      ))}
                    </div>
                  )}
                  {suggestedTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-2">
                      <span className="text-xs text-muted-foreground">Suggested:</span>
                      {suggestedTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => addTag(tag)}
                          className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-dashed border-input text-xs text-muted-foreground hover:text-foreground hover:border-solid hover:bg-accent/50 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          {tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Read later — whole row is the toggle */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={readLater}
                  onClick={() => setReadLater(!readLater)}
                  className="w-full flex items-center justify-between min-h-11 py-1.5 -my-1.5 rounded-md text-sm text-foreground/90 hover:text-foreground transition-colors"
                >
                  <span>Read later</span>
                  <span
                    className={cn(
                      'inline-flex h-5 w-9 shrink-0 items-center rounded-full border-2 border-transparent transition-colors',
                      readLater ? 'bg-primary' : 'bg-input'
                    )}
                  >
                    <span
                      className={cn(
                        'block h-4 w-4 rounded-full bg-background shadow-lg transition-transform',
                        readLater ? 'translate-x-4' : 'translate-x-0'
                      )}
                    />
                  </span>
                </button>
              </div>

              {/* Footer — save is always visible, never under the keyboard */}
              <div className="flex items-center gap-2.5 border-t border-border/60 px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:pb-3">
                <span className="hidden sm:block flex-1 text-[11px] text-muted-foreground/60">
                  Enter to save · Esc to cancel
                </span>
                <button
                  type="button"
                  onClick={() => onClose?.()}
                  className="h-12 sm:h-9 px-4 rounded-lg sm:rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave}
                  className="flex-1 sm:flex-none h-12 sm:h-9 px-4 sm:px-5 rounded-lg sm:rounded-md bg-primary text-primary-foreground text-sm font-semibold sm:font-medium hover:bg-primary/90 disabled:opacity-40 disabled:pointer-events-none transition-colors"
                >
                  Save bookmark
                </button>
              </div>
            </>
          )}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
