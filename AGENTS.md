# AGENTS.md - Hypermark AI Agent Guidelines

> Privacy-first, E2E encrypted bookmark manager with hybrid P2P + Nostr sync.

## Core Philosophy

- **Privacy by default**: All data encrypted with AES-256-GCM before leaving device
- **Local-first**: Full offline support, UI must stay fast with 1k+ bookmarks
- **Zero-trust**: Neither signaling servers nor Nostr relays see plaintext data
- **Hybrid sync**: WebRTC for real-time P2P, Nostr relays for async/offline sync

---

## Architecture (Non-Obvious Parts)

### Dual Sync System

```
Device A                              Device B
    │                                     │
    └──► WebRTC (real-time, <1s) ◄────────┘
    │                                     │
    └──► Nostr Relays (async, encrypted) ◄┘
```

- **WebRTC**: Sub-second sync when both devices online (y-webrtc provider)
- **Nostr**: Encrypted events (kind 30053) stored on relays for offline sync
- **Both** use the same Yjs document - changes merge via CRDT

### Key Cryptographic Concepts

| Concept | What It Is | Critical Notes |
|---------|------------|----------------|
| **LEK** | Ledger Encryption Key (AES-256-GCM) | Shared across all paired devices. NEVER log, expose, or transmit raw. |
| **Yjs Password** | Derived from LEK via HKDF | Used for WebRTC room encryption. Never use raw LEK directly. |
| **Nostr Keypair** | Secp256k1 keypair derived from LEK | Deterministic - same LEK = same keypair on all devices. |
| **Device Keypair** | ECDH P-256, non-extractable | For pairing handshake only. Stored in IndexedDB via WebCrypto. |

### Nostr Sync Details

- Events use **kind 30053** (parameterized replaceable)
- Content is **always encrypted** before publishing
- Keypair is **derived from LEK** via `deriveNostrKeypair()` - NOT random
- Sync uses 1.5s debounce to batch rapid changes
- See `docs/nostr-sync-architecture.md` for full details

---

## Security Rules (CRITICAL)

### Never Do

- **Never** expose raw LEK in logs, network, or localStorage
- **Never** use raw LEK as WebRTC password (derive via HKDF)
- **Never** publish unencrypted content to Nostr relays
- **Never** skip verification word confirmation during pairing
- **Never** make device keypairs extractable (`extractable: false`)

### Pairing Flow Security

1. QR contains: sessionId, ephemeral pubkey, signalingUrl, expires
2. Devices perform ECDH to derive shared secret
3. **Verification words** shown on both devices (MITM protection)
4. User MUST confirm words match before LEK transfer
5. Session expires after 5 minutes

---

## Gotchas

1. **React, not Preact** - Package.json shows react/react-dom. The doc diagrams may say Preact but code uses React.

2. **LEK extractability** - LEK must be `extractable: true` during pairing transfer, but ephemeral/device keys should be non-extractable.

3. **Nostr keypair is deterministic** - Same LEK always produces same Nostr keypair. This is intentional for cross-device identity.

4. **WebRTC password derivation** - Always use `deriveYjsPassword(lek)`, never pass LEK directly to y-webrtc.

5. **Yjs singleton** - Use `getYdocInstance()` from useYjs hook. Never create new Y.Doc instances.

6. **UndoManager origin** - Local bookmark ops must use `LOCAL_ORIGIN` constant for proper undo tracking.

7. **Nostr event validation** - Events have strict validation (MAX_CONTENT_SIZE=100KB, timestamp bounds). See `VALIDATION_ERRORS` in nostr-sync.js.

8. **iOS Safari** - ~50MB IndexedDB limit. Monitor with `navigator.storage.estimate()`.

9. **Tailwind v4** - Uses CSS-based config (`@config`), not `tailwind.config.js`.

---

## CRDT Merge Semantics

| Field | Strategy |
|-------|----------|
| `tags` | Y.Array - add-wins set semantics |
| `url` | Immutable after create |
| `title`, `description`, `readLater` | Last-write-wins |
| `createdAt` | Immutable |
| `updatedAt` | Auto-updated on change |

---

## Files to Read First

1. `docs/nostr-sync-architecture.md` - Explains hybrid sync system
2. `src/services/crypto.js` - All crypto primitives
3. `src/services/nostr-crypto.js` - Nostr-specific crypto (keypair derivation)
4. `src/services/nostr-sync.js` - NostrSyncService class
5. `src/hooks/useYjs.js` - Yjs document + providers setup
6. `src/services/bookmarks.js` - Bookmark CRUD
7. `docs/security.md` - Security architecture

---

## Testing

```bash
npm test              # Run all tests
npm run test:security # Security-critical tests only
npm run test:coverage # With coverage report
```

Key test files:
- `src/services/nostr-sync.test.js` - Sync logic
- `src/services/crypto.test.js` - Crypto primitives
- `src/services/security-audit.test.js` - Security invariants

**After implementing any feature or fix, you MUST run `npm run test:coverage` and verify all coverage thresholds pass before committing.** If coverage drops below thresholds, add tests for your new code until thresholds are met. IF you can't write meaningful tests to increase coverage, stop and ask me what to do.

---

## Beads Workflow

Issue tracking via [beads_viewer](https://github.com/Dicklesworthstone/beads_viewer). Issues in `.beads/`.

```bash
bd ready                # Find unblocked work
bd show <id>            # Issue details
bd update <id> --status=in_progress
bd close <id>           # Mark complete
bd sync                 # Commit beads changes
```

Priority: P0=critical, P1=high, P2=medium, P3=low, P4=backlog

---

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
