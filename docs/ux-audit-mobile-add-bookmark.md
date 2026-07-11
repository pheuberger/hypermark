# UX Audit: Adding Bookmarks on Mobile

**Scope:** Only the add-bookmark flow on mobile (≤640px). Audited at 390×844
(iPhone 14 class) against the running app, with desktop (1440×900) as the
regression baseline. Element sizes below were measured in the browser, not
estimated from code.

**Add paths that exist today:**

| Path | Mobile status |
|---|---|
| Header **+ Add** → inline draft card | Works, but the card is keyboard-first (see findings) |
| **Share sheet** (PWA share target) | Works well — creates bookmark + toast, no form needed |
| **Paste anywhere** (`usePasteToBookmark`) | Effectively desktop-only — document-level `paste` events require a hardware keyboard; touch users can only paste into a focused input |
| **`g n` hotkey** | Desktop-only by nature |

---

## Findings (ranked)

### 1. URL entry fights the mobile keyboard — FIXED

The URL field in the draft card is a bare `type="text"` input with no
`inputmode`, `autocapitalize`, `autocorrect`, `spellcheck`, or `enterkeyhint`
attributes, and it is focused from an async effect.

Consequences on a phone:

- iOS/Android autocapitalize the first letter (`Https://…`) and autocorrect
  domain names while typing; both routinely produce "Invalid URL".
- The generic text keyboard is shown instead of the URL layout
  (`/`, `.`, `.com` conveniences).
- The return key is a generic newline key instead of **Go**, hiding the fact
  that Enter saves the bookmark.
- Because focus happens in a `useEffect` (async relative to the tap on
  **Add**), iOS Safari does not reliably open the keyboard — the user has to
  tap the field a second time. The field is also only **16px tall**
  (measured 318×16), a very small target.

**Fix applied:** `inputMode="url"`, `autoCapitalize="none"`,
`autoCorrect="off"`, `spellCheck={false}`, `enterKeyHint="go"`, plus
`autoFocus` (focus now happens synchronously in the commit triggered by the
tap, so the keyboard opens). The input gets a taller touch target on mobile
(`py-2`) while staying pixel-identical on `sm+`. The tag input similarly gets
`autoCapitalize="none"`/`autoCorrect="off"`/`spellCheck={false}` — tags are
lowercased on create, so autocapitalize only caused fights. Title/desc keep
autocorrect (they're prose).

### 2. The copied-URL fast path doesn't exist on touch — FIXED

The dominant real-world mobile flow is *copy link in browser → open
Hypermark → add it*. Desktop covers this brilliantly (paste anywhere creates
a bookmark instantly), but on touch that hook never fires: mobile browsers
only emit `paste` events into focused editable elements. The mobile user must
tap **Add**, tap the tiny URL line, long-press, wait for the callout, then tap
Paste — four precise interactions for the single most common action.

**Fix applied:** the draft card now shows a **Paste** button in the URL row
(when the field is empty and the async Clipboard API is available). One tap
reads the clipboard via `navigator.clipboard.readText()`, validates and
normalizes the URL, fills the field, and moves focus to the title. Non-URL or
unreadable clipboard shows the inline error instead of silently doing
nothing. Desktop gets the same button — a net improvement there too.

### 3. Touch targets and keyboard-only affordances in the draft card — FIXED

Measured in the draft card at 390px:

- **Save** button: 51×16px; **Cancel**: 61×16px. Apple HIG/Material both ask
  for ≥44px targets; these are a third of that, and they sit next to each
  other, so mis-taps either discard the draft or save it half-finished.
- "Read later" checkbox: 14×14px.
- The footer permanently shows **"Enter to save · Esc to cancel"** and the tag
  input shows **"Press ↓ to see existing tags"** — instructions for keys that
  don't exist on a touch screen, spending scarce vertical space while the
  keyboard is up.

**Fix applied:** Save/Cancel get ≥44px-tall touch targets on mobile
(`py-3`, extra gap so the hit areas don't collide), the Read later label gets
a taller hit area and a 16px checkbox on mobile, and both keyboard hints are
hidden below `sm`. All of this is breakpoint-gated: desktop renders exactly
as before (the tag dropdown already opens on focus, so mobile loses nothing
by hiding the ↓ hint).

---

## Backlog (real, but not top 3)

4. **Multi-line descriptions are impossible on mobile.** Enter in the
   description textarea saves the card; newline requires Shift+Enter, which
   soft keyboards don't have.
5. **Manual adds never fetch content suggestions.** The paste and share-target
   paths auto-fill title/description via `content-suggestion`, but the draft
   card doesn't use `useContentSuggestion` at all — on mobile, typing a title
   is exactly the thing users want automated.
6. **Draft is lost silently.** Tapping outside/Cancel discards a typed draft
   with no undo; Android back gesture closes the PWA entirely.
7. **The draft card renders above the list but below the sticky header** — on
   short viewports with the keyboard up, the tags/save row can end up under
   the keyboard; the card could render in a bottom sheet on mobile instead.
8. **Share-target duplicate toast is dead-end** — "Already bookmarked" could
   offer "View it" to jump to the existing bookmark.

## Verification

- Playwright at 390×844 (mobile emulation, touch) and 1440×900: draft card
  screenshots before/after; measured button/input rects before/after.
- `npm run test:coverage` passes all thresholds; new tests cover the paste
  button, keyboard attributes, and mobile-target classes
  (`src/components/bookmarks/BookmarkInlineCard.test.jsx`).
