/**
 * Sync Performance Optimization Service Tests
 *
 * Tests for performance enhancements including:
 * - Priority-based bookmark classification
 * - Paginated sync management
 * - Background sync coordination
 * - Batch operation management
 * - Lazy loading
 * - Network-aware optimization
 * - Memory management
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  PERFORMANCE_CONFIG,
  PRIORITY_LEVELS,
  classifyBookmarkPriority,
  sortBookmarksByPriority,
  PaginatedSyncManager,
  BackgroundSyncCoordinator,
  BatchOperationManager,
  LazyLoadingManager,
  NetworkAwareSyncOptimizer,
  MemoryManager,
  SyncPerformanceManager,
  delay,
  chunk,
} from './sync-performance'

// ========================================================================
// Priority Classification Tests
// ========================================================================

describe('Priority Classification', () => {
  const now = Date.now()

  describe('classifyBookmarkPriority', () => {
    it('should classify currently viewed bookmark as CRITICAL', () => {
      const bookmark = { id: 'bm1', updatedAt: now - 1000 }
      const priority = classifyBookmarkPriority(bookmark, { currentViewId: 'bm1' })
      expect(priority).toBe(PRIORITY_LEVELS.CRITICAL)
    })

    it('should classify pinned bookmark as CRITICAL', () => {
      const bookmark = { id: 'bm1', updatedAt: now - 1000 }
      const pinnedIds = new Set(['bm1'])
      const priority = classifyBookmarkPriority(bookmark, { pinnedIds })
      expect(priority).toBe(PRIORITY_LEVELS.CRITICAL)
    })

    it('should classify recent bookmark as HIGH', () => {
      const bookmark = {
        id: 'bm1',
        updatedAt: now - (3 * 24 * 60 * 60 * 1000), // 3 days ago
        tags: [],
        readLater: false,
      }
      const priority = classifyBookmarkPriority(bookmark, {})
      expect(priority).toBe(PRIORITY_LEVELS.HIGH)
    })

    it('should classify read-later bookmark as HIGH', () => {
      const bookmark = {
        id: 'bm1',
        updatedAt: now - (60 * 24 * 60 * 60 * 1000), // 60 days ago
        tags: [],
        readLater: true,
      }
      const priority = classifyBookmarkPriority(bookmark, {})
      expect(priority).toBe(PRIORITY_LEVELS.HIGH)
    })

    it('should classify well-tagged bookmark as HIGH', () => {
      const bookmark = {
        id: 'bm1',
        updatedAt: now - (60 * 24 * 60 * 60 * 1000), // 60 days ago
        tags: ['tag1', 'tag2', 'tag3'],
        readLater: false,
      }
      const priority = classifyBookmarkPriority(bookmark, {})
      expect(priority).toBe(PRIORITY_LEVELS.HIGH)
    })

    it('should classify moderately recent bookmark as MEDIUM', () => {
      const bookmark = {
        id: 'bm1',
        updatedAt: now - (15 * 24 * 60 * 60 * 1000), // 15 days ago
        tags: ['tag1'],
        readLater: false,
      }
      const priority = classifyBookmarkPriority(bookmark, {})
      expect(priority).toBe(PRIORITY_LEVELS.MEDIUM)
    })

    it('should classify old bookmark as LOW', () => {
      const bookmark = {
        id: 'bm1',
        updatedAt: now - (90 * 24 * 60 * 60 * 1000), // 90 days ago
        tags: [],
        readLater: false,
      }
      const priority = classifyBookmarkPriority(bookmark, {})
      expect(priority).toBe(PRIORITY_LEVELS.LOW)
    })
  })

  describe('sortBookmarksByPriority', () => {
    it('should sort bookmarks by priority', () => {
      const bookmarks = [
        { id: 'low', updatedAt: now - (90 * 24 * 60 * 60 * 1000), tags: [], readLater: false },
        { id: 'high', updatedAt: now - 1000, tags: [], readLater: false },
        { id: 'medium', updatedAt: now - (15 * 24 * 60 * 60 * 1000), tags: ['tag1'], readLater: false },
      ]

      const sorted = sortBookmarksByPriority(bookmarks, {})

      expect(sorted[0].id).toBe('high')
      expect(sorted[1].id).toBe('medium')
      expect(sorted[2].id).toBe('low')
    })

    it('should sort by updatedAt within same priority', () => {
      const bookmarks = [
        { id: 'older', updatedAt: now - (2 * 24 * 60 * 60 * 1000), tags: [], readLater: false },
        { id: 'newer', updatedAt: now - (1 * 24 * 60 * 60 * 1000), tags: [], readLater: false },
      ]

      const sorted = sortBookmarksByPriority(bookmarks, {})

      expect(sorted[0].id).toBe('newer')
      expect(sorted[1].id).toBe('older')
    })
  })
})

// ========================================================================
// Paginated Sync Manager Tests
// ========================================================================

describe('PaginatedSyncManager', () => {
  it('should paginate bookmarks correctly', () => {
    const bookmarks = Array.from({ length: 150 }, (_, i) => ({
      id: `bm${i}`,
      updatedAt: Date.now() - i * 1000,
    }))

    const pager = new PaginatedSyncManager(bookmarks, {
      initialPageSize: 50,
      subsequentPageSize: 100,
      prioritize: false,
    })

    // First page should be 50
    const page1 = pager.getNextPage()
    expect(page1.length).toBe(50)

    // Second page should be 100
    const page2 = pager.getNextPage()
    expect(page2.length).toBe(100)

    // Should be complete
    expect(pager.isComplete).toBe(true)
    expect(pager.getNextPage()).toBeNull()
  })

  it('should track progress correctly', () => {
    const bookmarks = Array.from({ length: 100 }, (_, i) => ({
      id: `bm${i}`,
      updatedAt: Date.now(),
    }))

    const pager = new PaginatedSyncManager(bookmarks, {
      initialPageSize: 25,
      subsequentPageSize: 50,
      prioritize: false,
    })

    pager.getNextPage() // 25
    const progress = pager.getProgress()

    expect(progress.processed).toBe(25)
    expect(progress.total).toBe(100)
    expect(progress.percent).toBe(25)
    expect(progress.currentPage).toBe(1)
    expect(progress.isComplete).toBe(false)
  })

  it('should support async iteration', async () => {
    const bookmarks = Array.from({ length: 75 }, (_, i) => ({
      id: `bm${i}`,
      updatedAt: Date.now(),
    }))

    const pager = new PaginatedSyncManager(bookmarks, {
      initialPageSize: 25,
      subsequentPageSize: 50,
      prioritize: false,
    })

    const pages = []
    for await (const page of pager.pages(0)) {
      pages.push(page)
    }

    expect(pages.length).toBe(2)
    expect(pages[0].length).toBe(25)
    expect(pages[1].length).toBe(50)
  })

  it('should reset correctly', () => {
    const bookmarks = Array.from({ length: 100 }, (_, i) => ({
      id: `bm${i}`,
      updatedAt: Date.now(),
    }))

    const pager = new PaginatedSyncManager(bookmarks, {
      initialPageSize: 50,
      prioritize: false,
    })

    pager.getNextPage()
    pager.getNextPage()
    pager.reset()

    expect(pager.processedCount).toBe(0)
    expect(pager.isComplete).toBe(false)
  })
})

// ========================================================================
// Background Sync Coordinator Tests
// ========================================================================

describe('BackgroundSyncCoordinator', () => {
  it('should process bookmarks in background', async () => {
    const processed = []
    const coordinator = new BackgroundSyncCoordinator({
      delayMs: 0,
    })

    const bookmarks = [{ id: 'bm1' }, { id: 'bm2' }, { id: 'bm3' }]

    await coordinator.start(bookmarks, async (bookmark) => {
      processed.push(bookmark.id)
    })

    expect(processed).toEqual(['bm1', 'bm2', 'bm3'])
    expect(coordinator.stats.processed).toBe(3)
    expect(coordinator.stats.failed).toBe(0)
  })

  it('should handle errors gracefully', async () => {
    const errors = []
    const coordinator = new BackgroundSyncCoordinator({
      delayMs: 0,
      onError: (err) => errors.push(err),
    })

    const bookmarks = [{ id: 'bm1' }, { id: 'bm2' }]

    await coordinator.start(bookmarks, async (bookmark) => {
      if (bookmark.id === 'bm1') {
        throw new Error('Test error')
      }
    })

    expect(coordinator.stats.processed).toBe(1)
    expect(coordinator.stats.failed).toBe(1)
    expect(errors.length).toBe(1)
  })

  it('should be stoppable', async () => {
    const coordinator = new BackgroundSyncCoordinator({
      delayMs: 100,
    })

    const bookmarks = Array.from({ length: 1000 }, (_, i) => ({ id: `bm${i}` }))
    const processed = []

    const syncPromise = coordinator.start(bookmarks, async (bookmark) => {
      processed.push(bookmark.id)
    })

    // Stop after a short delay
    setTimeout(() => coordinator.stop(), 50)

    await syncPromise

    // Should have processed some but not all
    expect(processed.length).toBeLessThan(bookmarks.length)
    expect(coordinator.isRunning).toBe(false)
  })
})

// ========================================================================
// Batch Operation Manager Tests
// ========================================================================

describe('BatchOperationManager', () => {
  it('should process items in batches', async () => {
    const manager = new BatchOperationManager({
      batchSize: 10,
      maxConcurrent: 3,
    })

    const items = Array.from({ length: 25 }, (_, i) => i)
    const processed = []

    const result = await manager.executeBatch(items, async (item) => {
      processed.push(item)
      return item * 2
    })

    expect(result.success).toBe(true)
    expect(result.results.length).toBe(25)
    expect(result.stats.successful).toBe(25)
    expect(result.stats.failed).toBe(0)
  })

  it('should retry failed operations', async () => {
    const manager = new BatchOperationManager({
      batchSize: 5,
      retryAttempts: 2,
      retryBackoffMs: 10,
    })

    let attemptCount = 0
    const items = [1]

    const result = await manager.executeBatch(items, async (item) => {
      attemptCount++
      if (attemptCount < 3) {
        throw new Error('Temporary failure')
      }
      return item
    })

    expect(result.success).toBe(true)
    expect(attemptCount).toBe(3)
  })

  it('should report progress', async () => {
    const progressUpdates = []
    const manager = new BatchOperationManager({
      batchSize: 5,
      onProgress: (progress) => progressUpdates.push(progress),
    })

    const items = Array.from({ length: 10 }, (_, i) => i)

    await manager.executeBatch(items, async (item) => item)

    expect(progressUpdates.length).toBe(2) // 2 batches
    expect(progressUpdates[0].processed).toBe(5)
    expect(progressUpdates[1].processed).toBe(10)
  })
})

// ========================================================================
// Lazy Loading Manager Tests
// ========================================================================

describe('LazyLoadingManager', () => {
  it('should register and load items on demand', async () => {
    const manager = new LazyLoadingManager()

    manager.register('item1', async () => ({ data: 'loaded' }))

    const result = await manager.load('item1')

    expect(result).toEqual({ data: 'loaded' })
  })

  it('should cache loaded items', async () => {
    const manager = new LazyLoadingManager()

    let loadCount = 0
    manager.register('item1', async () => {
      loadCount++
      return { data: 'loaded' }
    })

    await manager.load('item1')
    await manager.load('item1')

    expect(loadCount).toBe(1)
  })

  it('should evict oldest items when cache is full', async () => {
    const manager = new LazyLoadingManager({ cacheSize: 2 })

    for (let i = 0; i < 3; i++) {
      manager.register(`item${i}`, async () => ({ id: i }))
      await manager.load(`item${i}`)
    }

    // First item should be evicted
    expect(manager.cache.has('item0')).toBe(false)
    expect(manager.cache.has('item1')).toBe(true)
    expect(manager.cache.has('item2')).toBe(true)
  })

  it('should invalidate items', async () => {
    const manager = new LazyLoadingManager()

    manager.register('item1', async () => ({ data: 'loaded' }))
    await manager.load('item1')

    manager.invalidate('item1')

    expect(manager.cache.has('item1')).toBe(false)
  })
})

// ========================================================================
// Network-Aware Sync Optimizer Tests
// ========================================================================

describe('NetworkAwareSyncOptimizer', () => {
  it('should detect slow connections', () => {
    const optimizer = new NetworkAwareSyncOptimizer({
      slowConnectionThresholdMs: 1000,
    })

    // Record several slow latencies
    for (let i = 0; i < 5; i++) {
      optimizer.recordLatency(1500)
    }

    expect(optimizer.isNetworkSlow()).toBe(true)
  })

  it('should adjust batch size for slow connections', () => {
    const optimizer = new NetworkAwareSyncOptimizer({
      slowConnectionThresholdMs: 1000,
      maxBatchSize: 100,
      minBatchSize: 10,
    })

    const initialBatchSize = optimizer.getOptimalBatchSize()

    // Record slow latencies
    for (let i = 0; i < 5; i++) {
      optimizer.recordLatency(2000)
    }

    const adjustedBatchSize = optimizer.getOptimalBatchSize()

    expect(adjustedBatchSize).toBeLessThan(initialBatchSize)
    expect(adjustedBatchSize).toBeGreaterThanOrEqual(10)
  })

  it('should provide network statistics', () => {
    const optimizer = new NetworkAwareSyncOptimizer()

    optimizer.recordLatency(100)
    optimizer.recordLatency(200)
    optimizer.recordLatency(300)

    const stats = optimizer.getStats()

    expect(stats.averageLatencyMs).toBe(200)
    expect(stats.sampleCount).toBe(3)
  })
})

// ========================================================================
// Memory Manager Tests
// ========================================================================

describe('MemoryManager', () => {
  it('should start and stop monitoring', () => {
    const manager = new MemoryManager()

    manager.startMonitoring()
    expect(manager.isMonitoring).toBe(true)

    manager.stopMonitoring()
    expect(manager.isMonitoring).toBe(false)
  })

  // Note: getMemoryUsage depends on performance.memory which may not be available in all environments
  it('should handle missing performance.memory gracefully', () => {
    const manager = new MemoryManager()

    const usage = manager.getMemoryUsage()
    // May be null if performance.memory is not available
    expect(usage === null || typeof usage === 'object').toBe(true)
  })
})

// ========================================================================
// Sync Performance Manager Tests
// ========================================================================

describe('SyncPerformanceManager', () => {
  it('should initialize correctly', () => {
    const manager = new SyncPerformanceManager()

    manager.initialize(500)
    expect(manager.isLargeCollection).toBe(false)

    const manager2 = new SyncPerformanceManager()
    manager2.initialize(1500)
    expect(manager2.isLargeCollection).toBe(true)
  })

  it('should process initial sync with priority sorting', async () => {
    const manager = new SyncPerformanceManager({
      enableBackgroundSync: false,
    })

    const now = Date.now()
    const bookmarks = [
      { id: 'old', updatedAt: now - (90 * 24 * 60 * 60 * 1000), tags: [], readLater: false },
      { id: 'recent', updatedAt: now - 1000, tags: [], readLater: false },
    ]

    const applied = []
    await manager.processInitialSync(bookmarks, async (page) => {
      applied.push(...page.map(b => b.id))
    })

    // Recent should be first due to priority sorting
    expect(applied[0]).toBe('recent')
  })

  it('should provide recommended parameters', () => {
    const manager = new SyncPerformanceManager()
    manager.initialize(100)

    const params = manager.getRecommendedParameters()

    expect(params).toHaveProperty('batchSize')
    expect(params).toHaveProperty('debounceDelay')
    expect(params).toHaveProperty('networkStats')
  })

  it('should shutdown cleanly', () => {
    const manager = new SyncPerformanceManager()
    manager.initialize(1500)

    // Should not throw
    expect(() => manager.shutdown()).not.toThrow()
  })
})

// ========================================================================
// Utility Function Tests
// ========================================================================

describe('Utility Functions', () => {
  describe('delay', () => {
    it('should delay execution', async () => {
      const start = Date.now()
      await delay(50)
      const elapsed = Date.now() - start

      expect(elapsed).toBeGreaterThanOrEqual(45)
    })
  })

  describe('chunk', () => {
    it('should split array into chunks', () => {
      const arr = [1, 2, 3, 4, 5, 6, 7]
      const chunks = chunk(arr, 3)

      expect(chunks).toEqual([[1, 2, 3], [4, 5, 6], [7]])
    })

    it('should handle empty array', () => {
      expect(chunk([], 3)).toEqual([])
    })

    it('should handle array smaller than chunk size', () => {
      expect(chunk([1, 2], 5)).toEqual([[1, 2]])
    })
  })
})
