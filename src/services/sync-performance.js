/**
 * Sync Performance Optimization Service
 *
 * Provides performance enhancements for users with large bookmark collections (1000+ bookmarks).
 *
 * Features:
 * - Paginated initial sync to reduce memory pressure during onboarding
 * - Priority-based loading for recent/important bookmarks first
 * - Background sync for non-critical bookmarks after UI render
 * - Intelligent batching for bulk operations
 * - Lazy loading strategies and memory management
 * - Network optimization for slow connections
 *
 * BEAD: hypermark-lf6.13 (performance-optimizations)
 */

// ========================================================================
// Configuration
// ========================================================================

/**
 * Performance configuration defaults
 * These can be overridden via options when creating a PerformanceManager
 */
export const PERFORMANCE_CONFIG = {
  // Pagination settings
  INITIAL_PAGE_SIZE: 50, // First batch to render quickly
  SUBSEQUENT_PAGE_SIZE: 100, // Larger batches after initial render
  MAX_CONCURRENT_OPERATIONS: 5, // Parallel operations limit

  // Priority thresholds
  RECENT_THRESHOLD_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  IMPORTANT_TAG_THRESHOLD: 3, // Bookmarks with 3+ tags considered important

  // Timing
  BACKGROUND_SYNC_DELAY_MS: 100, // Delay before starting background sync
  BATCH_OPERATION_DELAY_MS: 10, // Small delay between batches
  MEMORY_CHECK_INTERVAL_MS: 5000, // How often to check memory usage

  // Memory management
  LARGE_COLLECTION_THRESHOLD: 1000, // When to enable aggressive optimizations
  MEMORY_PRESSURE_THRESHOLD: 0.8, // 80% memory usage triggers cleanup

  // Network optimization
  SLOW_CONNECTION_THRESHOLD_MS: 2000, // Response time indicating slow connection
  RETRY_BACKOFF_BASE_MS: 1000,
  MAX_RETRIES: 3,
}

// ========================================================================
// Priority Classification
// ========================================================================

/**
 * Priority levels for bookmark loading
 */
export const PRIORITY_LEVELS = {
  CRITICAL: 0, // Currently viewed or pinned
  HIGH: 1, // Recent (within 7 days), read-later, many tags
  MEDIUM: 2, // Older but actively used
  LOW: 3, // Archive/old bookmarks
}

/**
 * Classify a bookmark's loading priority
 *
 * @param {Object} bookmark - Bookmark data object
 * @param {Object} options - Classification options
 * @param {Set} [options.pinnedIds] - IDs of pinned bookmarks
 * @param {string} [options.currentViewId] - Currently viewed bookmark ID
 * @returns {number} Priority level from PRIORITY_LEVELS
 */
export function classifyBookmarkPriority(bookmark, options = {}) {
  const { pinnedIds = new Set(), currentViewId = null } = options
  const now = Date.now()

  // Critical: Currently viewed or pinned
  if (bookmark.id === currentViewId || pinnedIds.has(bookmark.id)) {
    return PRIORITY_LEVELS.CRITICAL
  }

  // High: Recent, read-later, or well-tagged
  const isRecent =
    now - bookmark.updatedAt < PERFORMANCE_CONFIG.RECENT_THRESHOLD_MS
  const isReadLater = bookmark.readLater === true
  const hasImportantTags =
    bookmark.tags?.length >= PERFORMANCE_CONFIG.IMPORTANT_TAG_THRESHOLD

  if (isRecent || isReadLater || hasImportantTags) {
    return PRIORITY_LEVELS.HIGH
  }

  // Medium: Updated in last 30 days
  const isModeratelyRecent =
    now - bookmark.updatedAt < 30 * 24 * 60 * 60 * 1000
  if (isModeratelyRecent) {
    return PRIORITY_LEVELS.MEDIUM
  }

  // Low: Everything else
  return PRIORITY_LEVELS.LOW
}

/**
 * Sort bookmarks by priority for loading
 *
 * @param {Array} bookmarks - Array of bookmark objects
 * @param {Object} options - Classification options
 * @returns {Array} Sorted bookmarks (highest priority first)
 */
export function sortBookmarksByPriority(bookmarks, options = {}) {
  return [...bookmarks].sort((a, b) => {
    const priorityA = classifyBookmarkPriority(a, options)
    const priorityB = classifyBookmarkPriority(b, options)

    // Sort by priority first
    if (priorityA !== priorityB) {
      return priorityA - priorityB
    }

    // Within same priority, sort by updatedAt descending
    return (b.updatedAt || 0) - (a.updatedAt || 0)
  })
}

// ========================================================================
// Paginated Sync Manager
// ========================================================================

/**
 * Manages paginated loading of bookmarks to reduce memory pressure
 *
 * Usage:
 * ```
 * const pager = new PaginatedSyncManager(bookmarks)
 * for await (const page of pager.pages()) {
 *   applyBookmarksToYjs(page)
 *   updateProgress(pager.getProgress())
 * }
 * ```
 */
export class PaginatedSyncManager {
  constructor(bookmarks, options = {}) {
    this.options = {
      initialPageSize: PERFORMANCE_CONFIG.INITIAL_PAGE_SIZE,
      subsequentPageSize: PERFORMANCE_CONFIG.SUBSEQUENT_PAGE_SIZE,
      prioritize: true,
      ...options,
    }

    // Sort by priority if enabled
    this.bookmarks = this.options.prioritize
      ? sortBookmarksByPriority(bookmarks, options)
      : bookmarks

    this.totalCount = this.bookmarks.length
    this.processedCount = 0
    this.currentPage = 0
    this.isComplete = false
    this.startTime = null
    this.pageTimings = []
  }

  /**
   * Get the next page of bookmarks
   * @returns {Array|null} Next page of bookmarks or null if complete
   */
  getNextPage() {
    if (this.isComplete) {
      return null
    }

    if (this.startTime === null) {
      this.startTime = Date.now()
    }

    const pageStart = Date.now()
    const pageSize =
      this.currentPage === 0
        ? this.options.initialPageSize
        : this.options.subsequentPageSize

    const startIndex = this.processedCount
    const endIndex = Math.min(startIndex + pageSize, this.totalCount)
    const page = this.bookmarks.slice(startIndex, endIndex)

    this.processedCount = endIndex
    this.currentPage++
    this.isComplete = this.processedCount >= this.totalCount

    const pageEnd = Date.now()
    this.pageTimings.push({
      page: this.currentPage,
      count: page.length,
      durationMs: pageEnd - pageStart,
    })

    return page
  }

  /**
   * Async generator for iterating over pages
   * @param {number} [delayMs] - Optional delay between pages
   * @yields {Array} Page of bookmarks
   */
  async *pages(delayMs = PERFORMANCE_CONFIG.BATCH_OPERATION_DELAY_MS) {
    while (!this.isComplete) {
      const page = this.getNextPage()
      if (page && page.length > 0) {
        yield page
        if (delayMs > 0 && !this.isComplete) {
          await delay(delayMs)
        }
      }
    }
  }

  /**
   * Get current progress information
   * @returns {Object} Progress details
   */
  getProgress() {
    return {
      processed: this.processedCount,
      total: this.totalCount,
      percent: this.totalCount > 0
        ? Math.round((this.processedCount / this.totalCount) * 100)
        : 100,
      currentPage: this.currentPage,
      isComplete: this.isComplete,
      elapsedMs: this.startTime ? Date.now() - this.startTime : 0,
      pageTimings: this.pageTimings,
    }
  }

  /**
   * Reset the pager to start from the beginning
   */
  reset() {
    this.processedCount = 0
    this.currentPage = 0
    this.isComplete = false
    this.startTime = null
    this.pageTimings = []
  }
}

// ========================================================================
// Background Sync Coordinator
// ========================================================================

/**
 * Coordinates background syncing of non-critical bookmarks after UI render
 *
 * Ensures that:
 * - UI renders with critical/high-priority bookmarks first
 * - Background sync doesn't block main thread
 * - Memory pressure is monitored and respected
 * - Progress is reported for UI updates
 */
export class BackgroundSyncCoordinator {
  constructor(options = {}) {
    this.options = {
      onProgress: null, // Callback: (progress) => void
      onComplete: null, // Callback: (stats) => void
      onError: null, // Callback: (error) => void
      delayMs: PERFORMANCE_CONFIG.BACKGROUND_SYNC_DELAY_MS,
      ...options,
    }

    this.isRunning = false
    this.isPaused = false
    this.abortController = null
    this.stats = {
      started: null,
      completed: null,
      processed: 0,
      failed: 0,
      skipped: 0,
    }
  }

  /**
   * Start background sync for remaining bookmarks
   *
   * @param {Array} bookmarks - Bookmarks to sync
   * @param {Function} syncFn - Async function to apply each bookmark
   * @returns {Promise<Object>} Sync statistics
   */
  async start(bookmarks, syncFn) {
    if (this.isRunning) {
      console.warn('[BackgroundSync] Already running')
      return this.stats
    }

    this.isRunning = true
    this.isPaused = false
    this.abortController = new AbortController()
    this.stats = {
      started: Date.now(),
      completed: null,
      processed: 0,
      failed: 0,
      skipped: 0,
    }

    // Initial delay to let UI settle
    await delay(this.options.delayMs)

    const pager = new PaginatedSyncManager(bookmarks, {
      initialPageSize: PERFORMANCE_CONFIG.SUBSEQUENT_PAGE_SIZE,
      subsequentPageSize: PERFORMANCE_CONFIG.SUBSEQUENT_PAGE_SIZE,
      prioritize: false, // Already sorted
    })

    try {
      for await (const page of pager.pages()) {
        // Check if aborted
        if (this.abortController.signal.aborted) {
          break
        }

        // Wait while paused
        while (this.isPaused && !this.abortController.signal.aborted) {
          await delay(100)
        }

        // Check memory pressure
        if (await this._checkMemoryPressure()) {
          console.log('[BackgroundSync] Pausing due to memory pressure')
          await this._waitForMemoryRelief()
        }

        // Process page
        for (const bookmark of page) {
          try {
            await syncFn(bookmark)
            this.stats.processed++
          } catch (error) {
            this.stats.failed++
            if (this.options.onError) {
              this.options.onError(error)
            }
          }
        }

        // Report progress
        if (this.options.onProgress) {
          this.options.onProgress({
            ...pager.getProgress(),
            failed: this.stats.failed,
          })
        }
      }
    } finally {
      this.stats.completed = Date.now()
      this.isRunning = false

      if (this.options.onComplete) {
        this.options.onComplete(this.stats)
      }
    }

    return this.stats
  }

  /**
   * Pause background sync
   */
  pause() {
    this.isPaused = true
  }

  /**
   * Resume background sync
   */
  resume() {
    this.isPaused = false
  }

  /**
   * Stop background sync
   */
  stop() {
    if (this.abortController) {
      this.abortController.abort()
    }
    this.isRunning = false
    this.isPaused = false
  }

  /**
   * Check if memory pressure is high
   * @returns {Promise<boolean>}
   */
  async _checkMemoryPressure() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const { usedJSHeapSize, jsHeapSizeLimit } = performance.memory
      const ratio = usedJSHeapSize / jsHeapSizeLimit
      return ratio > PERFORMANCE_CONFIG.MEMORY_PRESSURE_THRESHOLD
    }
    return false
  }

  /**
   * Wait for memory to be released
   */
  async _waitForMemoryRelief() {
    let attempts = 0
    while (attempts < 10) {
      // Suggest garbage collection by releasing references
      if (typeof global !== 'undefined' && global.gc) {
        global.gc()
      }
      await delay(PERFORMANCE_CONFIG.MEMORY_CHECK_INTERVAL_MS)

      if (!(await this._checkMemoryPressure())) {
        return
      }
      attempts++
    }
    console.warn('[BackgroundSync] Memory pressure persists after waiting')
  }
}

// ========================================================================
// Intelligent Batch Operation Manager
// ========================================================================

/**
 * Manages batched operations with rate limiting and concurrency control
 *
 * Features:
 * - Configurable batch sizes and concurrency limits
 * - Automatic retry with exponential backoff
 * - Progress reporting
 * - Graceful degradation under load
 */
export class BatchOperationManager {
  constructor(options = {}) {
    this.options = {
      batchSize: PERFORMANCE_CONFIG.SUBSEQUENT_PAGE_SIZE,
      maxConcurrent: PERFORMANCE_CONFIG.MAX_CONCURRENT_OPERATIONS,
      retryAttempts: PERFORMANCE_CONFIG.MAX_RETRIES,
      retryBackoffMs: PERFORMANCE_CONFIG.RETRY_BACKOFF_BASE_MS,
      onProgress: null,
      ...options,
    }

    this.activeOperations = 0
    this.queue = []
    this.results = []
    this.errors = []
  }

  /**
   * Execute operations in batches with concurrency control
   *
   * @param {Array} items - Items to process
   * @param {Function} operationFn - Async function: (item) => result
   * @returns {Promise<Object>} Results and statistics
   */
  async executeBatch(items, operationFn) {
    const startTime = Date.now()
    this.results = []
    this.errors = []

    // Split into batches
    const batches = chunk(items, this.options.batchSize)
    let processedCount = 0

    for (const batch of batches) {
      // Process batch with concurrency limit
      const batchResults = await this._processBatchWithConcurrency(
        batch,
        operationFn
      )

      this.results.push(...batchResults.filter(r => r.success).map(r => r.result))
      this.errors.push(...batchResults.filter(r => !r.success).map(r => r.error))

      processedCount += batch.length

      // Report progress
      if (this.options.onProgress) {
        this.options.onProgress({
          processed: processedCount,
          total: items.length,
          percent: Math.round((processedCount / items.length) * 100),
          successCount: this.results.length,
          errorCount: this.errors.length,
        })
      }

      // Small delay between batches to prevent overwhelming the system
      await delay(PERFORMANCE_CONFIG.BATCH_OPERATION_DELAY_MS)
    }

    return {
      success: this.errors.length === 0,
      results: this.results,
      errors: this.errors,
      stats: {
        total: items.length,
        successful: this.results.length,
        failed: this.errors.length,
        durationMs: Date.now() - startTime,
      },
    }
  }

  /**
   * Process a batch with concurrency limit
   * @private
   */
  async _processBatchWithConcurrency(batch, operationFn) {
    const results = []
    const executing = []

    for (const item of batch) {
      const promise = this._executeWithRetry(item, operationFn)
        .then(result => ({ success: true, result }))
        .catch(error => ({ success: false, error }))

      results.push(promise)
      executing.push(promise)

      // Remove completed promises to free memory
      promise.finally(() => {
        const index = executing.indexOf(promise)
        if (index > -1) {
          executing.splice(index, 1)
        }
      })

      // Wait if at concurrency limit
      if (executing.length >= this.options.maxConcurrent) {
        await Promise.race(executing)
      }
    }

    return Promise.all(results)
  }

  /**
   * Execute operation with retry logic
   * @private
   */
  async _executeWithRetry(item, operationFn) {
    let lastError = null

    for (let attempt = 0; attempt <= this.options.retryAttempts; attempt++) {
      try {
        return await operationFn(item)
      } catch (error) {
        lastError = error

        if (attempt < this.options.retryAttempts) {
          // Exponential backoff
          const backoffMs =
            this.options.retryBackoffMs * Math.pow(2, attempt)
          await delay(backoffMs)
        }
      }
    }

    throw lastError
  }
}

// ========================================================================
// Lazy Loading Manager
// ========================================================================

/**
 * Manages lazy loading of bookmark details and previews
 *
 * Features:
 * - Loads only visible items initially
 * - Fetches additional data on-demand
 * - Caches loaded data to prevent re-fetching
 * - Supports intersection observer for viewport-based loading
 */
export class LazyLoadingManager {
  constructor(options = {}) {
    this.options = {
      preloadCount: 10, // Items to preload beyond viewport
      cacheSize: 500, // Max items to keep in cache
      ...options,
    }

    this.cache = new Map()
    this.loadingSet = new Set()
    this.observers = new Map()
  }

  /**
   * Register an item for lazy loading
   *
   * @param {string} id - Item identifier
   * @param {Function} loadFn - Async function to load item data
   * @returns {Object|null} Cached data if available
   */
  register(id, loadFn) {
    if (this.cache.has(id)) {
      return this.cache.get(id)
    }

    if (!this.loadingSet.has(id)) {
      this.observers.set(id, loadFn)
    }

    return null
  }

  /**
   * Trigger loading for an item
   *
   * @param {string} id - Item identifier
   * @returns {Promise<Object>} Loaded data
   */
  async load(id) {
    // Return cached data
    if (this.cache.has(id)) {
      return this.cache.get(id)
    }

    // Already loading
    if (this.loadingSet.has(id)) {
      return this._waitForLoad(id)
    }

    const loadFn = this.observers.get(id)
    if (!loadFn) {
      throw new Error(`No loader registered for: ${id}`)
    }

    this.loadingSet.add(id)

    try {
      const data = await loadFn()
      this._addToCache(id, data)
      return data
    } finally {
      this.loadingSet.delete(id)
    }
  }

  /**
   * Preload items that may be needed soon
   *
   * @param {Array} ids - Item identifiers to preload
   */
  async preload(ids) {
    const toLoad = ids
      .filter(id => !this.cache.has(id) && !this.loadingSet.has(id))
      .slice(0, this.options.preloadCount)

    await Promise.allSettled(toLoad.map(id => this.load(id)))
  }

  /**
   * Clear an item from cache
   * @param {string} id - Item identifier
   */
  invalidate(id) {
    this.cache.delete(id)
    this.observers.delete(id)
  }

  /**
   * Clear all cached data
   */
  clear() {
    this.cache.clear()
    this.observers.clear()
    this.loadingSet.clear()
  }

  /**
   * Add item to cache with LRU eviction
   * @private
   */
  _addToCache(id, data) {
    // Evict oldest entries if cache is full
    if (this.cache.size >= this.options.cacheSize) {
      const oldest = this.cache.keys().next().value
      this.cache.delete(oldest)
    }

    this.cache.set(id, data)
  }

  /**
   * Wait for an in-progress load to complete
   * @private
   */
  async _waitForLoad(id) {
    while (this.loadingSet.has(id)) {
      await delay(10)
    }
    return this.cache.get(id)
  }
}

// ========================================================================
// Network-Aware Sync Optimizer
// ========================================================================

/**
 * Optimizes sync behavior based on network conditions
 *
 * Features:
 * - Detects slow connections and adjusts batch sizes
 * - Implements adaptive retry logic
 * - Reduces sync frequency on poor networks
 */
export class NetworkAwareSyncOptimizer {
  constructor(options = {}) {
    this.options = {
      slowConnectionThresholdMs: PERFORMANCE_CONFIG.SLOW_CONNECTION_THRESHOLD_MS,
      minBatchSize: 10,
      maxBatchSize: PERFORMANCE_CONFIG.SUBSEQUENT_PAGE_SIZE,
      ...options,
    }

    this.latencyHistory = []
    this.isSlowConnection = false
    this.currentBatchSize = this.options.maxBatchSize
  }

  /**
   * Record a network operation latency
   *
   * @param {number} latencyMs - Operation latency in milliseconds
   */
  recordLatency(latencyMs) {
    this.latencyHistory.push(latencyMs)

    // Keep only last 10 measurements
    if (this.latencyHistory.length > 10) {
      this.latencyHistory.shift()
    }

    this._updateConnectionStatus()
  }

  /**
   * Get optimal batch size based on network conditions
   *
   * @returns {number} Recommended batch size
   */
  getOptimalBatchSize() {
    return this.currentBatchSize
  }

  /**
   * Get recommended debounce delay based on network conditions
   *
   * @returns {number} Recommended delay in milliseconds
   */
  getOptimalDebounceDelay() {
    if (this.isSlowConnection) {
      return 3000 // 3 seconds for slow connections
    }
    return 1500 // Default 1.5 seconds
  }

  /**
   * Check if network is considered slow
   *
   * @returns {boolean}
   */
  isNetworkSlow() {
    return this.isSlowConnection
  }

  /**
   * Get network statistics
   *
   * @returns {Object}
   */
  getStats() {
    const avgLatency = this.latencyHistory.length > 0
      ? this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length
      : 0

    return {
      averageLatencyMs: Math.round(avgLatency),
      isSlowConnection: this.isSlowConnection,
      currentBatchSize: this.currentBatchSize,
      sampleCount: this.latencyHistory.length,
    }
  }

  /**
   * Update connection status based on latency history
   * @private
   */
  _updateConnectionStatus() {
    if (this.latencyHistory.length < 3) {
      return // Not enough data
    }

    const avgLatency =
      this.latencyHistory.reduce((a, b) => a + b, 0) / this.latencyHistory.length

    const wasSlowConnection = this.isSlowConnection
    this.isSlowConnection = avgLatency > this.options.slowConnectionThresholdMs

    // Adjust batch size based on connection speed
    if (this.isSlowConnection) {
      this.currentBatchSize = Math.max(
        this.options.minBatchSize,
        Math.floor(this.currentBatchSize * 0.5)
      )
    } else if (wasSlowConnection && !this.isSlowConnection) {
      // Connection improved, gradually increase batch size
      this.currentBatchSize = Math.min(
        this.options.maxBatchSize,
        Math.floor(this.currentBatchSize * 1.5)
      )
    }
  }
}

// ========================================================================
// Memory Manager
// ========================================================================

/**
 * Monitors and manages memory usage during sync operations
 */
export class MemoryManager {
  constructor(options = {}) {
    this.options = {
      pressureThreshold: PERFORMANCE_CONFIG.MEMORY_PRESSURE_THRESHOLD,
      checkIntervalMs: PERFORMANCE_CONFIG.MEMORY_CHECK_INTERVAL_MS,
      onPressure: null, // Callback when memory pressure detected
      ...options,
    }

    this.isMonitoring = false
    this.intervalId = null
    this.lastReading = null
  }

  /**
   * Start memory monitoring
   */
  startMonitoring() {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.intervalId = setInterval(() => {
      this._checkMemory()
    }, this.options.checkIntervalMs)
  }

  /**
   * Stop memory monitoring
   */
  stopMonitoring() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.isMonitoring = false
  }

  /**
   * Get current memory usage
   *
   * @returns {Object|null} Memory usage info or null if not available
   */
  getMemoryUsage() {
    if (typeof performance !== 'undefined' && performance.memory) {
      const { usedJSHeapSize, totalJSHeapSize, jsHeapSizeLimit } = performance.memory
      return {
        used: usedJSHeapSize,
        total: totalJSHeapSize,
        limit: jsHeapSizeLimit,
        usageRatio: usedJSHeapSize / jsHeapSizeLimit,
        isUnderPressure: usedJSHeapSize / jsHeapSizeLimit > this.options.pressureThreshold,
      }
    }
    return null
  }

  /**
   * Suggest memory cleanup
   * Called when memory pressure is detected
   */
  suggestCleanup() {
    // Clear any caches that can be cleared
    if (typeof caches !== 'undefined') {
      // Browser Cache API - let the browser manage this
    }

    // Suggest GC if available (Node.js with --expose-gc)
    if (typeof global !== 'undefined' && global.gc) {
      global.gc()
    }
  }

  /**
   * @private
   */
  _checkMemory() {
    const usage = this.getMemoryUsage()
    if (!usage) return

    this.lastReading = usage

    if (usage.isUnderPressure && this.options.onPressure) {
      this.options.onPressure(usage)
    }
  }
}

// ========================================================================
// Performance Manager (Main Entry Point)
// ========================================================================

/**
 * Main entry point for sync performance optimizations
 *
 * Coordinates all performance optimization components and provides
 * a unified API for the application.
 */
export class SyncPerformanceManager {
  constructor(options = {}) {
    this.options = {
      enablePagination: true,
      enableBackgroundSync: true,
      enableNetworkOptimization: true,
      enableMemoryManagement: true,
      ...options,
    }

    // Initialize components
    this.paginatedSync = null
    this.backgroundSync = new BackgroundSyncCoordinator({
      onProgress: options.onBackgroundProgress,
      onComplete: options.onBackgroundComplete,
      onError: options.onBackgroundError,
    })
    this.batchManager = new BatchOperationManager({
      onProgress: options.onBatchProgress,
    })
    this.lazyLoader = new LazyLoadingManager()
    this.networkOptimizer = new NetworkAwareSyncOptimizer()
    this.memoryManager = new MemoryManager({
      onPressure: (usage) => this._handleMemoryPressure(usage),
    })

    // State
    this.isLargeCollection = false
  }

  /**
   * Initialize performance manager for a sync session
   *
   * @param {number} bookmarkCount - Total number of bookmarks
   */
  initialize(bookmarkCount) {
    this.isLargeCollection =
      bookmarkCount >= PERFORMANCE_CONFIG.LARGE_COLLECTION_THRESHOLD

    if (this.options.enableMemoryManagement && this.isLargeCollection) {
      this.memoryManager.startMonitoring()
    }

    console.log('[SyncPerformance] Initialized', {
      bookmarkCount,
      isLargeCollection: this.isLargeCollection,
    })
  }

  /**
   * Process initial sync with pagination and prioritization
   *
   * @param {Array} bookmarks - All bookmarks to sync
   * @param {Function} applyFn - Function to apply a page of bookmarks
   * @param {Object} options - Processing options
   * @returns {Promise<Object>} Sync results
   */
  async processInitialSync(bookmarks, applyFn, options = {}) {
    const { onProgress, onFirstPageComplete } = options

    // Sort by priority
    const sorted = sortBookmarksByPriority(bookmarks, options)

    // Split into critical/high priority and rest
    const criticalCount = Math.min(
      PERFORMANCE_CONFIG.INITIAL_PAGE_SIZE,
      sorted.length
    )
    const criticalBookmarks = sorted.slice(0, criticalCount)
    const remainingBookmarks = sorted.slice(criticalCount)

    const startTime = Date.now()

    // 1. Load critical bookmarks synchronously for immediate UI
    console.log('[SyncPerformance] Loading critical bookmarks:', criticalCount)
    await applyFn(criticalBookmarks)

    if (onFirstPageComplete) {
      onFirstPageComplete({
        count: criticalBookmarks.length,
        durationMs: Date.now() - startTime,
      })
    }

    // 2. Load remaining bookmarks in background
    if (remainingBookmarks.length > 0 && this.options.enableBackgroundSync) {
      console.log('[SyncPerformance] Starting background sync:', remainingBookmarks.length)

      this.backgroundSync.start(remainingBookmarks, async (bookmark) => {
        await applyFn([bookmark])
      })
    }

    return {
      critical: criticalBookmarks.length,
      background: remainingBookmarks.length,
      total: bookmarks.length,
    }
  }

  /**
   * Execute a bulk operation with optimizations
   *
   * @param {Array} items - Items to process
   * @param {Function} operationFn - Operation to perform on each item
   * @returns {Promise<Object>} Operation results
   */
  async executeBulkOperation(items, operationFn) {
    // Adjust batch size based on network conditions
    if (this.options.enableNetworkOptimization) {
      this.batchManager.options.batchSize =
        this.networkOptimizer.getOptimalBatchSize()
    }

    return this.batchManager.executeBatch(items, operationFn)
  }

  /**
   * Record network latency for optimization
   *
   * @param {number} latencyMs - Operation latency
   */
  recordNetworkLatency(latencyMs) {
    if (this.options.enableNetworkOptimization) {
      this.networkOptimizer.recordLatency(latencyMs)
    }
  }

  /**
   * Get recommended sync parameters based on current conditions
   *
   * @returns {Object} Recommended parameters
   */
  getRecommendedParameters() {
    return {
      batchSize: this.networkOptimizer.getOptimalBatchSize(),
      debounceDelay: this.networkOptimizer.getOptimalDebounceDelay(),
      enableBackgroundSync: this.isLargeCollection,
      networkStats: this.networkOptimizer.getStats(),
      memoryUsage: this.memoryManager.getMemoryUsage(),
    }
  }

  /**
   * Pause all background operations
   */
  pauseBackgroundOperations() {
    this.backgroundSync.pause()
  }

  /**
   * Resume background operations
   */
  resumeBackgroundOperations() {
    this.backgroundSync.resume()
  }

  /**
   * Stop all operations and cleanup
   */
  shutdown() {
    this.backgroundSync.stop()
    this.memoryManager.stopMonitoring()
    this.lazyLoader.clear()
  }

  /**
   * Handle memory pressure event
   * @private
   */
  _handleMemoryPressure(usage) {
    console.warn('[SyncPerformance] Memory pressure detected:', usage)

    // Pause background sync
    this.backgroundSync.pause()

    // Clear lazy loading cache
    this.lazyLoader.clear()

    // Suggest cleanup
    this.memoryManager.suggestCleanup()

    // Resume after a delay
    setTimeout(() => {
      const currentUsage = this.memoryManager.getMemoryUsage()
      if (currentUsage && !currentUsage.isUnderPressure) {
        this.backgroundSync.resume()
      }
    }, PERFORMANCE_CONFIG.MEMORY_CHECK_INTERVAL_MS)
  }
}

// ========================================================================
// Utility Functions
// ========================================================================

/**
 * Delay execution for a specified time
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise<void>}
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Split an array into chunks
 * @param {Array} array - Array to chunk
 * @param {number} size - Chunk size
 * @returns {Array<Array>} Array of chunks
 */
function chunk(array, size) {
  const chunks = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}

// ========================================================================
// Exports
// ========================================================================

export {
  delay,
  chunk,
}

export default SyncPerformanceManager
