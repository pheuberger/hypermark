# Hypermark Phases 7-9: Quick Reference Guide

**Created:** 2025-12-26

---

## Epic IDs

| Phase | Epic ID | Description |
|-------|---------|-------------|
| Phase 7 | `hypermark-6gt` | Error Handling |
| Phase 8 | `hypermark-vsm` | Polish & Testing |
| Phase 9 | `hypermark-0ro` | PWA Features |

---

## Phase 7: Error Handling (6 tasks, 3-4 days)

| # | Task ID | Task | Lines | Priority |
|---|---------|------|-------|----------|
| 7.1 | `hypermark-8wv` | Network error recovery with retry logic | 694-725 | P0 |
| 7.2 | `hypermark-7g6` | Pairing timeout handling (5 min expiry) | 708-710 | P0 |
| 7.3 | `hypermark-t6v` | Storage quota monitoring (80% warning) | 773-781 | P0 |
| 7.4 | `hypermark-0z3` | WebCrypto unavailable error handling | 783-791 | P0 |
| 7.5 | `hypermark-7d8` | Camera permission fallback to manual | 793-804 | P0 |
| 7.6 | `hypermark-6ps` | Rate limiting for pairing (3/5min) | 885-901 | P0 |

**Key Deliverables:**
- ✅ Exponential backoff retry (up to 30s)
- ✅ Pairing session countdown timer
- ✅ Storage warning at 80% capacity
- ✅ Browser recommendation UI
- ✅ Manual pairing with short codes
- ✅ Rate limit countdown timer

---

## Phase 8: Polish & Testing (7 tasks, 5-7 days)

| # | Task ID | Task | Lines | Priority |
|---|---------|------|-------|----------|
| 8.1 | `hypermark-9m3` | Loading states & progress indicators | 1036-1076 | P0 |
| 8.2 | `hypermark-hr7` | Empty states & onboarding flow | 852-886 | P0 |
| 8.3 | `hypermark-dzu` | Offline indicator with status | 758-772 | P0 |
| 8.4 | `hypermark-zx1` | Performance testing (1000+ bookmarks) | 76-83 | P0 |
| 8.5 | `hypermark-cza` | iOS Safari PWA testing | 758-772 | P0 |
| 8.6 | `hypermark-by9` | Multi-device sync scenarios | 1229-1237 | P0 |
| 8.7 | `hypermark-ddj` | Security audit (E2EE verification) | 664-689 | P0 |

**Key Deliverables:**
- ✅ Skeleton loaders & progress bars
- ✅ 3-step onboarding flow
- ✅ Connection status badge (green/yellow/gray)
- ✅ <1s cold start, <50ms operations
- ✅ iOS "Add to Home Screen" tested
- ✅ 10 multi-device test scenarios
- ✅ Non-extractable key verification

---

## Phase 9: PWA Features (4 tasks, 3-4 days)

| # | Task ID | Task | Lines | Priority |
|---|---------|------|-------|----------|
| 9.1 | `hypermark-x2y` | Service worker with offline caching | 1146 | P0 |
| 9.2 | `hypermark-cwz` | App manifest with icons & theme | 1147 | P0 |
| 9.3 | `hypermark-8ov` | Install prompt handling | 1148 | P0 |
| 9.4 | `hypermark-rl0` | Offline functionality verification | 1149 | P0 |

**Key Deliverables:**
- ✅ Service worker registers & caches assets
- ✅ 8 icon sizes (72-512px) generated
- ✅ Custom install banner UI
- ✅ Lighthouse PWA score: 100

---

## Quick Commands

### View All Phases
```bash
bd list | grep -E "(Phase 7|Phase 8|Phase 9)"
```

### View Phase 7 Tasks
```bash
bd list | grep "7\."
```

### View Phase 8 Tasks
```bash
bd list | grep "8\."
```

### View Phase 9 Tasks
```bash
bd list | grep "9\."
```

### Start a Task
```bash
bd update <task-id> --status in_progress
```

### Complete a Task
```bash
bd update <task-id> --status done
```

### Show Task Details
```bash
bd show <task-id>
```

---

## Testing Priority Matrix

### Critical (Must Pass for MVP)
- [ ] 8.4: Performance (<1s cold start, <50ms ops)
- [ ] 8.5: iOS Safari PWA installs
- [ ] 8.6: Multi-device sync (10 scenarios)
- [ ] 8.7: Security audit (no plaintext)
- [ ] 9.4: Lighthouse PWA score 100

### Important (Required for Production)
- [ ] 7.1: Network error recovery
- [ ] 7.6: Rate limiting (security)
- [ ] 8.1: Loading states (UX)
- [ ] 9.1: Service worker (offline)

### Nice to Have (Can iterate)
- [ ] 7.2: Pairing timeout
- [ ] 7.3: Storage monitoring
- [ ] 8.2: Onboarding flow
- [ ] 8.3: Offline indicator

---

## Acceptance Criteria Checklist

From Section 9 (lines 1224-1243), MVP complete when:

### Pairing & Sync
- [ ] Two devices pair via QR in <30 seconds
- [ ] Manual pairing works without camera
- [ ] Verification words display and match
- [ ] Devices auto-reconnect after restart
- [ ] Concurrent edits merge correctly

### Performance
- [ ] App works fully offline
- [ ] Data persists across restarts
- [ ] <1s cold start, <50ms local operations
- [ ] 1000 bookmarks load and search quickly

### Security
- [ ] Stolen device can be unpaired
- [ ] No plaintext data in IndexedDB
- [ ] Network traffic shows encrypted WebRTC
- [ ] Non-extractable keys verified

### PWA
- [ ] iOS Safari PWA works (install + sync)
- [ ] Service worker enables offline mode
- [ ] Install prompt appears correctly

---

## Implementation Order

**Recommended Sequence:**

### Week 1: Phase 7 (Error Handling)
1. Day 1: Tasks 7.1, 7.2 (Network & timeout)
2. Day 2: Tasks 7.3, 7.4 (Storage & WebCrypto)
3. Day 3: Tasks 7.5, 7.6 (Camera & rate limit)

### Week 2-3: Phase 8 (Polish & Testing)
1. Days 4-5: Tasks 8.1, 8.2, 8.3 (UI polish)
2. Day 6: Task 8.4 (Performance testing)
3. Days 7-8: Task 8.5 (iOS testing)
4. Days 9-10: Tasks 8.6, 8.7 (Sync & security testing)

### Week 3-4: Phase 9 (PWA Features)
1. Days 11-12: Tasks 9.1, 9.2 (SW & manifest)
2. Day 13: Task 9.3 (Install prompt)
3. Days 14-15: Task 9.4 (Offline verification)

---

## Code Examples Quick Reference

### Phase 7: Error Handling

**Network Retry:**
```javascript
async retryWithBackoff(operation) {
  const backoff = Math.min(1000 * Math.pow(2, this.retryCount), 30000)
  await new Promise(resolve => setTimeout(resolve, backoff))
  return operation()
}
```

**Storage Monitor:**
```javascript
const estimate = await navigator.storage.estimate()
const percentUsed = (estimate.usage / estimate.quota) * 100
if (percentUsed >= 80) showWarning()
```

**Rate Limiter:**
```javascript
class PairingRateLimiter {
  maxAttempts = 3
  windowMs = 300000  // 5 min
}
```

### Phase 8: Polish & Testing

**Loading State:**
```javascript
<LoadingState message="Syncing..." progress={75} />
```

**Empty State:**
```javascript
<EmptyBookmarksState>
  <Button onClick={openAddForm}>Add Bookmark</Button>
</EmptyBookmarksState>
```

**Performance Test:**
```javascript
test('Cold start <1s', async () => {
  const start = performance.now()
  await initializeApp()
  expect(performance.now() - start).toBeLessThan(1000)
})
```

### Phase 9: PWA Features

**Service Worker:**
```javascript
self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache =>
    cache.addAll(STATIC_ASSETS)
  ))
})
```

**Install Prompt:**
```javascript
const { canInstall, showInstallPrompt } = useInstallPrompt()
if (canInstall) {
  await showInstallPrompt()
}
```

---

## Key Metrics to Track

### Performance Targets
- **Cold start:** <1s
- **Local ops:** <50ms
- **Sync handshake:** <2s
- **Bundle size:** <150KB gzipped
- **Storage:** 1000+ bookmarks (~5MB)

### PWA Scores (Lighthouse)
- **PWA:** 100
- **Performance:** >90
- **Accessibility:** >90
- **Best Practices:** >90
- **SEO:** >90

### Error Handling Thresholds
- **Network retry:** Up to 30s backoff
- **Pairing timeout:** 5 minutes
- **Storage warning:** 80% capacity
- **Rate limit:** 3 attempts / 5 min

---

## Files Created

1. **Full Implementation Plan:**
   - `/home/mrmn/Personal/hypermark/docs/plans/phases-7-8-9-implementation.md`
   - 17 tasks with detailed specifications
   - Code examples and testing scenarios
   - Line references to design document

2. **Quick Reference (this file):**
   - `/home/mrmn/Personal/hypermark/docs/plans/phases-7-8-9-quick-reference.md`
   - Task IDs and priorities
   - Commands and checklists
   - Key metrics and code snippets

---

## Design Document References

All tasks reference:
- **Main Design Doc:** `2025-12-26-hypermark-implementation-design.md`
- **Section 1:** Architecture & Performance (lines 1-83)
- **Section 4:** Pairing & Security (lines 377-689)
- **Section 5:** Error Handling (lines 690-1076)
- **Section 6:** Implementation Checklist (lines 1079-1149)
- **Section 9:** Acceptance Criteria (lines 1224-1243)

---

## Summary

**Total Work:**
- **3 Epics** (Phases 7, 8, 9)
- **17 Tasks** (6 + 7 + 4)
- **11-15 days** estimated effort
- **2-3 weeks** calendar time

**Next Action:**
```bash
bd update hypermark-8wv --status in_progress
```

Start with Task 7.1: Network error recovery with retry logic.
