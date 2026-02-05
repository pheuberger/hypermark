# Local-first, E2EE Bookmarking System

> **Note:** This is the original MVP specification from project inception. The implementation has evolved significantly:
> - **Storage**: Now uses Yjs CRDTs instead of Fireproof
> - **Sync**: Hybrid WebRTC P2P + Nostr relay sync (not just same-LAN)
> - **Framework**: React instead of Preact
>
> For current architecture, see [architecture.md](architecture.md) and [nostr-sync-architecture.md](nostr-sync-architecture.md).

---

## 1) Goals and non-goals

### Goals (MVP)

* **Local-first PWA**: works fully offline; UI stays fast even with 1k bookmarks.
* **E2EE by default**: only paired devices can read bookmark data.
* **Device-to-device authentication**: add a new device by scanning a QR code from an existing device (WhatsApp-ish pairing).
* **Sync when both devices are online on the same network**: low-latency replication between open apps, no background daemon.
* **Concurrent edits**: best-effort field merges; eventual consistency.

Use https://github.com/fireproof-storage/fireproof as the storage and sync engine

### Stretch goals

* **Raspberry Pi relay** (cheap “sometimes hub”): enables sync across networks and when devices aren’t simultaneously on the same LAN, without a heavy server.

### Non-goals (MVP)

* Multi-user collaboration.
* Server-side search.
* Guaranteed delivery when devices aren’t both online.
* Cross-device push notifications / background sync on iOS.
* Perfect metadata privacy (timing/size leakage) beyond E2EE content protection.

---

## 2) Assumptions and constraints (from your requirements)

* Devices: **Linux**, **iPhone**, occasional **Windows**.
* Implementation: **pure web** (PWA) preferred; no native companion app.
* No background services.
* Sync happens when two devices have the app open (foreground).
* Bookmark count ~1k, no attachments.
* Features: tags, read-it-later, title/description search (local), favicons/previews.
* Threat model: keep private bookmarks private (e.g., gift browsing); only your paired devices can decrypt.

---

## 3) System overview

### Components

1. **PWA client**

   * Stores encrypted data locally.
   * Maintains a local index for fast UI and search.
   * Participates in peer discovery, pairing, and sync.

2. **Local storage**

   * IndexedDB for structured data.
   * Cache storage for icons/previews where appropriate.

3. **Data/merge layer**

   * Use a local-first document store with deterministic merges (Fireproof is acceptable, but key handling must be controlled).

4. **Networking (MVP)**

   * Same-LAN sync using **direct peer connections**.
   * Transport can be WebRTC data channels **or** WebSocket direct connections on LAN; choose based on implementation effort and browser constraints. (iOS Safari supports WebRTC; that’s usually the most future-proof.)

5. **Security**

   * Device identity keys.
   * Ledger/content encryption key(s).
   * Pairing protocol using QR and a short-lived session.

---

## 4) Data model

### Bookmark document (logical)

Each bookmark is a document with stable ID:

* `id`: UUIDv4 (primary key)
* `url`: string
* `title`: string
* `description`: string (manual, fetched meta, or later AI summary)
* `tags`: set/list of strings
* `readLater`: boolean
* `createdAt`: timestamp
* `updatedAt`: timestamp
* `favicon`: (either URL to cached blob key, or content-hash reference)
* `preview`: minimal metadata (site name, image URL, etc.), optional

### Local indexes (for speed)

* `byUpdatedAt` (descending)
* `byCreatedAt`
* `byReadLater`
* `byTag`
* `byUrlHash` (dedupe assistance)
* Full-text index for `title + description` **local-only** (simple token index is enough for MVP)

---

## 5) Merge semantics (concurrent edits)

You want “merge fields best effort” and “latest state is fine.” Define deterministic rules:

* `tags`: set CRDT semantics

  * Add/remove tracked with tombstones (or equivalent CRDT set).
* `readLater`: last-write-wins (LWW) by timestamp and device id tie-break.
* `title`, `description`: LWW per field (not per doc), same tie-break.
* `url`: treat as immutable after create (or LWW but expect low concurrency).
* Metadata fields `updatedAt` computed locally; not authoritative for conflict.

If using Fireproof:

* Ensure your merge strategy aligns with its multi-head/commit semantics; keep application-level field merges explicit rather than relying on implicit “whole doc overwrite.”

---

## 6) Cryptography & key management

### Identities

Each device generates:

* **Device Identity Keypair** (Ed25519 or P-256, depending on WebCrypto support and your library choices)
* Stored in the device’s secure storage best available:

  * WebCrypto non-extractable key where possible.
  * Encrypted export for migration is optional.

### Encryption keys

* **Ledger symmetric key** (LEK): encrypts all bookmark content blocks.
* Future extensibility: support multiple ledgers (“vaults”) by having multiple LEKs.

### Encryption scheme

* Content encryption: AES-GCM (256 preferred if supported consistently)
* Each record stored encrypted at rest and in transit.
* Associated data (AAD) includes:

  * record id
  * version / commit hash
  * ledger id
    This prevents swapping ciphertext between records.

### Key distribution (critical)

MVP requirement: *device-to-device auth* without trusting a service to distribute keys.

Approach:

* The LEK is **never stored in any remote metadata store** in plaintext.
* Pairing transfers LEK **only** to newly authorized devices.

---

## 7) Pairing protocol (QR-based, device-to-device)

### UX flow

* On existing device A: “Add device” → shows a QR.
* On new device B: “Pair device” → scans QR, confirms pairing, starts sync.

### Security goals

* Prevent unauthorized device pairing without physical access to QR.
* Prevent MITM on LAN during pairing.
* Bind pairing to a short-lived session and confirm possession of keys.

### Protocol outline (MVP)

1. **A generates a one-time pairing session**

   * `pairingSessionId`
   * ephemeral ECDH keypair `A_eph`
   * short expiry (e.g., 5 minutes)

2. **QR contents**

   * `pairingSessionId`
   * `A_eph_public`
   * A’s LAN “contact hints” (see discovery below): e.g., mDNS name, local IP candidates, or WebRTC signaling token
   * Optional: human-readable 6-digit verification code (to display on both sides)

3. **B initiates connection to A**

   * Over the same LAN:

     * Prefer WebRTC if you can do signaling directly via A’s ephemeral token.
     * Or use a simple local HTTP/WebSocket endpoint on A to bootstrap only during pairing.

4. **Mutual authentication**

   * B generates `B_eph`, computes shared secret via ECDH.
   * Both derive a session key `SK = HKDF(ECDH(A_eph, B_eph), sessionId)`.
   * Exchange and verify:

     * a transcript hash
     * optional short code derived from `SK` shown on both screens (“Does 482193 match?”)
   * This blocks “someone else on Wi-Fi hijacked pairing.”

5. **Authorization**

   * A encrypts LEK to `SK` and sends to B.
   * A also sends:

     * ledger id
     * current head/commit reference(s)
     * list of already-authorized device public keys (for audit display)

6. **Persist**

   * B stores LEK locally.
   * Both store each other’s device identity public key in an “authorized devices” list.

### Revocation (MVP-lite)

* Provide “Unpair device” UI:

  * Removes device from authorized list.
  * Does **not** prevent that device from reading already-cached data; users must understand this.
* Strong revocation (re-key ledger) is a later feature.

---

## 8) Same-LAN peer discovery (MVP)

Goal: sync when both devices are on same network and both have the app open.

### Discovery constraints in a PWA

* Browsers don’t give you raw LAN discovery easily.
* iOS Safari limits background/long-lived networking when not active.

### MVP discovery approach (simple + reliable)

Use a **manual-ish but low-friction** model:

* After pairing, devices remember a **Peer Contact Card**:

  * last-known local IP:port (if you use a local endpoint)
  * or a stable WebRTC peer id if you implement a lightweight LAN signaling method
* When app opens:

  * it attempts to connect to known peers opportunistically.
  * user can tap “Sync now” to retry.

Optionally add “same network heuristic”:

* store last-known SSID name if available (often not accessible), or just attempt and fail fast.

### Recommended transport for MVP

**WebRTC data channel** is best long-term:

* Works in iOS Safari.
* Avoids dealing with direct IP access limitations and mixed-content issues.
* Needs signaling: for same-LAN only, you can do signaling via the already-established paired connection pattern (device A briefly hosts a “pairing-style” endpoint) or via a local QR if necessary.

If you want simplest engineering:

* Use a short-lived **local WebSocket endpoint** hosted by the “hub device” (whichever device is currently in pairing/sync mode). This endpoint is not a permanent server; it’s only active while the app is open and sync is happening.

---

## 9) Sync protocol (MVP)

### What gets synced

* Encrypted commits/transactions (deltas), not whole database blobs, to stay fast.
* Heads/clock metadata so peers know what they’re missing.

### High-level algorithm

On app open or “Sync now”:

1. **Handshake**

   * Exchange device identity pubkeys.
   * Verify both are authorized for this ledger (possession of LEK is necessary but not sufficient; also require device is on authorized list).
2. **State summary**

   * Each sends their current head(s) / commit ids.
3. **Diff**

   * Determine missing commits by set difference or requesting ranges.
4. **Transfer**

   * Send encrypted commits.
5. **Apply**

   * Import commits locally; merge; update indexes.
6. **Ack**

   * Persist “last synced with peer X at time T” for UX.

### Consistency

* Eventual consistency.
* Conflicts resolved deterministically by merge semantics.
* UI should never block on network; it shows local state immediately.

### Failure handling

* If sync fails mid-stream, no corruption:

  * commits are immutable
  * apply is idempotent
* Retrying is safe.

---

## 10) Performance targets

### UX targets

* App cold start to usable list: < 1s on modern hardware (best effort; iPhone might be slightly slower).
* Local operations (add/tag/search): < 50ms typical.
* Sync should not block UI; run in worker if possible.

### Implementation notes

* Put heavy work (index rebuild, decrypt batches) in a Web Worker.
* Batch writes to IndexedDB.
* Use incremental indexing: update per doc change.

---

## 11) Privacy considerations

Even with E2EE:

* Peer discovery and sync reveal **timing** and **traffic size** to the network.
* On a shared Wi-Fi, someone can see devices are communicating, but not contents.

Local privacy:

* If your partner can unlock your phone, all bets are off (that’s “device security,” not “sync security”).
* Provide an optional app passcode later if desired.

---

## 12) MVP feature set (product)

### Must-have

* Add/edit/delete bookmark
* Tags + read-later toggle
* Local search (title/description)
* QR pairing
* Same-LAN sync when both open
* Export/import (encrypted or plaintext JSON; your choice)

### Nice-to-have

* Favicon fetching + caching
* Basic preview metadata (title/description fetch)
* “Copy share URL” button

---

## 13) Stretch goal: Raspberry Pi relay (design, not required for MVP)

### Objective

Enable:

* sync when devices are on different networks
* sync when only one device is online at a time (store-and-forward)

### Philosophy

The Pi is a **dumb encrypted blob relay**:

* stores opaque encrypted commits
* does not know bookmark semantics
* does not have the LEK
* cannot decrypt anything

### Minimal relay responsibilities

* Accept uploads of encrypted commit objects addressed by content hash or monotonic sequence.
* Serve downloads by:

  * “give me everything after cursor X”
  * or “give me these commit ids”
* Optionally maintain per-ledger append log of commit references.

### Authorization

* Pi access controlled by:

  * a shared secret established during pairing, or
  * per-device API tokens
* Still, Pi compromise shouldn’t reveal bookmark contents because commits are E2EE.

### Sync behavior with Pi

* Client always writes locally.
* When online, client pushes new commits to Pi.
* Other device, when online, pulls commits from Pi.
* Same merge logic as peer sync.

---

## 14) Open questions / decisions to lock before implementation

These are the only “hard choices” your engineer must settle early:

1. **Transport choice for MVP LAN sync**

   * WebRTC vs local WebSocket endpoint.
2. **How to represent commits/deltas**

   * Leverage Fireproof’s commit/ledger model directly vs wrap it with an app-level delta format.
3. **Key storage strategy**

   * WebCrypto non-extractable keys vs extractable encrypted-at-rest keys for portability.
4. **Device authorization list storage**

   * In-ledger encrypted metadata vs separate local “device registry.”
5. **Indexing strategy**

   * Basic token index vs using an embedded library.

---

## 15) Acceptance criteria (MVP done when)

* Pair iPhone ↔ Linux via QR on same Wi-Fi in under 30 seconds.
* Add/edit/tag bookmarks on either device; see changes appear on the other within a few seconds while both are open.
* Turn Wi-Fi off; app remains fully usable offline.
* Restart app; all data persists locally and decrypts correctly.
* Concurrent edit test:

  * Device A edits tags while device B toggles read-later → both changes survive after sync.
* No plaintext bookmark content is stored or transmitted (verify by inspecting local storage/network payloads in dev tools).

---

If you want, I can also provide a one-page “Engineer handoff checklist” (milestones + test plan) that maps directly onto tickets, still without code.
