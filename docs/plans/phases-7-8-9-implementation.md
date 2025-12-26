# Hypermark Phases 7-9: Error Handling, Polish & Testing, PWA Features

**Date:** 2025-12-26
**Status:** Ready for Implementation
**Based on:** 2025-12-26-hypermark-implementation-design.md

---

## Overview

This document details the implementation plan for the final three phases of Hypermark MVP:

- **Phase 7: Error Handling** - Comprehensive error recovery, timeout handling, storage monitoring, and security edge cases
- **Phase 8: Polish & Testing** - Loading states, empty states, offline indicators, and comprehensive testing
- **Phase 9: PWA Features** - Service worker, manifest, install prompt, and offline functionality

All phases include detailed task breakdowns with specific code examples, testing scenarios, and acceptance criteria referenced from the main design document.

---

## Phase 7: Error Handling

**Epic ID:** `hypermark-6gt`
**Priority:** P0
**Depends on:** Phase 5 (Sync Protocol)
**Blocks:** Phase 8 (Polish & Testing)

### Overview

Implement robust error handling and edge case management across all system components. This phase ensures graceful degradation, clear user feedback, and recovery from network, storage, and security failures.

### Tasks

#### 7.1: Network Error Recovery (`hypermark-8wv`)
**Priority:** P0

Implement comprehensive network error handling for pairing and sync operations with automatic retry mechanisms.

**Key Features:**
- Connection drop handling (before/after verification, during LEK transfer)
- Exponential backoff retry logic (up to 30s max)
- Auto-retry for sync (5s intervals for 1 minute)
- Auto-reconnect when network returns
- Clear UI status indicators

**Implementation Highlights:**
```javascript
class SyncErrorHandler {
  async retryWithBackoff(operation, context) {
    const backoff = Math.min(1000 * Math.pow(2, this.retryCount), 30000)
    await new Promise(resolve => setTimeout(resolve, backoff))
    return operation(context)
  }
}
```

**UI Indicators:**
"Syncing..." → "Connection lost" → "Reconnecting..." → "Synced"

**References:** Lines 694-725 (Network failure handling)

---

#### 7.2: Pairing Timeout Handling (`hypermark-7g6`)
**Priority:** P0

Implement pairing session timeout mechanism to prevent stale pairing sessions and ensure proper cleanup of ephemeral keys.

**Key Features:**
- 5-minute pairing session expiry
- Countdown timer in QR display
- Automatic ephemeral key cleanup
- "Start New Pairing" recovery option

**Implementation Highlights:**
```javascript
class PairingSession {
  constructor(sessionId, ephemeralKeypair) {
    this.expiresAt = Date.now() + 300000  // 5 min
    this.timeoutHandle = setTimeout(() => this.expire(), 300000)
  }
}
```

**QR Display:**
Shows countdown: "Expires in 4:32"

**References:** Lines 708-710 (Pairing timeout specification)

---

#### 7.3: Storage Quota Monitoring (`hypermark-t6v`)
**Priority:** P0

Implement storage quota monitoring to warn users before reaching capacity limits, especially critical for iOS Safari PWA with ~50MB limits.

**Key Features:**
- Monitor via `navigator.storage.estimate()`
- Warn at 80% capacity, critical at 95%
- Delete old bookmarks option (>1 year)
- Export and clear functionality
- Check every 60 seconds

**Implementation Highlights:**
```javascript
class StorageMonitor {
  async checkQuota() {
    const estimate = await navigator.storage.estimate()
    const percentUsed = (estimate.usage / estimate.quota) * 100

    if (percentUsed >= 80) {
      return { level: 'warning', message: '...' }
    }
  }
}
```

**References:** Lines 773-781 (Storage quota monitoring), Lines 768-772 (iOS limits)

---

#### 7.4: WebCrypto Unavailable Handling (`hypermark-0z3`)
**Priority:** P0

Implement graceful error handling when WebCrypto API is unavailable, blocking app initialization with clear user guidance.

**Key Features:**
- Check `window.crypto?.subtle` availability
- Block app initialization if unavailable
- Show browser recommendations (Chrome, Firefox, Safari, Edge)
- Secure context (HTTPS) enforcement

**Implementation Highlights:**
```javascript
export function checkWebCryptoSupport() {
  const checks = {
    crypto: typeof window.crypto !== 'undefined',
    subtle: typeof window.crypto?.subtle !== 'undefined'
  }
  return { isSupported: checks.crypto && checks.subtle }
}
```

**Error UI:**
Displays recommended browsers with versions and download links

**References:** Lines 783-791 (WebCrypto unavailable handling)

---

#### 7.5: Camera Permission Fallback (`hypermark-7d8`)
**Priority:** P0

Implement graceful fallback to manual pairing when camera access is denied or unavailable.

**Key Features:**
- Request camera permission for QR scanning
- Detect `NotAllowedError` (permission denied)
- Auto-switch to manual pairing
- Short code input (HYPER-xxx-xxx)
- Full JSON payload paste option
- "Try Camera Again" retry option

**Implementation Highlights:**
```javascript
export function useCamera() {
  const requestCamera = async () => {
    try {
      return await navigator.mediaDevices.getUserMedia({ video: true })
    } catch (err) {
      if (err.name === 'NotAllowedError') {
        setError({ type: 'permission-denied' })
      }
    }
  }
}
```

**Manual Pairing Options:**
1. Short code: `HYPER-abc123-def456`
2. Full JSON payload paste

**References:** Lines 793-804 (Camera permission handling), Lines 633-662 (Manual pairing)

---

#### 7.6: Rate Limiting for Pairing (`hypermark-6ps`)
**Priority:** P0

Implement rate limiting to prevent brute force pairing attempts and protect against malicious scanning.

**Key Features:**
- Maximum 3 failed attempts per 5 minutes
- Track attempts in localStorage
- Countdown timer when rate limited
- Clear security explanation in UI
- Successful pairing clears history

**Implementation Highlights:**
```javascript
export class PairingRateLimiter {
  constructor() {
    this.maxAttempts = 3
    this.windowMs = 300000  // 5 minutes
  }

  recordFailedAttempt() {
    const attempts = this.getAttempts()
    attempts.push(Date.now())
    return { isRateLimited: attempts.length >= this.maxAttempts }
  }
}
```

**Rate Limited UI:**
Shows countdown timer: "4:15 remaining"

**References:** Lines 885-901 (Rate limiting specification)

---

### Phase 7 Summary

| Task | ID | Priority | Complexity |
|------|-----|----------|-----------|
| Network error recovery | hypermark-8wv | P0 | Medium |
| Pairing timeout | hypermark-7g6 | P0 | Low |
| Storage monitoring | hypermark-t6v | P0 | Medium |
| WebCrypto check | hypermark-0z3 | P0 | Low |
| Camera fallback | hypermark-7d8 | P0 | Medium |
| Rate limiting | hypermark-6ps | P0 | Medium |

**Total Tasks:** 6
**Estimated Effort:** 3-4 days

---

## Phase 8: Polish & Testing

**Epic ID:** `hypermark-vsm`
**Priority:** P0
**Depends on:** Phase 7 (Error Handling)
**Blocks:** Phase 9 (PWA Features)

### Overview

Polish the user experience with loading states, empty states, offline indicators, and conduct comprehensive testing across devices, performance scenarios, and security requirements.

### Tasks

#### 8.1: Loading States and Progress Indicators (`hypermark-9m3`)
**Priority:** P0

Implement loading states and progress indicators for all async operations to provide clear user feedback.

**Key Features:**
- App initialization with progress (0-100%)
- Bookmark list skeleton loaders
- Search debouncing with spinner
- Sync progress with commit counts
- Large import progress indicators
- Button loading states

**Implementation Highlights:**
```javascript
// Sync progress
export function usePeerSync() {
  const [syncState, setSyncState] = useState({
    status: 'disconnected',
    progress: 0,
    syncedCommits: 0,
    totalCommits: 0
  })

  // Update progress during sync
  setSyncState({ progress: Math.floor((synced / total) * 100) })
}
```

**UI Components:**
- `<LoadingState>` - Generic spinner with message
- `<BookmarkSkeleton>` - List loading placeholder
- `<SyncProgress>` - Banner with progress bar

**References:** Lines 1036-1076 (Performance edge cases)

---

#### 8.2: Empty States and Onboarding (`hypermark-hr7`)
**Priority:** P0

Create welcoming empty states and onboarding guidance for new users.

**Key Features:**
- First-run onboarding (3 steps)
- Empty bookmarks state with CTA
- Empty search results with suggestions
- Empty devices list with pairing CTA
- Onboarding persists to localStorage

**Implementation Highlights:**
```javascript
export function EmptyBookmarksState() {
  return (
    <div class="empty-state">
      <h2>Welcome to Hypermark!</h2>
      <p>Start by adding your first bookmark.</p>
      <Button onClick={openAddForm}>Add Bookmark</Button>
    </div>
  )
}
```

**Onboarding Flow:**
1. "Your Secure Bookmark Vault" 🔒
2. "Pair Devices with QR Codes" 📱
3. "Works Offline" 📡

**References:** Lines 852-886 (Onboarding), Lines 998-1009 (Empty states)

---

#### 8.3: Offline Indicator (`hypermark-dzu`)
**Priority:** P0

Implement offline indicator showing app connectivity and sync status.

**Key Features:**
- Detect online/offline state
- Show "Offline - Changes saved locally" banner
- Connection status badge (green/yellow/gray)
- Clickable to show device list
- Real-time status updates

**Implementation Highlights:**
```javascript
export function useOnlineStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    window.addEventListener('online', () => setIsOnline(true))
    window.addEventListener('offline', () => setIsOnline(false))
  }, [])
}
```

**Status Colors:**
- Green: Connected to peers
- Yellow: Connecting
- Gray: Offline

**References:** Lines 758-772 (iOS background throttling)

---

#### 8.4: Performance Testing with 1000+ Bookmarks (`hypermark-zx1`)
**Priority:** P0

Test and verify performance with 1000+ bookmarks meets targets.

**Performance Targets:**
- App cold start: <1s to usable list
- Local operations: <50ms (add/tag/search)
- Sync handshake: <2s for connection
- Bundle size: <150KB compressed
- Storage: Support 1000+ bookmarks (~5MB)

**Test Suite:**
```javascript
describe('Performance Benchmarks', () => {
  test('Cold start to usable list <1s', async () => {
    const start = performance.now()
    await initializeApp()
    expect(performance.now() - start).toBeLessThan(1000)
  })

  test('Add bookmark <50ms', async () => {
    const start = performance.now()
    await db.put(bookmark)
    expect(performance.now() - start).toBeLessThan(50)
  })
})
```

**Testing Checklist:**
- [ ] Generate 1000 test bookmarks
- [ ] Measure cold start time
- [ ] Measure local operations
- [ ] Test virtual scrolling efficiency
- [ ] Check bundle size (<150KB gzipped)
- [ ] Profile memory usage (~5MB)
- [ ] Test on low-end devices

**References:** Lines 76-83 (Performance targets), Lines 1011-1076 (Performance edge cases)

---

#### 8.5: iOS Safari PWA Testing (`hypermark-cza`)
**Priority:** P0

Comprehensive testing on iOS Safari PWA including installation, background behavior, and sync functionality.

**Testing Checklist:**

**Installation:**
- [ ] Add to Home Screen works
- [ ] App icon displays correctly
- [ ] Launches in standalone mode
- [ ] Status bar styling correct
- [ ] Splash screen appears

**Foreground Sync:**
- [ ] Pair iOS with desktop
- [ ] Add bookmark syncs immediately
- [ ] Concurrent edits merge correctly
- [ ] Large sync (100 items) completes

**Background Behavior:**
- [ ] Page Visibility API reconnects
- [ ] Sync resumes after returning to app

**Storage Limits:**
- [ ] Warning at 80% capacity (~40MB)
- [ ] Export and delete works
- [ ] App works at 90% capacity

**Implementation:**
```javascript
// Visibility handling
useEffect(() => {
  const handleVisibilityChange = () => {
    if (document.hidden) {
      setConnectionState('paused')
    } else {
      reconnectPeers()
    }
  }

  document.addEventListener('visibilitychange', handleVisibilityChange)
}, [])
```

**References:** Lines 758-772 (iOS Safari PWA constraints), Lines 1141 (iOS testing requirement)

---

#### 8.6: Multi-Device Sync Testing (`hypermark-by9`)
**Priority:** P0

Test comprehensive multi-device sync scenarios including concurrent edits and conflict resolution.

**Test Scenarios:**

1. **Basic Two-Device Sync**
   - Add on Device A → appears on Device B within 2s

2. **Concurrent Edit - Different Fields**
   - Device A: Add tag 'b'
   - Device B: Set readLater: true
   - Result: Both changes survive

3. **Concurrent Edit - Same Field**
   - Both edit title
   - Result: Last-write-wins (LWW)

4. **Tag Set CRDT**
   - Device A: Remove 'test', add 'new'
   - Device B: Add 'another'
   - Result: tags: ['new', 'another'] (add-wins)

5. **Three-Device Sync**
   - Changes propagate through all three

6. **Offline → Online Sync**
   - Accumulate 10 offline changes
   - Sync when online
   - Result: All changes merge

7. **Device Revocation**
   - Unpair Device B
   - Verify B can't sync new data
   - Verify B keeps local data

8. **Large Sync**
   - Sync 100+ bookmarks with progress

9. **Network Interruption Mid-Sync**
   - Disconnect during sync
   - Result: Idempotent recovery

10. **Rapid Sequential Edits**
    - 10 rapid title edits
    - Result: All propagate in order

**Test Automation:**
```javascript
test('Concurrent edit different fields merges', async () => {
  await deviceA.goOffline()
  await deviceB.goOffline()

  await deviceA.updateBookmark(id, { tags: ['a', 'b'] })
  await deviceB.updateBookmark(id, { readLater: true })

  await deviceA.goOnline()
  await deviceB.goOnline()
  await waitForSync()

  expect(finalA.tags).toEqual(['a', 'b'])
  expect(finalA.readLater).toBe(true)
})
```

**References:** Lines 1229-1237 (Acceptance criteria), Lines 356-372 (Merge semantics)

---

#### 8.7: Security Audit (`hypermark-ddj`)
**Priority:** P0

Comprehensive security audit to verify encryption implementation, key storage, and E2EE guarantees.

**Security Verification Checklist:**

**1. Key Storage Audit:**
```javascript
test('Device keypair is non-extractable', async () => {
  const keypair = await getDeviceKeypair()
  await expect(
    crypto.subtle.exportKey('pkcs8', keypair.privateKey)
  ).rejects.toThrow()
  expect(keypair.privateKey.extractable).toBe(false)
})
```

**2. IndexedDB Encryption:**
```javascript
test('Bookmarks encrypted at rest', async () => {
  await db.put({ url: 'https://secret-gift.com' })

  const rawData = await readRawIndexedDB()
  expect(JSON.stringify(rawData)).not.toContain('secret-gift')
})
```

**3. Network Traffic Inspection:**
- Manual: Capture HAR file, verify no plaintext
- Automated: Check WebRTC DTLS encryption active

**4. Pairing Security:**
- Verify ephemeral keys destroyed after pairing
- Verify verification words deterministic
- Verify session expires after 5 minutes

**5. Authorization Enforcement:**
- Verify unauthorized devices rejected
- Verify revoked devices cannot sync

**6. Threat Model Verification:**
- [ ] Network eavesdropper cannot see LEK
- [ ] Compromised WiFi: verification words differ
- [ ] Compromised PeerJS server: cannot decrypt
- [ ] QR intercept: useless without verification
- [ ] Replay attack: sessionId + expiry prevents

**7. Code Review:**
- [ ] All sensitive data encrypted with AES-GCM
- [ ] AAD includes context (record ID, ledger ID)
- [ ] No hardcoded keys
- [ ] No sensitive data logged
- [ ] HTTPS enforced

**References:** Lines 664-689 (Security properties), Lines 1238-1240 (No plaintext verification)

---

### Phase 8 Summary

| Task | ID | Priority | Complexity |
|------|-----|----------|-----------|
| Loading states | hypermark-9m3 | P0 | Medium |
| Empty states | hypermark-hr7 | P0 | Low |
| Offline indicator | hypermark-dzu | P0 | Low |
| Performance testing | hypermark-zx1 | P0 | Medium |
| iOS Safari testing | hypermark-cza | P0 | High |
| Multi-device testing | hypermark-by9 | P0 | High |
| Security audit | hypermark-ddj | P0 | High |

**Total Tasks:** 7
**Estimated Effort:** 5-7 days

---

## Phase 9: PWA Features

**Epic ID:** `hypermark-0ro`
**Priority:** P0
**Depends on:** Phase 8 (Polish & Testing)
**Final Phase before MVP Complete**

### Overview

Implement Progressive Web App features including service worker for offline support, app manifest configuration, and install prompt handling.

### Tasks

#### 9.1: Service Worker for Offline Support (`hypermark-x2y`)
**Priority:** P0

Create service worker with caching strategies for offline functionality.

**Key Features:**
- Cache app shell on install
- Cache-first for static assets
- Network-first for API calls
- Update notification when new version available
- Cleanup old caches on activate

**Implementation Highlights:**
```javascript
// public/sw.js
const CACHE_NAME = 'hypermark-v1'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(STATIC_ASSETS))
  )
})

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(request)
      .then(cached => cached || fetch(request))
  )
})
```

**Caching Strategy:**
- Static assets: Cache-first
- API calls: Network-first
- Offline fallback: Serve cached app shell

**Update Flow:**
```javascript
registration.addEventListener('updatefound', () => {
  showUpdateNotification('New version available!')
})
```

**References:** Lines 1146 (Service worker requirement)

---

#### 9.2: App Manifest Configuration (`hypermark-cwz`)
**Priority:** P0

Create comprehensive web app manifest for PWA installation.

**Manifest Configuration:**
```json
{
  "name": "Hypermark - E2EE Bookmarks",
  "short_name": "Hypermark",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#6366f1",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "purpose": "any maskable" }
  ],
  "shortcuts": [
    { "name": "Add Bookmark", "url": "/?action=add" },
    { "name": "Search", "url": "/?action=search" }
  ]
}
```

**Icon Sizes Required:**
- 72x72, 96x96, 128x128, 144x144, 152x152, 192x192, 384x384, 512x512
- Maskable icons for Android
- Apple touch icons for iOS

**HTML Meta Tags:**
```html
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#6366f1" />
```

**Testing:**
- [ ] Manifest validates at manifest-validator.appspot.com
- [ ] Icons display correctly
- [ ] iOS shows correct icon
- [ ] Lighthouse PWA audit passes

**References:** Lines 1147 (Manifest requirement)

---

#### 9.3: Install Prompt Handling (`hypermark-8ov`)
**Priority:** P0

Handle PWA install prompt with custom UI for better UX.

**Key Features:**
- Capture `beforeinstallprompt` event
- Custom install button/banner
- iOS installation instructions
- Track install analytics
- Detect already installed state

**Implementation Highlights:**
```javascript
export function useInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState(null)

  useEffect(() => {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      setInstallPrompt(e)
    })
  }, [])

  const showInstallPrompt = async () => {
    const result = await installPrompt.userChoice
    return result.outcome === 'accepted'
  }
}
```

**Custom Install Banner:**
```javascript
<div class="install-banner">
  <h4>Install Hypermark</h4>
  <p>Add to home screen for quick access</p>
  <Button onClick={showInstallPrompt}>Install</Button>
</div>
```

**iOS Instructions:**
1. Tap Share button in Safari
2. Select "Add to Home Screen"
3. Tap "Add" to confirm

**Analytics Events:**
- `install_prompt_shown`
- `install_accepted`
- `install_dismissed`

**References:** Lines 1148 (Install prompt requirement)

---

#### 9.4: Offline Functionality Verification (`hypermark-rl0`)
**Priority:** P0

Comprehensive testing to verify PWA works fully offline and meets all requirements.

**Testing Checklist:**

**1. Offline Functionality:**
- [ ] App loads without network after first visit
- [ ] Add/edit/delete bookmarks offline
- [ ] Search bookmarks offline
- [ ] Changes sync when online

**2. PWA Install:**
- [ ] Desktop: Install prompt → confirmation → launches standalone
- [ ] Android: Add to Home Screen → launches fullscreen
- [ ] iOS: Share → Add to Home Screen → launches standalone

**3. Lighthouse PWA Audit:**
```bash
npx lighthouse http://localhost:3000 --view

Required scores:
- PWA: 100
- Performance: >90
- Accessibility: >90
```

**4. Service Worker Testing:**
```javascript
test('App loads offline', async () => {
  await navigator.serviceWorker.ready
  await page.setOfflineMode(true)
  await page.reload()
  expect(await page.title()).toBe('Hypermark')
})
```

**5. Update Flow:**
- Deploy new version
- User reopens app
- Verify update notification
- Click "Update Now"
- App reloads with new version

**6. Cache Verification:**
- [ ] Static assets cached
- [ ] Runtime cache builds
- [ ] Old caches deleted
- [ ] Cache size reasonable (<10MB)

**7. Cross-Browser Testing:**
- [ ] Chrome, Edge, Firefox, Safari (Desktop)
- [ ] Chrome, Samsung Internet, Safari (Mobile)

**8. Performance Metrics:**
- [ ] First Contentful Paint: <1s
- [ ] Time to Interactive: <2s
- [ ] Largest Contentful Paint: <2s

**Acceptance Criteria:**
- Lighthouse PWA score: 100
- Works completely offline
- Installs on all platforms
- Update mechanism works
- Cross-browser compatible

**References:** Lines 1149 (Verify offline), Lines 1233 (Offline acceptance)

---

### Phase 9 Summary

| Task | ID | Priority | Complexity |
|------|-----|----------|-----------|
| Service worker | hypermark-x2y | P0 | Medium |
| App manifest | hypermark-cwz | P0 | Low |
| Install prompt | hypermark-8ov | P0 | Medium |
| Offline verification | hypermark-rl0 | P0 | High |

**Total Tasks:** 4
**Estimated Effort:** 3-4 days

---

## Implementation Timeline

### Phase 7: Error Handling (3-4 days)
**Week 1-2**
- Days 1-2: Network error recovery, pairing timeout, storage monitoring
- Days 3-4: WebCrypto check, camera fallback, rate limiting

### Phase 8: Polish & Testing (5-7 days)
**Week 2-3**
- Days 1-2: Loading states, empty states, offline indicator
- Days 3-4: Performance testing, iOS Safari testing
- Days 5-7: Multi-device testing, security audit

### Phase 9: PWA Features (3-4 days)
**Week 3-4**
- Days 1-2: Service worker, app manifest
- Days 3-4: Install prompt, offline verification

**Total Estimated Time:** 11-15 days (2-3 weeks)

---

## Total Summary

### All Phases Overview

| Phase | Epic ID | Tasks | Days | Status |
|-------|---------|-------|------|--------|
| Phase 7: Error Handling | hypermark-6gt | 6 | 3-4 | Ready |
| Phase 8: Polish & Testing | hypermark-vsm | 7 | 5-7 | Ready |
| Phase 9: PWA Features | hypermark-0ro | 4 | 3-4 | Ready |

**Total Tasks:** 17
**Total Estimated Effort:** 11-15 days

### Phase 7 Tasks
1. `hypermark-8wv` - Network error recovery
2. `hypermark-7g6` - Pairing timeout handling
3. `hypermark-t6v` - Storage quota monitoring
4. `hypermark-0z3` - WebCrypto unavailable handling
5. `hypermark-7d8` - Camera permission fallback
6. `hypermark-6ps` - Rate limiting for pairing

### Phase 8 Tasks
1. `hypermark-9m3` - Loading states and progress indicators
2. `hypermark-hr7` - Empty states and onboarding
3. `hypermark-dzu` - Offline indicator
4. `hypermark-zx1` - Performance testing (1000+ bookmarks)
5. `hypermark-cza` - iOS Safari PWA testing
6. `hypermark-by9` - Multi-device sync testing
7. `hypermark-ddj` - Security audit

### Phase 9 Tasks
1. `hypermark-x2y` - Service worker implementation
2. `hypermark-cwz` - App manifest configuration
3. `hypermark-8ov` - Install prompt handling
4. `hypermark-rl0` - Offline functionality verification

---

## Key Design Decisions Referenced

### From Section 5 (Error Handling & Edge Cases)

**Network Failures (lines 694-725):**
- Connection drop handling with exponential backoff
- Auto-retry for sync with 5s intervals
- PeerJS auto-reconnection for WebRTC

**Storage & Database (lines 726-781):**
- Fireproof initialization error handling
- Storage quota monitoring at 80% threshold
- iOS Safari 50MB limit awareness

**Browser Limitations (lines 758-804):**
- iOS background throttling with Page Visibility API
- WebCrypto unavailable blocking with browser recommendations
- Camera permission denied fallback to manual pairing

**Security (lines 860-901):**
- Device revocation with continued local access
- Verification words mismatch handling
- Rate limiting: 3 attempts per 5 minutes

### From Section 6 (Implementation Checklist)

**Phase 7 Requirements (lines 1128-1134):**
All 6 error handling tasks directly map to checklist items

**Phase 8 Requirements (lines 1136-1143):**
All 7 polish and testing tasks directly map to checklist items

**Phase 9 Requirements (lines 1145-1149):**
All 4 PWA feature tasks directly map to checklist items

### From Section 9 (Acceptance Criteria)

**MVP Complete When (lines 1224-1243):**
- Two devices pair via QR in <30 seconds ✓
- Concurrent edits merge correctly ✓
- App works fully offline ✓
- Data persists across restarts ✓
- Device revocation works ✓
- No plaintext data in storage or network ✓
- Performance: <1s cold start, <50ms operations ✓
- iOS Safari PWA installs and syncs ✓
- 1000 bookmarks load quickly ✓

---

## References to Design Document

All tasks in this implementation plan reference specific line numbers from the main design document (`2025-12-26-hypermark-implementation-design.md`):

- **Section 1:** Architecture & Performance Targets (lines 1-83)
- **Section 4:** Pairing & Security Design (lines 377-689)
- **Section 5:** Error Handling & Edge Cases (lines 690-1076)
- **Section 6:** Implementation Checklist (lines 1079-1149)
- **Section 9:** Acceptance Criteria (lines 1224-1243)

Each task includes:
- ✅ Specific code examples from the design doc
- ✅ Error handling patterns with line references
- ✅ Testing scenarios with acceptance criteria
- ✅ Direct links to relevant sections

---

## Next Steps

1. **Start Phase 7:** Begin with network error recovery (`hypermark-8wv`)
2. **Follow Task Order:** Complete each task sequentially within each phase
3. **Test Continuously:** Each task includes testing scenarios
4. **Update Progress:** Mark tasks complete in Beads as they finish
5. **Document Findings:** Update design doc if implementation reveals issues

**Command to view all tasks:**
```bash
bd list | grep -E "(Phase 7|Phase 8|Phase 9)"
```

**Command to start first task:**
```bash
bd update hypermark-8wv --status in_progress
```

---

## Conclusion

This implementation plan provides comprehensive, actionable detail for the final three phases of Hypermark MVP. Each of the 17 tasks includes:

- Specific implementation code examples
- Error handling patterns
- Testing scenarios and acceptance criteria
- Direct references to the design document

The plan follows the same structure and detail level as the existing Phase 1-6 tasks, ensuring consistency and completeness for successful MVP delivery.

**Total Scope:** 17 tasks across 3 phases, estimated 11-15 days (2-3 weeks) of implementation time.
