# Social Bookmarking on AT Protocol: Research & Proposal

> A comprehensive exploration of integrating social bookmarking features with Hypermark's privacy-first architecture

**Date**: December 31, 2025  
**Status**: Research & Planning  
**Last Major Update**: December 31, 2025 — Revised architecture to use atproto for identity + Nostr for private sync. See Part 5B.

---

## Executive Summary

The social bookmarking space is experiencing a **"Great Diaspora"** following Pocket's shutdown (July 2025) and Pinboard's stagnation. Users are migrating toward local-first, privacy-respecting tools. Meanwhile, AT Protocol (atproto) has matured as a decentralized social substrate with emerging support for private data storage.

**Opportunity**: Build a bookmark manager that offers the **best of both worlds**:
- The privacy and speed of local-first E2EE architecture (current Hypermark)
- The discovery and social features of a federated protocol (atproto)
- Asynchronous sync without requiring all devices online simultaneously

**Key Insight**: atproto can serve **dual purposes**:
1. **Public social layer** - Discoverable bookmarks shared with the network
2. **Private storage adapter** - Encrypted blob storage on your PDS for async sync

---

## Part 1: The Social Bookmarking Landscape (2025)

### 1.1 History & Evolution

| Era | Service | Defining Characteristic |
|-----|---------|-------------------------|
| **2003-2010** | Delicious | "Folksonomy" - social tagging and discovery |
| **2009-2024** | Pinboard | "Plain, no-nonsense" - speed, archiving, privacy |
| **2012-2025** | Pocket | Read-it-later monopoly, browser integration |
| **2025+** | Fragmentation | Post-Pocket diaspora, local-first renaissance |

**The 2025 Turning Point**: Mozilla's shutdown of Pocket (announced May 2025, closed July 2025) forced millions of users to migrate, creating massive demand for alternatives.

### 1.2 What Users Love About Social Bookmarking

| Motivation | User Sentiment | Evidence |
|------------|----------------|----------|
| **Mental Clarity** | "Saving it so I can stop thinking about it" | External brain, cognitive offloading |
| **Serendipity** | "Stumbling upon my past self's interests" | Unlike search engines, bookmarks allow rediscovery |
| **Curation as Identity** | "It's like playlists for ideas" | Are.na users describe it as creative act |
| **Anti-Algorithm** | "Doesn't produce anxiety like other social networks" | Chronological, high-signal feeds |

**Quote from Are.na user**:
> "It feels like a piece of paper that you can keep adding to... it doesn't produce anxiety like other social networks."

### 1.3 Pain Points We Can Solve

1. **Platform Death** — Pocket shutdown, Pinboard neglect. Users want **data ownership**.
   - *Solution*: Self-hosted PDS + local-first = never lose your data

2. **Link Rot** — Old bookmarks go 404. Users frustrated by dead links.
   - *Solution*: Optional archiving/snapshots (future feature)

3. **Privacy Erosion** — "Will this service mine my reading habits?"
   - *Solution*: E2EE private bookmarks that never leave devices unencrypted

4. **Discovery Drought** — Private tools are lonely; public tools expose everything.
   - *Solution*: Hybrid model with user-controlled public/private boundary

5. **Stale/Stagnant Tools** — Pinboard hasn't updated in years.
   - *Evidence*: "Paid archiving accounts aren't archiving" (HN complaints 2024-2025)

### 1.4 Modern Trends (2025)

| Trend | Description | Examples |
|-------|-------------|----------|
| **AI Semantic Search** | Auto-categorize, chat with bookmarks | Bookmarkjar, xBookmarks |
| **Local-First Architecture** | Offline-first, P2P sync, data sovereignty | Hypermark, Linkwarden |
| **Zero-Knowledge Encryption** | Service can't see your bookmarks | (Few exist—opportunity!) |
| **Self-Hosting Boom** | /r/selfhosted increasingly popular | Shiori, Linkwarden |

**Quote from Bookmarkjar (2025)**:
> "Find faster, organize less. No folders. No friction."

### 1.5 Competitive Landscape

| Tool | Strength | Weakness | Cost |
|------|----------|----------|------|
| **Raindrop.io** | Beautiful UI, full-featured | Centralized, no E2EE | Freemium ($28/yr) |
| **Are.na** | Social, artistic community | Niche, learning curve | Free/$5/mo |
| **Linkwarden** | Self-hosted, archiving | No social features | Free (self-host) |
| **Bluesky Bookmarks** | Native to atproto | Posts-only, no URLs | Free |
| **Hypermark (current)** | E2EE, local-first, P2P | No social, no async sync | Free |

**Gap in market**: No tool combines **E2EE private bookmarks** + **federated public sharing** + **async sync**.

---

## Part 2: AT Protocol Deep Dive

### 2.1 Architecture Overview

atproto is a three-tier federated architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │  Bluesky    │    │  Hypermark  │    │   Whitewind │     │
│  │   (posts)   │    │ (bookmarks) │    │   (blogs)   │     │
│  └─────────────┘    └─────────────┘    └─────────────┘     │
└───────────┬────────────────┬────────────────┬───────────────┘
            │                │                │
            ▼                ▼                ▼
┌───────────────────────────────────────────────────────────┐
│                    AppView Layer                          │
│  (Indexing, search, feeds, aggregation)                   │
│  - Consumes Firehose from Relay                           │
│  - Builds app-specific views                              │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                      Relay Layer                          │
│  (Aggregates data from all PDSes)                         │
│  - "Firehose" = real-time stream of all events            │
│  - "Jetstream" = filtered, lightweight version            │
└───────────────────────────┬───────────────────────────────┘
                            │
                            ▼
┌───────────────────────────────────────────────────────────┐
│                     PDS Layer                             │
│  (Personal Data Server - stores your account)             │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Public Repo (Merkle Search Tree - MST)            │ │
│  │  - Signed records (posts, likes, follows)          │ │
│  │  - Synced to Relay/Firehose                        │ │
│  └─────────────────────────────────────────────────────┘ │
│                                                           │
│  ┌─────────────────────────────────────────────────────┐ │
│  │  Private Stash (off-protocol storage)              │ │
│  │  - NOT synced to Relay                             │ │
│  │  - Accessed via authenticated XRPC                 │ │
│  └─────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

### 2.2 Core Concepts

| Concept | Description | Example |
|---------|-------------|---------|
| **DID** | Decentralized Identifier (permanent identity) | `did:plc:abc123...` |
| **Handle** | Human-readable name (maps to DID) | `@user.bsky.social` |
| **Repo** | Merkle Search Tree of records | Signed commits, like Git |
| **Lexicon** | Schema definition (JSON) | Defines record structure |
| **NSID** | Namespaced ID for collections | `app.bsky.feed.post` |
| **Record** | Individual data item | A post, like, follow, bookmark |

### 2.3 Bluesky Hosted vs. Self-Hosted PDS

| Aspect | Bluesky Hosted (`bsky.social`) | Self-Hosted PDS |
|--------|--------------------------------|-----------------|
| **Setup** | Create account, instant | Install PDS, configure domain |
| **Cost** | Free | ~$5/mo VPS + domain |
| **Control** | Bluesky controls infrastructure | Full data sovereignty |
| **Portability** | Can migrate to self-hosted | Can migrate between hosts |
| **Privacy** | Trust Bluesky not to peek | You control all data |

**Self-Hosting Requirements**:
- Linux VPS (Ubuntu/Debian)
- Domain name + DNS control
- Ports 80/443 open
- ~512MB RAM, 10GB storage

**Migration**: You can start on Bluesky-hosted and migrate to self-hosted later by updating your DID document to point to new PDS location.

### 2.4 Data Model: Records & Lexicons

Every piece of data is a **Record** in a **Collection**. Collections are defined by **Lexicons**.

**Example: Bookmark Lexicon**

```json
{
  "lexicon": 1,
  "id": "social.hypermark.bookmark",
  "defs": {
    "main": {
      "type": "record",
      "description": "A public bookmark with metadata",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["url", "createdAt"],
        "properties": {
          "url": { "type": "string", "format": "uri", "maxLength": 2048 },
          "title": { "type": "string", "maxLength": 300 },
          "description": { "type": "string", "maxLength": 1000 },
          "tags": { 
            "type": "array", 
            "items": { "type": "string", "maxLength": 64 },
            "maxLength": 10
          },
          "via": { 
            "type": "string", 
            "format": "at-uri", 
            "description": "Who you found this from" 
          },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

**Creating a record**:
```typescript
await agent.api.social.hypermark.bookmark.create({
  repo: myDid,
  record: {
    url: "https://example.com/article",
    title: "Interesting Article",
    description: "Deep dive into...",
    tags: ["programming", "databases"],
    via: "at://did:plc:user123/app.bsky.feed.post/abc",
    createdAt: new Date().toISOString()
  }
})
```

### 2.5 Privacy: Public vs. Private Data

Historically, atproto was **"public by design"**—all records synced to the Firehose. However, **recent updates** added private data support.

#### Public Data (Default)
- Stored in **Public Repo** (MST)
- Synced to Relay/Firehose
- Discoverable by anyone
- Signed by your DID

#### Private Data (New: "Stash")
- Stored in **Private Stash** on PDS
- **NOT synced to Relay**
- Only accessible via authenticated XRPC calls
- Not part of public repo

**Evidence**: [PR #4163](https://github.com/bluesky-social/atproto/pull/4163) introduced private bookmarks for Bluesky.

**Official Bluesky Bookmarks Implementation**:
- Uses `app.bsky.bookmark.*` lexicons
- Private by default (off-protocol)
- Currently only supports saving Bluesky posts (not external URLs)

### 2.6 End-to-End Encryption (E2EE) on atproto

**Current State**: Native E2EE is **not in the core protocol**, but is being developed by:
- **E2EE Working Group** - Building MLS (Messaging Layer Security) support
- **Germ Network** - Implemented E2EE DMs on atproto using pairwise cryptographic identities

**How Germ Implements E2EE**:
1. Alice and Bob agree on keys via their atproto DIDs
2. Messages encrypted locally before storage
3. Stored as encrypted blobs on PDS
4. Only recipient can decrypt using device-stored keys
5. **PDS never sees plaintext**

**Implication for Hypermark**: We can store **encrypted bookmark blobs** on the PDS, treating it as a "dumb storage backend" (similar to the Storage Adapter spec).

---

## Part 3: Existing Bookmark Implementations on atproto

### 3.1 Bluesky Official: "Saved Posts"

**Launched**: September 2025  
**Lexicon**: `app.bsky.bookmark.*`  
**Privacy**: Private (off-protocol, stored in Stash)  
**Limitation**: Only supports saving `app.bsky.feed.post` records—cannot save arbitrary URLs

**API**:
```typescript
// Save a Bluesky post
await agent.api.app.bsky.bookmark.createBookmark({
  uri: "at://did:plc:user123/app.bsky.feed.post/post456",
  cid: "bafyreih..."
});

// Retrieve saved posts
const { data } = await agent.api.app.bsky.bookmark.getBookmarks();
```

### 3.2 Community Standard: `community.lexicon.bookmarks`

Several independent projects use a **community-agreed lexicon** for generic bookmarks:

**Lexicon**: `community.lexicon.bookmarks.bookmark`  
**Source**: [atcute/community.lexicon](https://github.com/mary-ext/atcute/blob/trunk/packages/definitions/lexicon-community/lexicons/community/lexicon/bookmarks/bookmark.json)

```json
{
  "lexicon": 1,
  "id": "community.lexicon.bookmarks.bookmark",
  "defs": {
    "main": {
      "type": "record",
      "description": "Record bookmarking a link to come back to later.",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject": { "type": "string", "format": "uri" },
          "tags": { "type": "array", "items": { "type": "string" } },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

**Key Difference**: `subject` can be **any URI**, not just atproto URIs.

**Apps Using This**:
- **Kipclip** - Raindrop-style bookmark manager
- **Sill** - Link aggregator/discovery tool

### 3.3 Frontpage: Decentralized Link Aggregator

**Project**: [frontpage.fyi](https://frontpage.fyi)  
**Lexicon**: `fyi.unravel.frontpage.*`  
**Model**: Reddit/HN-style link aggregation  
**Features**: Link submissions, voting, commenting (all on-protocol)

**Relevance**: Demonstrates that **social bookmarking at scale** works on atproto.

### 3.4 Key Takeaways

| Approach | Visibility | Storage | Target | Status |
|----------|-----------|---------|--------|--------|
| **Bluesky Bookmarks** | Private | Centralized (off-protocol) | Bluesky posts only | Production |
| **Community Lexicon** | Public | User PDS repo | Any URL | Community beta |
| **Frontpage** | Public | User PDS repo | Links + voting | Production |

**Gap**: No one offers **E2EE private bookmarks stored on PDS** for async sync.

---

## Part 4: Privacy-Preserving Social Features

### 4.1 The Hybrid Challenge

**Goal**: Support both public AND private bookmarks in the same app.

**Challenge**: Different storage, different sync mechanisms, different security models.

### 4.2 Technical Approaches

#### ~~Approach 1: Encrypted CRDTs (secsync)~~ REJECTED

**Library**: [secsync](https://github.com/nikgraf/secsync)  
**Mechanism**: Yjs (current Hypermark) + E2EE wrapper  

**Why rejected**:
- Beta software, last updated ~1 year ago
- Adds unnecessary complexity over simple blob encryption
- Public content requires separate unencrypted path
- Our simpler approach (encrypt Yjs state → push to Nostr) achieves the same goal with less code

#### Approach 2: Group Key Management (Matrix Megolm)

**Use Case**: Sharing bookmarks with specific people (future feature)  
**Mechanism**: Sender generates **Group Session Key**, ratchets for each message  
**How it works**:
- Key shared with participants via individual E2EE channels
- Different keys for different "rooms" (e.g., #work bookmarks shared with team)

**Tradeoff**: No forward secrecy if old keys shared with new members.

#### Approach 3: Selective Disclosure (SD-JWT)

**Use Case**: Share specific fields (e.g., title but not URL)  
**Mechanism**: Each field hashed with unique salt; reveal chosen salts  
**How it works**:
- Recipient verifies revealed fields against signed hash
- Hidden fields remain cryptographically protected

**Tradeoff**: Larger payload sizes due to hashes/salts per field.

#### Approach 4: Plausible Deniability (Decoy Databases)

**Use Case**: Hide that private bookmarks exist  
**Mechanism**: Two databases—one "safe" (decoy), one real (hidden)  
**How it works**:
- Different PINs derive different keys via HKDF
- Real database appears as random noise

**Tradeoff**: Risk of "PIN coercion" where absence of second PIN is suspicious.

### 4.3 Security Tradeoffs Summary

| Feature | Technical Solution | Tradeoff |
|---------|-------------------|----------|
| **Scalable Groups** | Megolm (Matrix) | No forward secrecy for new members |
| **Granular Sharing** | SD-JWT | Larger payloads |
| **Deniability** | Decoy DBs | PIN coercion risk |
| **Performance** | Encrypted CRDT Snapshots | Snapshot frequency vs. storage bloat |

---

## Part 5: The Dual-Purpose atproto Strategy

### 5.1 The Key Insight

**atproto PDS can serve TWO roles simultaneously**:

1. **Public Social Layer** → Discoverable bookmarks (unencrypted records in public repo)
2. **Private Storage Adapter** → Encrypted blob storage (via Private Stash or custom blobs)

This aligns perfectly with:
- Hypermark's existing **Storage Adapter Specification** (see `docs/plans/storage-adapter-spec.md`)
- Users' need for **asynchronous sync** without all devices online

### 5.2 Architecture: The Hybrid Model

```
┌─────────────────────────────────────────────────────────────┐
│                      User's Devices                         │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐     │
│  │   Phone     │    │   Laptop    │    │   Tablet    │     │
│  │  Hypermark  │◄──►│  Hypermark  │◄──►│  Hypermark  │     │
│  └──────┬──────┘    └──────┬──────┘    └─────────────┘     │
│         │                  │                                │
│         │    P2P WebRTC (E2EE private sync - realtime)     │
│         │                  │                                │
└─────────┼──────────────────┼────────────────────────────────┘
          │                  │
          │                  │ (Both paths active)
          │                  │
          ▼                  ▼
    ┌───────────────────────────────────────┐
    │         Personal Data Server          │
    │  (Bluesky-hosted OR self-hosted PDS)  │
    │                                       │
    │  ┌─────────────────────────────────┐ │
    │  │  Public Repo (atproto MST)      │ │
    │  │  - Public bookmarks (signed)    │ │
    │  │  - Follows, likes, shares       │ │
    │  │  - Discoverable on network      │ │
    │  └─────────────────────────────────┘ │
    │                                       │
    │  ┌─────────────────────────────────┐ │
    │  │  Private Stash / Blob Storage   │ │
    │  │  - Encrypted Yjs state blobs    │ │
    │  │  - ALL bookmarks (private copy) │ │
    │  │  - NOT synced to relay          │ │
    │  │  - Async sync fallback          │ │
    │  └─────────────────────────────────┘ │
    └───────────────────────────────────────┘
                    │
                    ▼ (public records only)
    ┌───────────────────────────────────────┐
    │              Relay/Firehose           │
    │         (Aggregates public data)      │
    └───────────────────────────────────────┘
                    │
                    ▼
    ┌───────────────────────────────────────┐
    │          Hypermark AppView            │
    │  - Global bookmark discovery          │
    │  - Tag trends, popular links          │
    │  - "People who saved X also saved Y"  │
    └───────────────────────────────────────┘
```

### 5.3 Two Sync Planes

| Plane | Technology | Data | Speed | Requirement |
|-------|------------|------|-------|-------------|
| **Private (Realtime)** | Yjs + WebRTC (current) | All bookmarks, E2EE | Instant | Both devices online |
| **Private (Async)** | atproto PDS blob storage | Encrypted Yjs state | Minutes | Internet connection |
| **Public (Social)** | atproto public repo | Published bookmarks only | Seconds | Internet connection |

### 5.4 Data Flow

```
User saves bookmark
        │
        ▼
┌───────────────────────────────────────┐
│  ALWAYS: Save to encrypted local     │
│  Yjs store (E2EE via LEK)             │
│  + IndexedDB persistence              │
└────────┬──────────────────────────────┘
         │
         ├──────────────────────────────► P2P WebRTC sync (if peers online)
         │
         ├──────────────────────────────► atproto PDS blob (encrypted, async)
         │
         ▼
    ┌────────────┐
    │ Publish?   │──── No ────► Done (stays private)
    └─────┬──────┘
          │ Yes
          ▼
┌────────────────────────────────────────┐
│ Publish to atproto public repo        │
│ (unencrypted, signed, discoverable)    │
└────────────────────────────────────────┘
```

### 5.5 Privacy Model

| Bookmark State | Local Store | P2P Sync | PDS Private | PDS Public | Relay/Firehose |
|----------------|-------------|----------|-------------|------------|----------------|
| **Private** | ✅ E2EE | ✅ E2EE | ✅ E2EE blob | ❌ | ❌ |
| **Public** | ✅ E2EE | ✅ E2EE | ✅ E2EE blob | ✅ Plaintext | ✅ Plaintext |

**Key Principle**: The local E2EE Yjs store is the **source of truth**. Everything else is derived/published.

---

## Part 5B: Revised Architecture — atproto Identity + Nostr Sync

> **Update (Dec 2025)**: After analysis, we've simplified the architecture. atproto serves as the **identity layer**, while **Nostr** provides encrypted async sync. This eliminates competing sync systems and provides a cleaner UX.

### 5B.1 The Core Simplification

| Layer | Technology | Purpose |
|-------|------------|---------|
| **Identity** | atproto (Bluesky login) | Links all your devices via single DID |
| **Private Sync** | Nostr relays | Encrypted async sync (store-and-forward) |
| **Public Social** | atproto public repo | Discoverable bookmarks, follows, social |
| **Local** | Yjs + IndexedDB | Source of truth, offline-first |

**Key insight**: Login with Bluesky = your devices are linked. No QR pairing needed.

### 5B.2 How Device Linking Works

```
┌─────────────────────────────────────────────────────────────────┐
│                    DEVICE LINKING VIA ATPROTO                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  FIRST DEVICE (Phone):                                          │
│  1. User taps "Login with Bluesky"                              │
│  2. OAuth completes → app has DID + session                     │
│  3. App checks preferences: LEK exists? → No (first device)     │
│  4. Generate LEK (256-bit AES key)                              │
│  5. Store LEK in atproto preferences (private, off-protocol)    │
│  6. Derive Nostr keypair from LEK                               │
│  7. Ready to use                                                │
│                                                                  │
│  SECOND DEVICE (Laptop):                                        │
│  1. User taps "Login with Bluesky" (same account)               │
│  2. OAuth completes → same DID                                  │
│  3. App checks preferences: LEK exists? → Yes!                  │
│  4. Retrieve LEK from preferences                               │
│  5. Derive same Nostr keypair                                   │
│  6. Pull from Nostr relays → decrypt → Yjs merge                │
│  7. All bookmarks appear                                        │
│                                                                  │
│  USER EXPERIENCE: Just login. That's it.                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5B.3 Data Flow Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                         DEVICES                                   │
│                                                                   │
│   Phone                              Laptop                       │
│   ┌──────────┐                      ┌──────────┐                 │
│   │  Yjs     │                      │  Yjs     │                 │
│   │  Doc     │                      │  Doc     │                 │
│   └────┬─────┘                      └────┬─────┘                 │
│        │     (same LEK = same Nostr keypair)                     │
└────────┼──────────────────────────────────┼──────────────────────┘
         │                                  │
         │         ALL BOOKMARKS            │
         │       (encrypted with LEK)       │
         ▼                                  ▼
┌─────────────────────────────────────────────────────────────────┐
│                    NOSTR RELAYS                                  │
│                   (transport only)                               │
│                                                                  │
│   Event: NIP-78 (kind 30078)                                    │
│   {                                                              │
│     pubkey: <derived from LEK>,                                 │
│     content: <base64 encrypted Yjs blob>,                       │
│     tags: [["d", "hypermark-sync"], ["v", "<version>"]],        │
│     sig: <signed with derived nsec>                             │
│   }                                                              │
│                                                                  │
│   Relays see: pubkey, timestamp, blob size                      │
│   Relays DON'T see: any bookmark data (encrypted)               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
         │
         │ (separate system - no direct connection)
         │
         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      USER'S PDS                                  │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Preferences (private, off-protocol)                     │   │
│   │  └── social.hypermark.syncKey: { key: <LEK base64> }    │   │
│   │  └── social.hypermark.settings: { relays: [...] }       │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │  Public Repo                                             │   │
│   │  └── social.hypermark.bookmark/* (public bookmarks)      │   │
│   └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (public bookmarks only)
┌─────────────────────────────────────────────────────────────────┐
│                    FIREHOSE → APPVIEW                            │
│                   (public bookmarks only)                        │
└─────────────────────────────────────────────────────────────────┘
```

### 5B.4 LEK Storage Security Model

**Where LEK is stored**: atproto preferences (`app.bsky.actor.putPreferences`)

**What preferences are**:
- Private, off-protocol storage on your PDS
- NOT in public repo, NOT on Firehose
- Accessed via authenticated XRPC calls only
- Already used by Bluesky for: muted words, content filters, saved feeds

**Who can access your LEK**:

| Actor | Can Access? | Notes |
|-------|-------------|-------|
| You (authenticated) | ✅ Yes | Via OAuth token |
| Other Bluesky users | ❌ No | Auth scoped to your account |
| Nostr relay operators | ❌ No | Completely separate system |
| Apps you authorize | ⚠️ Maybe | Depends on OAuth scopes |
| **Your PDS operator** | ✅ **Yes** | They store it |

**Trust implications**:

If you're on `bsky.social`, Bluesky *could* read your LEK. If they did, they could:
1. Extract LEK from your preferences
2. Derive your Nostr keypair
3. Connect to Nostr relays
4. Download and decrypt your sync blobs

**Why this is acceptable**:

| What you already trust Bluesky with | Our addition |
|-------------------------------------|--------------|
| Your password | LEK |
| Your DID signing keys | |
| Your mute lists | |
| Your content filter settings | |
| Your current private bookmarks (unencrypted) | |

Bluesky can already read your existing private bookmarks directly—they're stored unencrypted on their servers. Adding LEK doesn't meaningfully change your threat model.

**For higher security** (optional):

```
┌─────────────────────────────────────────────────────────────────┐
│ Settings → Security                                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Sync Key Protection                                            │
│                                                                  │
│  ○ Standard (recommended)                                       │
│    Your sync key is stored with your Bluesky account.           │
│    New devices sync automatically when you login.               │
│                                                                  │
│  ○ Password Protected                                           │
│    Your sync key is encrypted with a password you choose.       │
│    You'll need to enter this password on each new device.       │
│    ⚠️ If you forget this password, your private bookmarks       │
│       cannot be recovered.                                      │
│                                                                  │
│  ○ Self-Host PDS                                                │
│    For maximum security, self-host your PDS.                    │
│    You control all data, including your sync key.               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 5B.5 Why Nostr for Sync (Not atproto Blobs)

We considered using atproto PDS blob storage for private sync, but discovered issues:

| Issue | atproto Blobs | Nostr |
|-------|---------------|-------|
| **Blob lifecycle** | Must be referenced by a record or get garbage collected | Events persist indefinitely |
| **Firehose visibility** | Sync records would appear on Firehose (metadata leaked) | Completely separate network |
| **Realtime** | Polling only | Native WebSocket subscriptions |
| **Cost** | Tied to PDS hosting | Free public relays |
| **Decentralization** | Federated (your PDS) | Fully decentralized (multiple relays) |

**The hybrid approach**:
- **atproto** = Identity + public social features
- **Nostr** = Private encrypted sync transport

### 5B.6 User Journeys

#### Journey: Async Private Sync

```
TIME: 9:00 AM (Phone)
─────────────────────
1. Alice saves "https://example.com/article"
2. Bookmark added to Yjs doc
3. Yjs state encrypted with LEK
4. Nostr event pushed to relays
5. Phone closed

TIME: 2:00 PM (Laptop, Phone is off)
────────────────────────────────────
1. Alice opens Hypermark
2. App loads local Yjs from IndexedDB
3. Connects to Nostr relays
4. Pulls latest encrypted event
5. Decrypts with LEK
6. Yjs.applyUpdate() → bookmark appears!

Phone was never online. Pure async sync.
```

#### Journey: Publishing Public Bookmark

```
1. Alice views her private bookmark
2. Taps "Make Public" 🌐
3. App updates:
   
   LOCAL (Yjs):
   └── bookmark.isPublic = true
   └── Syncs to Nostr (encrypted, as always)
   
   ATPROTO (public repo):
   └── Creates social.hypermark.bookmark record
   └── Plaintext, on Firehose, discoverable

4. Alice's followers can now discover this bookmark
```

#### Journey: Social Discovery

```
1. Bob follows @alice.bsky.social
2. Bob opens Hypermark → "Discover" tab
3. Sees Alice's public bookmark
4. Taps [Save]
5. Bob's app:
   └── Creates bookmark in local Yjs
   └── isPublic: false (private by default)
   └── via: "at://alice.bsky.social/..."
   └── Syncs to Bob's Nostr relays (encrypted)

Alice's sync and Bob's sync are completely separate.
They share nothing except the public atproto layer.
```

### 5B.7 What We Cut

| Component | Status | Reason |
|-----------|--------|--------|
| **secsync** | ❌ REMOVED | Beta software, unnecessary complexity |
| **Field-level encryption** | ❌ REMOVED | Security theater; blob encryption sufficient |
| **QR device pairing** | ❌ REMOVED (as primary flow) | atproto login handles device linking |
| **WebRTC P2P sync** | 🟡 OPTIONAL | Nice for LAN, but Nostr handles async |

### 5B.8 What We Keep

| Component | Status | Role |
|-----------|--------|------|
| **Yjs** | ✅ KEEP | CRDT for conflict resolution |
| **y-indexeddb** | ✅ KEEP | Local persistence |
| **LEK** | ✅ KEEP | Encrypts Nostr sync blobs |
| **atproto OAuth** | ✅ KEEP | Identity layer, device linking |
| **atproto public repo** | ✅ KEEP | Public bookmarks, social features |
| **Nostr (NIP-78)** | ✅ NEW | Private encrypted sync transport |

---

## Part 6: atproto as a Storage Adapter

### 6.1 Mapping to Storage Adapter Spec

The existing [Storage Adapter Specification](storage-adapter-spec.md) defines a pluggable interface for external sync backends. atproto fits perfectly:

**File**: `src/services/storage/atproto-adapter.js`

```typescript
interface AtprotoAdapterConfig {
  /** User's atproto handle or DID */
  identifier: string
  
  /** PDS URL (default: bsky.social) */
  pdsUrl?: string
  
  /** OAuth credentials (managed by @atproto/oauth-client) */
  oauth: OAuthSession
}

class AtprotoAdapter implements StorageAdapter {
  readonly id = 'atproto'
  readonly name = 'AT Protocol (Bluesky)'
  readonly capabilities = {
    realtime: false,        // Polling-based (or webhooks if self-hosted)
    versioning: true,       // PDS can store multiple blobs
    maxBlobSize: 1024 * 1024,  // 1MB (PDS blob limit)
    requiresAuth: true,     // OAuth 2.0
    zeroConfig: false,      // Requires atproto account
  }
  
  async connect() {
    // OAuth login flow
    this.agent = new AtpAgent({ service: this.config.pdsUrl })
    await this.agent.resumeSession(this.config.oauth)
  }
  
  async push(blob: Uint8Array, metadata: SyncMetadata): Promise<PushResult> {
    // Upload encrypted Yjs state to PDS as blob
    const response = await this.agent.api.com.atproto.repo.uploadBlob(blob, {
      encoding: 'application/octet-stream'
    })
    
    // Create a record referencing the blob
    await this.agent.api.com.atproto.repo.createRecord({
      repo: this.agent.session.did,
      collection: 'social.hypermark.sync',
      record: {
        $type: 'social.hypermark.sync',
        blob: response.data.blob,  // CID reference
        version: metadata.version,
        deviceId: metadata.deviceId,
        timestamp: metadata.timestamp,
        size: metadata.size,
      }
    })
    
    return {
      success: true,
      version: metadata.version,
      timestamp: Date.now()
    }
  }
  
  async pull(): Promise<PullResult | null> {
    // Fetch latest sync record
    const { data } = await this.agent.api.com.atproto.repo.listRecords({
      repo: this.agent.session.did,
      collection: 'social.hypermark.sync',
      limit: 1,
      reverse: true  // Latest first
    })
    
    if (!data.records.length) return null
    
    const record = data.records[0]
    
    // Download blob
    const blobResponse = await fetch(record.value.blob.ref.$link)
    const blob = new Uint8Array(await blobResponse.arrayBuffer())
    
    return {
      blob,
      metadata: {
        version: record.value.version,
        deviceId: record.value.deviceId,
        timestamp: record.value.timestamp,
        size: record.value.size,
      }
    }
  }
}
```

### 6.2 Custom Lexicon: `social.hypermark.sync`

For storing encrypted sync blobs, we define a custom lexicon:

```json
{
  "lexicon": 1,
  "id": "social.hypermark.sync",
  "defs": {
    "main": {
      "type": "record",
      "description": "Encrypted Yjs state blob for private sync",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["blob", "version", "deviceId", "timestamp"],
        "properties": {
          "blob": {
            "type": "blob",
            "accept": ["application/octet-stream"],
            "maxSize": 1048576
          },
          "version": { "type": "string", "description": "Content hash" },
          "deviceId": { "type": "string" },
          "timestamp": { "type": "integer" },
          "size": { "type": "integer" }
        }
      }
    }
  }
}
```

**Privacy**: These records are **never synced to the Firehose**. They live only on the user's PDS.

### 6.3 Integration with Existing Hypermark

**Current Architecture** (from codebase analysis):
- ✅ Yjs CRDT for local state
- ✅ y-indexeddb for local persistence
- ✅ y-webrtc for P2P realtime sync
- ✅ LEK (Ledger Encryption Key) for E2EE
- ✅ Device pairing with ECDH key exchange

**New Additions for atproto**:
1. **atproto OAuth** - Login with Bluesky account
2. **AtprotoAdapter** - Implements StorageAdapter interface
3. **Sync Coordinator** - Orchestrates P2P + atproto sync
4. **Public Bookmark Service** - Publish/unpublish to atproto public repo

**No Breaking Changes**: Everything stacks on top of existing architecture.

### 6.4 Comparison: Storage Adapters for Private Sync

| Adapter | Cost | Setup | Realtime | Decentralized | Notes |
|---------|------|-------|----------|---------------|-------|
| **Nostr** ✅ | Free | Zero-config | ✅ Yes | ✅ Yes | **CHOSEN for private sync** |
| **atproto blobs** | Free | OAuth | ❌ Polling | ✅ Federated | Rejected: blobs GC'd without records, metadata on Firehose |
| **Cloudflare R2** | ~$0.015/GB | Deploy worker | ❌ Polling | ❌ Centralized | Backup option |
| **Google Drive** | Free (15GB) | OAuth | ❌ Polling | ❌ Centralized | Backup option |

**Our hybrid approach**:
- **Nostr** = Private encrypted sync (zero-knowledge relays)
- **atproto** = Identity + public social features (not used for private sync)

---

## Part 7: Social Features on atproto

### 7.1 Core Social Features (MVP)

| Feature | How It Works | Lexicon |
|---------|--------------|---------|
| **Follow** | Subscribe to users' public bookmarks | Standard `app.bsky.graph.follow` |
| **Discover Feed** | Chronological bookmarks from follows | AppView aggregation |
| **Via/Credit** | Attribute who you found a link from | `via` field in bookmark record |
| **Profile** | View someone's public bookmarks | Query `social.hypermark.bookmark` collection |
| **Like** | Favorite someone's bookmark | Standard `app.bsky.feed.like` |

### 7.2 Discovery Features (v2)

| Feature | Implementation |
|---------|----------------|
| **Trending Links** | AppView counts bookmarks per URL, ranks by recency |
| **Popular Tags** | AppView aggregates `tags` field across network |
| **Related Bookmarks** | "People who saved X also saved Y" algorithm |
| **Search** | Full-text search across public bookmarks |

### 7.3 Advanced Social (v3)

| Feature | Description |
|---------|-------------|
| **Collections** | Curated public lists (like Are.na channels) |
| **Shared Groups** | E2EE group bookmarks using Megolm-style keys |
| **Comments** | Discuss bookmarks (standard `app.bsky.feed.post` replies) |
| **Import Follows** | "Show me what my Twitter follows are bookmarking" |

### 7.4 Example User Flow: Discovery

1. **Alice** saves a link to a PostgreSQL article, marks it public
2. Record created: `at://alice.dev/social.hypermark.bookmark/abc123`
3. **Bob** follows Alice (`app.bsky.graph.follow`)
4. **Hypermark AppView** sees Alice's bookmark in Firehose
5. **Bob** opens Hypermark → "Recent from People You Follow" shows Alice's bookmark
6. **Bob** clicks "via @alice.dev" to give credit
7. **Bob** saves to his own bookmarks (optionally public)

### 7.5 Privacy Controls

**User Settings**:
- [ ] Default visibility: Private / Public
- [ ] Auto-publish tags: #public, #shared, etc.
- [ ] Bulk actions: "Make all #work bookmarks private"
- [ ] Export: "Download all my public bookmarks as HTML"

**UI Indicators**:
- 🔒 Private bookmark (local + PDS encrypted blob)
- 🌐 Public bookmark (local + PDS encrypted blob + public record)
- 👥 Shared group (future: E2EE with specific people)

---

## Part 8: What to Keep vs. Rebuild

### 8.1 From Current Hypermark: KEEP ✅

| Component | Reason | Reuse Level |
|-----------|--------|-------------|
| **Yjs CRDT Engine** | Perfect for offline-first, CRDT conflict resolution | 100% |
| **WebRTC P2P Sync** | Fast realtime sync when devices online | 100% |
| **Crypto Primitives** | `crypto.js` - ECDH, AES-GCM, HKDF already solid | 100% |
| **Pairing Flow** | WhatsApp-style device linking works great | 100% |
| **Bookmark Schema** | URL, title, description, tags - exactly right | 100% |
| **Preact + Vite** | Fast, lightweight, good DX | 100% |
| **MiniSearch** | Client-side search already fast | 100% |

### 8.2 From Current Hypermark: FIX ⚠️

| Issue | Current State | Fix |
|-------|---------------|-----|
| ~~**At-rest encryption gap**~~ | ~~Bookmark fields stored plaintext in Yjs~~ | ~~Encrypt values with LEK before `map.set()`~~ **REMOVED** - Blob-level encryption for Nostr sync is sufficient. Local IndexedDB relies on device encryption. |
| **Device-only identity** | No account-level identity | Add atproto DID as user identity layer |
| **No async sync** | Requires all devices online | Add **Nostr relays** as encrypted sync transport (not atproto blobs) |

### 8.3 New Components: BUILD 🔨

| Component | Purpose | Complexity |
|-----------|---------|------------|
| **atproto OAuth** | Login with Bluesky account | Medium (use `@atproto/oauth-client-browser`) |
| **AtprotoAdapter** | Implement StorageAdapter interface | Medium |
| **Identity Bridge** | Link devices to single atproto DID | Low (store DID in Yjs `settings` map) |
| **Publish Service** | Selective publish from local → atproto | Medium |
| **AppView** | Aggregate public bookmarks for discovery | High (backend service) |
| **Social Features** | Follow, like, "via" attribution | Medium |

### 8.4 Effort Estimate

| Phase | Components | Effort | Dependencies |
|-------|-----------|--------|--------------|
| **Phase 1: Foundation** | OAuth, AtprotoAdapter, fix at-rest encryption | 2-3 weeks | None |
| **Phase 2: Async Sync** | StorageManager integration, blob push/pull | 2 weeks | Phase 1 |
| **Phase 3: Public Bookmarks** | Publish/unpublish, bookmark lexicon | 2 weeks | Phase 1 |
| **Phase 4: Social Core** | Follow, profile, "via", discovery feed | 3-4 weeks | Phase 3 |
| **Phase 5: AppView** | Backend aggregation, search, trends | 3-4 weeks | Phase 3 |
| **Phase 6: Polish** | Import/export, browser extension, mobile PWA | 3 weeks | Any time |

**Total**: ~15-18 weeks for full social+private hybrid

**MVP (Phases 1-3)**: ~6-7 weeks for async sync + optional public sharing

---

## Part 9: Implementation Plan

### Phase 1: Foundation (Weeks 1-3)

**Goals**:
- Add atproto OAuth (identity layer)
- Implement LEK storage in preferences
- Set up Nostr sync infrastructure

**Tasks**:
- [ ] Add `@atproto/oauth-client-browser` dependency
- [ ] Create OAuth login flow component
- [ ] Implement LEK generation on first login
- [ ] Store LEK in atproto preferences (`social.hypermark.syncKey`)
- [ ] Retrieve LEK on subsequent device logins
- [ ] Derive Nostr keypair from LEK via HKDF
- [ ] Add `nostr-tools` dependency for Nostr event handling
- [ ] Define `social.hypermark.bookmark` lexicon (public bookmarks)
- [ ] (Optional) Add password-protected LEK option in settings

**Acceptance Criteria**:
- [ ] Can login with Bluesky account
- [ ] LEK generated on first device, retrieved on second device
- [ ] Same Nostr keypair derived on both devices
- [ ] Preferences survive account migration

### Phase 2: Async Sync via Nostr (Weeks 4-5)

**Goals**:
- Implement Nostr as encrypted sync transport
- Enable async sync without WebRTC

**Tasks**:
- [ ] Implement `NostrSyncAdapter` class
  - Connect to configured relays (default: damus.io, nos.lol, relay.nostr.band)
  - Subscribe to events from derived pubkey
  - Publish encrypted Yjs state as NIP-78 events
- [ ] Implement Yjs state encryption/decryption with LEK
- [ ] Implement debounced sync on Yjs document changes
- [ ] Implement pull-on-startup to fetch latest state
- [ ] Handle Yjs CRDT merge for conflict resolution
- [ ] Add relay configuration UI in settings
- [ ] Add sync status indicator (connected/syncing/synced)

**Acceptance Criteria**:
- [ ] Save bookmark on Phone → close app → open on Laptop → bookmark appears (without Phone online)
- [ ] Encrypted blob on Nostr relays is unreadable without LEK
- [ ] Conflict resolution works (Yjs CRDT merge)
- [ ] Works with at least 2 public Nostr relays

### Phase 3: Public Bookmarks (Weeks 6-7)

**Goals**:
- Selective publishing to atproto public repo
- Basic profile view

**Tasks**:
- [ ] Add "Make Public" button to bookmark UI
- [ ] Implement `publishBookmark()` - creates public record
- [ ] Implement `unpublishBookmark()` - deletes public record
- [ ] Add visibility indicator (🔒 vs 🌐) to UI
- [ ] Create profile page: `/profile/@alice.dev`
- [ ] Query `social.hypermark.bookmark` collection for user
- [ ] Display public bookmarks on profile

**Acceptance Criteria**:
- [ ] Can publish a bookmark → appears at `at://alice.dev/social.hypermark.bookmark/xyz`
- [ ] Can unpublish → record deleted, stays in local store
- [ ] Profile page shows only public bookmarks

### Phase 4: Social Core (Weeks 8-11)

**Goals**:
- Follow system
- Discovery feed
- Attribution

**Tasks**:
- [ ] Implement follow via `app.bsky.graph.follow`
- [ ] Subscribe to Jetstream (filtered Firehose)
- [ ] Filter for `social.hypermark.bookmark` records from follows
- [ ] Build "Recent from Follows" feed
- [ ] Add "via @user" when saving from someone's profile
- [ ] Implement like via `app.bsky.feed.like`
- [ ] Add "Following" tab to sidebar

**Acceptance Criteria**:
- [ ] Follow someone → their public bookmarks appear in feed
- [ ] "via @alice" shows who you found link from
- [ ] Unfollow → their bookmarks disappear

### Phase 5: AppView & Discovery (Weeks 12-15)

**Goals**:
- Backend aggregation
- Search and trends

**Tasks**:
- [ ] Build simple AppView (Node.js + SQLite)
- [ ] Subscribe to full Jetstream
- [ ] Index all `social.hypermark.bookmark` records
- [ ] Implement trending algorithm (count by URL, decay by time)
- [ ] Build tag aggregation ("Popular in #design")
- [ ] Add full-text search endpoint
- [ ] Create "Discover" tab in UI

**Acceptance Criteria**:
- [ ] "Trending" shows most-bookmarked links this week
- [ ] Search works across all public bookmarks
- [ ] "Popular in #design" shows top tags

### Phase 6: Polish (Weeks 16-18)

**Goals**:
- Import/export
- Browser extension
- Mobile optimization

**Tasks**:
- [ ] Import from Raindrop.io, Pinboard, Pocket (CSV/JSON)
- [ ] Export to HTML, JSON
- [ ] Build browser extension (save current tab)
- [ ] Add keyboard shortcuts
- [ ] Optimize mobile PWA (install prompt, offline)
- [ ] Add service worker for offline support

---

## Part 10: Self-Hosting & Costs

### 10.1 User Tiers

| Tier | Setup | Monthly Cost | Features |
|------|-------|--------------|----------|
| **Free (Local Only)** | Install PWA | $0 | Private bookmarks, device sync (P2P) |
| **Free (Bluesky Cloud)** | Connect Bluesky account | $0 | + Async sync, optional public sharing |
| **Self-Hosted PDS** | Deploy PDS on VPS | ~$5 | Full data sovereignty |

### 10.2 Running Hypermark Service

| Component | Hosting | Monthly Cost |
|-----------|---------|--------------|
| **PWA (static site)** | Cloudflare Pages / Vercel | Free |
| **Signaling Server** (for WebRTC) | Fly.io / Railway | ~$5 |
| **AppView** (optional) | Fly.io + SQLite | ~$10 |
| **Total** | | **~$15/month** |

### 10.3 Self-Hosted PDS Setup

**Requirements**:
- Ubuntu/Debian VPS (512MB RAM, 10GB storage)
- Domain name (e.g., `pds.alice.com`)
- DNS A record pointing to VPS

**Installation**:
```bash
# Official PDS installer
curl -fsSL https://github.com/bluesky-social/pds/installer.sh | bash

# Configure domain
pds configure --hostname pds.alice.com --admin-email alice@example.com

# Start
pds start
```

**Migration from Bluesky-hosted**:
1. Update DID document to point to new PDS
2. Export repo from `bsky.social`
3. Import to self-hosted PDS
4. All followers/data migrate automatically

---

## Part 11: Competitive Positioning

### 11.1 Market Position

```
                    SOCIAL/DISCOVERY
                          ▲
                          │
          Are.na    ●     │     ● Raindrop.io
                          │
                          │
    ─────────────────────●─────────────────────►
    PRIVATE              Hypermark Social        PUBLIC
                          │    (proposed)
                          │
          Hypermark ●     │     ● Bluesky Saves
          (current)       │
                          │
                          ▼
                    LOCAL/PRIVATE
```

**Unique Position**: The only tool in the **center** with:
- ✅ E2EE private bookmarks
- ✅ Federated public sharing
- ✅ Local-first performance
- ✅ Self-hostable
- ✅ Social discovery

### 11.2 Differentiation

| Feature | Hypermark Social | Raindrop.io | Linkwarden | Bluesky Saves |
|---------|------------------|-------------|------------|---------------|
| **E2EE Private** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Public Social** | ✅ Yes | ❌ No | ❌ No | ⚠️ Posts only |
| **Async Sync** | ✅ Yes (atproto) | ✅ Yes | ❌ Self-host only | ✅ Yes |
| **Local-First** | ✅ Yes | ❌ No | ✅ Yes | ❌ No |
| **Self-Hostable** | ✅ Yes (PDS) | ❌ No | ✅ Yes | ✅ Yes (PDS) |
| **Arbitrary URLs** | ✅ Yes | ✅ Yes | ✅ Yes | ❌ Posts only |
| **Cost** | Free | $28/yr | Free | Free |

**Key Advantage**: We're the **only tool** that combines local-first E2EE with federated social features.

---

## Part 12: Open Questions & Decisions

### 12.1 Lexicon Namespace

**Question**: Use `social.hypermark.*` (branded) or `community.lexicon.bookmarks.*` (interoperable)?

**Options**:
1. **social.hypermark.*** - Full control, custom fields (e.g., `readLater`, `favicon`)
2. **community.lexicon.*** - Interoperable with Kipclip, Sill, etc.
3. **Both** - Read from community lexicon, write to both

**Recommendation**: **Option 3** - Support both for maximum compatibility while enabling custom features.

### 12.2 AppView Hosting

**Question**: Build our own AppView or rely on existing aggregators?

**Options**:
1. **Self-hosted AppView** - Full control, custom algorithms
2. **Use existing Bluesky AppView** - Zero setup, limited to standard feeds
3. **Hybrid** - Start with #2, migrate to #1 as we grow

**Recommendation**: **Option 3** - Start simple, add custom AppView when features require it (e.g., trending tags).

### 12.3 Archiving/Snapshots

**Question**: Build snapshot feature or integrate with existing services?

**Options**:
1. **Build in-app** - Full control, like Linkwarden
2. **Archive.org integration** - Link to Wayback Machine
3. **Defer to v3** - Not critical for MVP

**Recommendation**: **Option 2 for MVP** - "Save to Archive.org" button. Build full archiving in v3.

### 12.4 Mobile Apps

**Question**: PWA-only or native apps?

**Options**:
1. **PWA-first** - Single codebase, works everywhere
2. **Native apps** - Better iOS integration (share sheet, etc.)
3. **Both** - PWA for MVP, native later

**Recommendation**: **Option 3** - PWA is sufficient for launch. Evaluate native if PWA limitations become painful.

### 12.5 ~~At-Rest Encryption Approach~~ DECIDED

**Decision**: **Blob-level encryption only** (for Nostr sync)

**What we considered**:
1. ~~Per-field encryption~~ - Rejected. Security theater for local storage.
2. ~~Whole-doc encryption for IndexedDB~~ - Rejected. Rely on device encryption.
3. **Blob encryption for Nostr** - ✅ Accepted. Encrypt entire Yjs state before pushing to relays.

**Rationale**:
- Local IndexedDB is sandboxed per-origin; if attacker has IndexedDB access, they likely have device access
- Field-level encryption adds complexity for marginal security benefit
- Nostr sync blobs ARE encrypted with LEK (this is where encryption matters)
- Rely on OS-level encryption (FileVault, BitLocker, Android encryption) for at-rest protection

### 12.6 LEK Security Model

**Question**: How secure is storing LEK in atproto preferences?

**Decision**: **Accept PDS trust model** with optional password protection

**Security properties**:
| Actor | Can Access LEK? | Can Read Private Bookmarks? |
|-------|-----------------|----------------------------|
| Random attackers | ❌ No | ❌ No |
| Nostr relay operators | ❌ No | ❌ No (encrypted blobs) |
| Other Bluesky users | ❌ No | ❌ No |
| Your PDS operator | ✅ Yes | ✅ Yes (if they steal LEK + fetch from Nostr) |

**Why acceptable**: You already trust your PDS with your identity, keys, and existing private data. This doesn't meaningfully expand the trust boundary.

**For paranoid users**: Offer optional password-protected LEK (encrypted before storing in preferences). Trade-off: must enter password on each new device.

---

## Part 13: Risks & Mitigations

### 13.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **atproto breaking changes** | Medium | High | Pin to stable versions, monitor changelog |
| **PDS blob size limits** | Low | Medium | Compress Yjs state (pako), chunk if needed |
| **Yjs ↔ atproto sync conflicts** | Low | High | Yjs CRDT handles merges, test extensively |
| **OAuth complexity** | Medium | Medium | Use official `@atproto/oauth-client-browser` |

### 13.2 Product Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Users don't want social features** | Low | Medium | Make social opt-in, work great without it |
| **Privacy concerns with atproto** | Medium | High | Clear docs: private stays E2EE, public is public |
| **Confusing UX (too many sync options)** | Medium | Medium | Smart defaults, hide complexity |
| **AppView hosting costs** | Medium | Low | Start with simple aggregation, scale later |

### 13.3 Ecosystem Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| **Bluesky pivots away from atproto** | Low | High | Federation ensures portability |
| **Lack of atproto adoption** | Low | Medium | Works great as just storage adapter |
| **Competing bookmark apps on atproto** | Medium | Low | Differentiate with E2EE + local-first |

---

## Part 14: Success Metrics

### 14.1 MVP Launch (Phases 1-3)

**Metrics**:
- [ ] 100 users connect atproto accounts
- [ ] 50% of those enable async sync
- [ ] 10% publish at least one public bookmark
- [ ] Average 100+ bookmarks synced per user
- [ ] <1% error rate on sync operations

### 14.2 Social Features (Phases 4-5)

**Metrics**:
- [ ] 1,000 public bookmarks on network
- [ ] 50 users follow at least one person
- [ ] 20% engagement rate (like/reshare public bookmarks)
- [ ] 10+ active users per day on "Discover" tab

### 14.3 Long-Term (Year 1)

**Metrics**:
- [ ] 10,000+ total users
- [ ] 50,000+ public bookmarks indexed
- [ ] 100+ active daily users
- [ ] <$50/month infrastructure costs
- [ ] 5+ community-contributed features/PRs

---

## Part 15: Conclusion & Recommendation

### 15.1 Why This Works

1. **Market Timing** — Pocket dead, Pinboard dying, users actively seeking alternatives
2. **Tech Maturity** — atproto private data support landed, OAuth libraries stable
3. **Existing Foundation** — 70% of code (Yjs, crypto, P2P) already works
4. **Low Cost** — Entire service runs for <$20/month
5. **Differentiated** — No one else offers E2EE + federated social + async sync
6. **Aligned Incentives** — Users want data ownership, atproto provides portability

### 15.2 The Unique Value Proposition

**"The only bookmark manager with:**
- **Bank-vault privacy** for your private reading
- **Social discovery** for what you want to share
- **Always-on sync** even when your devices are off
- **Total ownership** of your data (self-host anytime)"

### 15.3 Strategic Advantages

| Advantage | Why It Matters |
|-----------|----------------|
| **First mover on atproto bookmarks** | Establish `social.hypermark.*` as standard |
| **Dual-purpose PDS** | Only app using atproto for BOTH social AND storage |
| **Privacy-first social** | Appeals to privacy-conscious AND social users |
| **Self-hosting friendly** | Appeals to /r/selfhosted community |
| **Free tier viable** | Bluesky-hosted PDS = zero infrastructure cost |

### 15.4 What We're NOT Doing (Focus)

**Explicitly out of scope for MVP**:
- ❌ Native mobile apps (PWA sufficient)
- ❌ Archiving/snapshots (link to Archive.org)
- ❌ AI features (semantic search, auto-tagging)
- ❌ Shared E2EE groups (complex, defer to v3)
- ❌ Browser extension (Phase 6)

**Focus areas**:
- ✅ Rock-solid E2EE private bookmarks
- ✅ Async sync that "just works"
- ✅ Delightful public sharing UX
- ✅ Fast, local-first performance

### 15.5 Final Recommendation

**Build it.** The current Hypermark codebase is a solid foundation. We're not starting over—we're **adding a social publication layer and async sync** on top of an already-working local-first engine.

**Revised Architecture Summary**:
- **atproto** = Identity layer (login, device linking, public social)
- **Nostr** = Private sync transport (encrypted, decentralized)
- **Yjs** = Local source of truth (CRDT, offline-first)

**Proposed Approach**:
1. **Short-term (MVP)**: Phases 1-3 (6-7 weeks)
   - Add atproto OAuth (identity layer)
   - Implement Nostr sync (encrypted async sync)
   - Enable optional public sharing
   
2. **Medium-term**: Phases 4-5 (8 weeks)
   - Social features (follow, discover)
   - Simple AppView
   
3. **Long-term**: Phase 6+ (ongoing)
   - Browser extension
   - Import/export
   - Archiving
   - Advanced social (groups, collections)

**Next Steps**:
1. Create detailed technical design doc for Phase 1
2. Set up atproto OAuth sandbox environment
3. Implement Nostr sync adapter POC
4. Test LEK storage/retrieval from atproto preferences
5. Test encrypted Yjs blob push/pull to Nostr relays
6. Get user feedback on MVP mockups

---

## Appendix A: References

### Research Sources

**Social Bookmarking**:
- [Mozilla Support: Future of Pocket (July 2025)](https://support.mozilla.org/en-US/kb/future-of-pocket)
- [TechCrunch: Mozilla shutting down Pocket (May 2025)](https://techcrunch.com/2025/05/22/mozilla-is-shutting-down-read-it-later-app-pocket/)
- [HN: Categorize and summarize bookmarks (Feb 2025)](https://news.ycombinator.com/item?id=43056948)

**AT Protocol**:
- [atproto Documentation](https://atproto.com/docs)
- [GitHub: atproto Private Data (PR #4163)](https://github.com/bluesky-social/atproto/pull/4163)
- [Bluesky Engineering Blog](https://blueskyweb.xyz/blog)
- [atcute: Community Lexicons](https://github.com/mary-ext/atcute)

**Privacy & Encryption**:
- [secsync: Encrypted CRDTs](https://github.com/nikgraf/secsync)
- [Matrix Megolm Specification](https://spec.matrix.org/latest/client-server-api/#megolm)
- [Germ Network: E2EE on atproto](https://www.germnetwork.com/)
- [SD-JWT Specification](https://datatracker.ietf.org/doc/html/draft-ietf-oauth-selective-disclosure-jwt-17)

**Community Projects**:
- [Kipclip](https://github.com/tijs/kipclip-appview)
- [Sill.social](https://github.com/TylerFisher/sill)
- [Frontpage.fyi](https://github.com/likeandscribe/frontpage)

### Technical Specifications

- [Yjs Documentation](https://docs.yjs.dev/)
- [WebRTC Security (RFC 8827)](https://www.rfc-editor.org/rfc/rfc8827.html)
- [HKDF (RFC 5869)](https://www.rfc-editor.org/rfc/rfc5869)
- [AES-GCM (NIST SP 800-38D)](https://csrc.nist.gov/publications/detail/sp/800-38d/final)

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **AppView** | Backend service that aggregates and indexes atproto records for discovery |
| **CRDT** | Conflict-free Replicated Data Type - enables offline-first sync |
| **DID** | Decentralized Identifier - permanent cryptographic identity |
| **E2EE** | End-to-End Encryption - only endpoints can decrypt |
| **Firehose** | Real-time stream of all public events on atproto network |
| **Jetstream** | Filtered, lightweight version of Firehose |
| **LEK** | Ledger Encryption Key - shared symmetric key for bookmark encryption. Stored in atproto preferences, used to encrypt Nostr sync blobs. |
| **Lexicon** | Schema definition language for atproto records |
| **MLS** | Messaging Layer Security - E2EE protocol for groups |
| **MST** | Merkle Search Tree - data structure for atproto repos |
| **NIP-78** | Nostr Implementation Possibility for application-specific data. Used for encrypted sync blobs. |
| **Nostr** | Notes and Other Stuff Transmitted by Relays - decentralized protocol used for private encrypted sync |
| **npub/nsec** | Nostr public/secret key in bech32 format. Derived from LEK for sync identity. |
| **NSID** | Namespaced ID - unique identifier for lexicons (e.g., `social.hypermark.bookmark`) |
| **PDS** | Personal Data Server - stores user's atproto account and data |
| **Preferences** | Private off-protocol storage on PDS. Used to store LEK across devices. |
| **Relay (atproto)** | Server that aggregates data from many PDSes |
| **Relay (Nostr)** | Server that stores and forwards Nostr events. Sees only encrypted blobs. |
| **Stash** | Private storage area on PDS (not synced to network) - NOT production ready as of late 2025 |
| **WebRTC** | Peer-to-peer communication protocol for browser |
| **Yjs** | CRDT library used by Hypermark for state management |

---

**Document Status**: Research complete, architecture finalized, ready for design phase  
**Architecture**: atproto (identity + social) + Nostr (private sync) + Yjs (local CRDT)  
**Next Action**: Create Phase 1 technical design document  
**Owner**: TBD  
**Last Updated**: December 31, 2025

---

## Appendix C: Architecture Decision Log

| Decision | Date | Choice | Rationale |
|----------|------|--------|-----------|
| Private sync transport | Dec 31, 2025 | **Nostr** over atproto blobs | atproto blobs get GC'd without records; record metadata would hit Firehose |
| LEK storage | Dec 31, 2025 | **atproto preferences** | Enables seamless multi-device via Bluesky login; same trust model as rest of atproto |
| Field-level encryption | Dec 31, 2025 | **Rejected** | Security theater; blob encryption for Nostr is sufficient |
| secsync | Dec 31, 2025 | **Rejected** | Beta software, unnecessary complexity |
| Device pairing | Dec 31, 2025 | **atproto login** (primary) | Login with same Bluesky account = devices linked; QR pairing demoted to optional |
| LEK security | Dec 31, 2025 | **Standard + optional password** | Default: trust PDS (same as rest of atproto); Option: password-protected for paranoid users |
