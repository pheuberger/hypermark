# AGENTS.md - Hypermark AI Agent Guidelines

> A privacy-first, end-to-end encrypted bookmark manager with device-to-device sync.

## Project Overview

Hypermark is a **local-first PWA** that enables users to manage bookmarks privately with E2EE (end-to-end encryption) and sync across devices using P2P WebRTC connections. No server ever sees unencrypted data.

### Core Philosophy

- **Privacy by default**: All bookmark data is encrypted locally using AES-GCM
- **Local-first**: Works fully offline; UI stays fast even with 1k bookmarks
- **P2P sync**: Direct device-to-device sync via WebRTC, no central server stores data
- **Zero-trust**: Signaling servers never see unencrypted content

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| **UI Framework** | Preact + Vite |
| **Styling** | Tailwind CSS 4 + DaisyUI 5 |
| **Icons** | Lucide (via `lucide-preact`) |
| **State/Sync** | Yjs CRDTs |
| **P2P Transport** | y-webrtc (WebRTC data channels) |
| **Local Storage** | y-indexeddb (IndexedDB persistence) |
| **Pairing** | y-webrtc signaling + Web Crypto API |
| **Search** | MiniSearch (client-side full-text) |
| **QR Codes** | qrcode (generation) + qr-scanner (scanning) |
| **Compression** | pako (for QR payloads) |
| **Encoding** | bs58 (Base58 for pairing codes) |

### Key Dependencies

```json
{
  "preact": "^10.28.1",
  "@preact/signals": "^1.3.2",
  "yjs": "^13.6.28",
  "y-webrtc": "^10.3.0",
  "y-indexeddb": "^9.0.12",
  "minisearch": "^6.3.0",
  "daisyui": "^5.5.14",
  "tailwindcss": "^4.1.18"
}
```

---

## Architecture

### Data Flow

```
User Action
    │
    ▼
Preact Component (UI)
    │
    ▼
Service Layer (src/services/)
    │
    ├──► Yjs Document (CRDT)
    │         │
    │         ├──► IndexedDB (local persistence)
    │         │
    │         └──► WebRTC (P2P sync with password)
    │
    └──► Web Crypto API (encryption/decryption)
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **LEK** | Ledger Encryption Key - shared symmetric key (AES-256-GCM) for encrypting all bookmark data. Generated on first device, transferred during pairing. |
| **Device Keypair** | ECDH P-256 keypair per device for secure key exchange during pairing |
| **Yjs Document** | CRDT document containing `bookmarks`, `devices`, and `settings` maps |
| **Room Password** | Derived from LEK via HKDF, used to encrypt Yjs WebRTC room |
| **Verification Words** | Human-readable words derived from pairing session for MITM protection |

### Sync Mechanism

1. **IndexedDB**: Local persistence (always enabled)
2. **WebRTC**: P2P sync (enabled after device pairing)
3. **BroadcastChannel**: Same-device tab sync (automatic)

---

## Directory Structure

```
src/
├── components/
│   ├── bookmarks/       # Bookmark CRUD UI
│   │   ├── BookmarkList.jsx    # Main list with filters
│   │   ├── BookmarkItem.jsx    # Individual bookmark card
│   │   ├── BookmarkForm.jsx    # Add/edit modal
│   │   ├── FilterBar.jsx       # Search + sort controls
│   │   └── TagSidebar.jsx      # Tag navigation
│   │
│   ├── pairing/         # Device pairing UI
│   │   ├── PairingFlow.jsx     # Main pairing orchestrator
│   │   ├── QRCodeDisplay.jsx   # Show QR for scanning
│   │   └── QRScanner.jsx       # Camera QR scanner
│   │
│   ├── sync/            # Sync status UI
│   │   └── ConnectionStatus.jsx
│   │
│   └── ui/              # Reusable UI primitives
│       ├── Button.jsx
│       ├── Input.jsx
│       ├── Modal.jsx
│       ├── Tag.jsx
│       └── Icons.jsx    # Lucide icon re-exports
│
├── hooks/
│   ├── useYjs.js        # Yjs document + providers
│   └── useSearch.js     # MiniSearch integration
│
├── services/
│   ├── bookmarks.js     # Bookmark CRUD operations
│   ├── crypto.js        # Web Crypto utilities
│   ├── key-storage.js   # LEK storage/retrieval
│   ├── device-registry.js # Paired device management
│   ├── search-index.js  # MiniSearch setup
│   ├── signaling.js     # WebSocket client for y-webrtc signaling
│   └── wordlist.js      # BIP39 wordlist for verification
│
├── utils/
│   ├── device-id.js     # Unique device identification
│   └── qr.js            # QR encoding/decoding helpers
│
├── app.jsx              # Main app component + routing
├── app.css              # App-specific styles
├── index.css            # Tailwind imports
└── main.jsx             # Entry point
```

---

## Code Conventions

### Component Patterns

```jsx
// Functional components with hooks
export function ComponentName({ prop1, prop2 }) {
  const [state, setState] = useState(initialValue)
  
  useEffect(() => {
    // Side effects
  }, [dependencies])
  
  return (
    <div className="tailwind-classes">
      {/* JSX */}
    </div>
  )
}
```

### Service Patterns

```javascript
// Services are pure functions operating on Yjs or Web Crypto
export function serviceFunctionName(params) {
  // Validation first
  if (!params.required) {
    throw new Error('Descriptive error message')
  }
  
  // Core logic
  const result = doSomething()
  
  // Logging for debugging
  console.log('[ServiceName] Action:', result)
  
  return result
}
```

### Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Components | PascalCase | `BookmarkList.jsx` |
| Hooks | camelCase with `use` prefix | `useYjs.js` |
| Services | camelCase | `bookmarks.js` |
| Functions | camelCase, verb-first | `createBookmark()`, `getAllTags()` |
| Constants | UPPER_SNAKE_CASE | `CACHE_NAME` |
| CSS Classes | kebab-case (Tailwind/DaisyUI) | `btn-primary` |

### Import Order

```javascript
// 1. External dependencies
import { useState, useEffect } from 'preact/hooks'
import * as Y from 'yjs'

// 2. Internal services/hooks
import { useYjs } from '../../hooks/useYjs'
import { createBookmark } from '../../services/bookmarks'

// 3. Components
import { Button } from '../ui/Button'

// 4. Utils/constants
import { generateUUID } from '../../utils/device-id'
```

---

## Styling Guidelines

### DaisyUI Components

Use DaisyUI component classes for consistency:

```jsx
// Buttons
<button className="btn btn-primary">Primary</button>
<button className="btn btn-secondary">Secondary</button>
<button className="btn btn-ghost">Ghost</button>

// Cards
<div className="card bg-base-200 shadow-md">
  <div className="card-body">Content</div>
</div>

// Form inputs
<input className="input input-bordered w-full" />

// Loading states
<span className="loading loading-spinner loading-lg" />
```

### Tailwind Patterns

```jsx
// Flexbox layouts
<div className="flex items-center justify-between gap-4">

// Responsive design
<div className="hidden lg:block">  {/* Desktop only */}
<div className="lg:hidden">        {/* Mobile only */}

// Common spacing
<div className="p-4 space-y-4">    {/* Padding + vertical gaps */}
```

---

## Security Considerations

### CRITICAL: Never Do

- **Never** expose raw LEK in logs, network requests, or localStorage
- **Never** use `as any`, `@ts-ignore`, or suppress type errors
- **Never** store sensitive keys in extractable form
- **Never** transmit pairing data without encryption
- **Never** skip verification word confirmation

### Key Storage

```javascript
// LEK is stored encrypted in IndexedDB via key-storage.js
// Device keypairs are non-extractable (WebCrypto)
const keypair = await crypto.subtle.generateKey(
  { name: 'ECDH', namedCurve: 'P-256' },
  false,  // NON-EXTRACTABLE - critical for security
  ['deriveKey', 'deriveBits']
)
```

### Yjs Room Password

The Yjs WebRTC room uses a password **derived** from LEK (not the raw LEK):

```javascript
// Derive Yjs password from LEK using HKDF
const yjsPassword = await deriveYjsPassword(lek)
// This ensures even if y-webrtc is compromised, raw LEK isn't exposed
```

### Pairing Security

1. QR contains: `sessionId`, `ephemeral public key`, `signalingUrl`, `deviceName`, `expires`
2. Devices connect to same signaling room and perform ECDH key exchange
3. Shared secret derives session key via HKDF
4. Verification words shown on both devices (MITM protection)
5. User confirms words match before LEK transfer
6. Session expires after 5 minutes

**Note**: Pairing uses the same y-webrtc signaling server as sync (single server architecture).

---

## Development Workflow

### Starting Development

```bash
# Terminal 1: Signaling server
npm run signaling

# Terminal 2: Dev server
npm run dev
```

### Environment Configuration

```bash
# .env (copy from .env.example)
VITE_SIGNALING_URL=ws://localhost:4444

# For ngrok testing
VITE_SIGNALING_URL=wss://your-tunnel.ngrok-free.app
```

### Testing Multi-Device Sync

1. **Same machine**: Open multiple tabs
2. **LAN devices**: Use local IP in VITE_SIGNALING_URL
3. **Remote devices**: Use ngrok tunnels for both signaling and dev server

### Build

```bash
npm run build   # Production build
npm run preview # Preview production build
```

---

## Important Patterns

### Yjs Document Access

```javascript
// Always use the singleton from useYjs hook
const { bookmarks, synced } = useYjs()

// Or get instance directly for services
import { getYdocInstance } from '../hooks/useYjs'
const doc = getYdocInstance()
const bookmarksMap = doc.getMap('bookmarks')
```

### Bookmark CRUD

```javascript
// All operations go through services/bookmarks.js
import { 
  createBookmark, 
  updateBookmark, 
  deleteBookmark,
  getAllBookmarks,
  toggleReadLater 
} from '../services/bookmarks'

// Bookmarks are Y.Map instances with Y.Array for tags
const bookmark = new Y.Map([
  ['id', id],
  ['url', normalizedUrl],
  ['title', title],
  ['tags', new Y.Array(tags)],  // CRDT set semantics
  ['readLater', false],
  ['createdAt', Date.now()],
  ['updatedAt', Date.now()]
])
```

### Observing Yjs Changes

```javascript
useEffect(() => {
  const observer = () => {
    // Reload data when Yjs map changes
    setBookmarks(getAllBookmarks())
  }
  
  bookmarksMap.observe(observer)
  return () => bookmarksMap.unobserve(observer)
}, [bookmarksMap])
```

### Crypto Operations

```javascript
// All crypto through services/crypto.js
import {
  generateDeviceKeypair,     // For device identity
  generateEphemeralKeypair,  // For pairing sessions
  deriveSharedSecret,        // ECDH key agreement
  deriveSessionKey,          // HKDF for session keys
  encryptData,               // AES-GCM encryption
  decryptData,               // AES-GCM decryption
  generateLEK,               // Create new LEK
  exportLEK,                 // For pairing transfer
  importLEK,                 // Receive LEK
  deriveYjsPassword          // LEK -> Yjs room password
} from '../services/crypto'
```

---

## Error Handling

### User-Facing Errors

```javascript
try {
  await riskyOperation()
} catch (error) {
  console.error('[Context] Failed:', error)
  // Show user-friendly message
  alert('Failed to save bookmark: ' + error.message)
  throw error  // Re-throw for upstream handling
}
```

### Validation Errors

```javascript
// Use validateBookmark() before any create/update
import { validateBookmark, isValidUrl } from '../services/bookmarks'

try {
  const validated = validateBookmark(data)
  createBookmark(validated)
} catch (error) {
  // error.message contains user-friendly validation error
  showError(error.message)
}
```

---

## Performance Targets

| Metric | Target |
|--------|--------|
| Cold start to usable list | < 1s |
| Local operations (add/tag/search) | < 50ms |
| Sync handshake | < 2s |
| Bundle size (compressed) | < 150KB |
| Storage for 1000 bookmarks | ~5MB |

---

## Merge Semantics (CRDT)

| Field | Strategy |
|-------|----------|
| `tags` | Set CRDT (add-wins) |
| `readLater` | Last-write-wins (LWW) |
| `title`, `description` | LWW per field |
| `url` | Immutable after create |
| `createdAt` | Immutable |
| `updatedAt` | Auto-updated on any change |

---

## Files to Read First

When onboarding to this codebase, read in order:

1. `docs/specification.md` - Full project spec and requirements
2. `docs/security.md` - Detailed security architecture
3. `src/hooks/useYjs.js` - Core sync mechanism
4. `src/services/crypto.js` - Crypto primitives
5. `src/services/bookmarks.js` - Data operations
6. `src/components/pairing/PairingFlow.jsx` - Device pairing flow
7. `docs/plans/phases-7-8-9-implementation.md` - Remaining work

---

## Common Tasks

### Adding a New Bookmark Field

1. Update `validateBookmark()` in `src/services/bookmarks.js`
2. Add field to `createBookmark()` Y.Map initialization
3. Update `updateBookmark()` to handle the field
4. Update `bookmarkToObject()` helper
5. Update UI components as needed

### Adding a New Service

1. Create `src/services/new-service.js`
2. Follow existing patterns (validation, logging, error handling)
3. Export functions, not classes (unless stateful)
4. Document with JSDoc comments

### Adding a New Component

1. Create in appropriate subdirectory under `src/components/`
2. Use DaisyUI + Tailwind for styling
3. Import icons from `../ui/Icons.jsx`
4. Follow existing component patterns (hooks, effects, cleanup)

---

## Gotchas

1. **Yjs not initialized**: Always check `getYdocInstance()` returns non-null before service operations
2. **LEK extractability**: LEK must be `extractable: true` during pairing, but should be stored as non-extractable after import
3. **iOS Safari limits**: ~50MB storage limit, monitor with `navigator.storage.estimate()`
4. **WebRTC password**: Must derive from LEK using HKDF, never use raw LEK
5. **Preact vs React**: Use `preact/hooks`, not `react` imports
6. **Tailwind v4**: Uses new CSS-based config, not `tailwind.config.js`

<!-- bv-agent-instructions-v1 -->

---

## Beads Workflow Integration

This project uses [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer) for issue tracking. Issues are stored in `.beads/` and tracked in git.

### Essential Commands

```bash
# View issues (launches TUI - avoid in automated sessions)
bv

# CLI commands for agents (use these instead)
bd ready              # Show issues ready to work (no blockers)
bd list --status=open # All open issues
bd show <id>          # Full issue details with dependencies
bd create --title="..." --type=task --priority=2
bd update <id> --status=in_progress
bd close <id> --reason="Completed"
bd close <id1> <id2>  # Close multiple issues at once
bd sync               # Commit and push changes
```

### Workflow Pattern

1. **Start**: Run `bd ready` to find actionable work
2. **Claim**: Use `bd update <id> --status=in_progress`
3. **Work**: Implement the task
4. **Complete**: Use `bd close <id>`
5. **Sync**: Always run `bd sync` at session end

### Key Concepts

- **Dependencies**: Issues can block other issues. `bd ready` shows only unblocked work.
- **Priority**: P0=critical, P1=high, P2=medium, P3=low, P4=backlog (use numbers, not words)
- **Types**: task, bug, feature, epic, question, docs
- **Blocking**: `bd dep add <issue> <depends-on>` to add dependencies

### Session Protocol

**Before ending any session, run this checklist:**

```bash
git status              # Check what changed
git add <files>         # Stage code changes
bd sync                 # Commit beads changes
git commit -m "..."     # Commit code
bd sync                 # Commit any new beads changes
git push                # Push to remote
```

### Best Practices

- Check `bd ready` at session start to find available work
- Update status as you work (in_progress → closed)
- Create new issues with `bd create` when you discover tasks
- Use descriptive titles and set appropriate priority/type
- Always `bd sync` before ending session

<!-- end-bv-agent-instructions -->

## Landing the Plane (Session Completion)

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   bd sync
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
