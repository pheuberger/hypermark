import { test, expect } from '../fixtures/test-data.js';
import { generateLargeBookmarkDataset } from '../fixtures/test-data.js';
import {
  searchBookmarks,
  expectBookmarkCount,
  addBookmarkViaUI,
  waitForSyncComplete
} from '../utils/test-helpers.js';

/**
 * Performance E2E Tests
 *
 * Tests application performance under various load conditions:
 * - Large dataset handling
 * - Search performance
 * - Memory usage monitoring
 * - UI responsiveness
 * - Sync performance with large datasets
 */

test.describe('Performance Tests', () => {
  test('application handles 1000 bookmarks efficiently', async ({ cleanPage }) => {
    // Generate large dataset
    const largeDataset = generateLargeBookmarkDataset(1000);

    // Pre-load bookmarks via storage manipulation for faster setup
    await cleanPage.evaluate((bookmarks) => {
      const bookmarkData = bookmarks.map((bookmark, index) => ({
        ...bookmark,
        id: `bookmark-${index}`,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }));

      // Store in localStorage
      localStorage.setItem('hypermark-bookmarks', JSON.stringify(bookmarkData));

      // Trigger storage event
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'hypermark-bookmarks',
        newValue: JSON.stringify(bookmarkData)
      }));
    }, largeDataset);

    // Reload to apply data
    await cleanPage.reload();
    await cleanPage.waitForLoadState('networkidle');

    // Measure page load time with large dataset
    const startTime = Date.now();
    await cleanPage.waitForSelector('.bookmark-item, [data-testid^="bookmark-"]', { timeout: 30000 });
    const loadTime = Date.now() - startTime;

    // Should load within reasonable time (under 5 seconds)
    expect(loadTime).toBeLessThan(5000);

    // Verify bookmark count
    await expectBookmarkCount(cleanPage, 1000);
  });

  test('search performance with large dataset', async ({ cleanPage }) => {
    const largeDataset = generateLargeBookmarkDataset(500);

    // Pre-load data
    await cleanPage.evaluate((bookmarks) => {
      localStorage.setItem('hypermark-bookmarks', JSON.stringify(bookmarks));
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'hypermark-bookmarks',
        newValue: JSON.stringify(bookmarks)
      }));
    }, largeDataset);

    await cleanPage.reload();
    await cleanPage.waitForSelector('.bookmark-item, [data-testid^="bookmark-"]');

    // Test various search scenarios
    const searchTests = [
      'javascript',
      'tutorial',
      'documentation',
      'github',
      'react'
    ];

    for (const query of searchTests) {
      const searchStart = Date.now();
      await searchBookmarks(cleanPage, query);
      const searchTime = Date.now() - searchStart;

      // Search should complete within 500ms
      expect(searchTime).toBeLessThan(500);

      // Should return some results
      const resultCount = await cleanPage.locator('.bookmark-item, [data-testid^="bookmark-"]').count();
      expect(resultCount).toBeGreaterThan(0);

      // Clear search for next test
      await searchBookmarks(cleanPage, '');
    }
  });

  test('memory usage remains stable during extended usage', async ({ cleanPage }) => {
    // Monitor memory usage during various operations
    const initialMemory = await cleanPage.evaluate(() => {
      return performance.memory ? {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize
      } : null;
    });

    if (!initialMemory) {
      test.skip('Performance memory API not available');
    }

    // Add many bookmarks
    for (let i = 0; i < 100; i++) {
      await addBookmarkViaUI(cleanPage, {
        title: `Memory Test Bookmark ${i}`,
        url: `https://memory-test-${i}.example.com`,
        description: `Memory test bookmark ${i}`.repeat(10) // Make descriptions longer
      });

      // Check memory every 25 bookmarks
      if (i % 25 === 24) {
        const currentMemory = await cleanPage.evaluate(() => ({
          usedJSHeapSize: performance.memory.usedJSHeapSize,
          totalJSHeapSize: performance.memory.totalJSHeapSize
        }));

        // Memory growth should be reasonable (less than 50MB increase)
        const memoryIncrease = currentMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
        expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024); // 50MB
      }
    }

    // Force garbage collection if available
    await cleanPage.evaluate(() => {
      if (window.gc) {
        window.gc();
      }
    });

    const finalMemory = await cleanPage.evaluate(() => ({
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize
    }));

    // Final memory usage should be reasonable
    const totalIncrease = finalMemory.usedJSHeapSize - initialMemory.usedJSHeapSize;
    expect(totalIncrease).toBeLessThan(100 * 1024 * 1024); // 100MB max
  });

  test('UI responsiveness under heavy load', async ({ cleanPage }) => {
    // Pre-load large dataset
    const dataset = generateLargeBookmarkDataset(500);
    await cleanPage.evaluate((bookmarks) => {
      localStorage.setItem('hypermark-bookmarks', JSON.stringify(bookmarks));
    }, dataset);

    await cleanPage.reload();
    await cleanPage.waitForLoadState('networkidle');

    // Test UI responsiveness
    const responsivenesTests = [
      {
        action: 'scroll',
        test: async () => {
          const startTime = Date.now();
          await cleanPage.mouse.wheel(0, 1000);
          await cleanPage.waitForTimeout(100);
          return Date.now() - startTime;
        }
      },
      {
        action: 'search',
        test: async () => {
          const startTime = Date.now();
          await cleanPage.fill('[data-testid="search-input"], input[placeholder*="search"]', 'test');
          await cleanPage.waitForTimeout(200);
          return Date.now() - startTime;
        }
      },
      {
        action: 'click',
        test: async () => {
          const startTime = Date.now();
          await cleanPage.click('.bookmark-item, [data-testid^="bookmark-"]:first-child');
          await cleanPage.waitForTimeout(100);
          return Date.now() - startTime;
        }
      }
    ];

    for (const { action, test } of responsivenesTests) {
      const responseTime = await test();

      // UI actions should feel responsive (under 200ms)
      expect(responseTime).toBeLessThan(200);
      console.log(`${action} response time: ${responseTime}ms`);
    }
  });

  test('sync performance with large datasets', async ({ devicePair }) => {
    const { device1, device2 } = devicePair;

    // Establish pairing
    const startPairingAsInitiator = async (page) => {
      await page.click('[data-testid="pairing-section"], button:has-text("Pair")');
      await page.click('[data-testid="show-pairing-code"], button:has-text("Show")');
      await page.waitForSelector('[data-testid="pairing-code"], .pairing-code');
      return await page.locator('[data-testid="pairing-code"], .pairing-code').first().textContent();
    };

    const joinPairingAsResponder = async (page, code) => {
      await page.click('[data-testid="pairing-section"], button:has-text("Pair")');
      await page.click('[data-testid="enter-pairing-code"], button:has-text("Enter")');
      await page.fill('[data-testid="pairing-code-input"]', code);
      await page.click('[data-testid="connect-button"], button:has-text("Connect")');
      await page.waitForSelector('[data-testid="pairing-success"], .pairing-complete');
    };

    const code = await startPairingAsInitiator(device1);
    await joinPairingAsResponder(device2, code.trim());

    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Add large dataset to device1
    const syncStartTime = Date.now();
    const bookmarkCount = 200;

    for (let i = 0; i < bookmarkCount; i++) {
      await addBookmarkViaUI(device1, {
        title: `Sync Performance Test ${i}`,
        url: `https://sync-perf-${i}.example.com`,
        description: `Performance test bookmark ${i}`
      });

      // Sync in batches
      if (i % 20 === 19) {
        await waitForSyncComplete(device1);
      }
    }

    // Wait for final sync to device2
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    const totalSyncTime = Date.now() - syncStartTime;

    // Verify all bookmarks synced
    await expectBookmarkCount(device2, bookmarkCount);

    // Sync should complete within reasonable time (under 2 minutes)
    expect(totalSyncTime).toBeLessThan(120000); // 2 minutes

    console.log(`Synced ${bookmarkCount} bookmarks in ${totalSyncTime}ms`);
  });

  test('app remains usable during background operations', async ({ cleanPage }) => {
    // Start a long-running operation (like import)
    await cleanPage.click('[data-testid="import-bookmarks"], button:has-text("Import")');

    // Simulate large import file
    const largeImportData = generateLargeBookmarkDataset(1000);
    await cleanPage.evaluate((data) => {
      // Simulate slow import process
      let processed = 0;
      const processChunk = () => {
        const chunk = data.slice(processed, processed + 50);
        // Simulate processing
        chunk.forEach(bookmark => {
          const existing = JSON.parse(localStorage.getItem('hypermark-bookmarks') || '[]');
          existing.push({...bookmark, id: `import-${processed++}`});
          localStorage.setItem('hypermark-bookmarks', JSON.stringify(existing));
        });

        if (processed < data.length) {
          setTimeout(processChunk, 100); // Continue processing
        }
      };
      processChunk();
    }, largeImportData);

    // App should remain responsive during import
    const uiTests = [
      async () => await cleanPage.click('[data-testid="bookmarks-tab"], .nav-bookmarks'),
      async () => await cleanPage.fill('[data-testid="search-input"]', 'test'),
      async () => await cleanPage.click('[data-testid="settings"], button:has-text("Settings")')
    ];

    for (const uiTest of uiTests) {
      const startTime = Date.now();
      await uiTest();
      const responseTime = Date.now() - startTime;

      // UI should remain responsive (under 500ms)
      expect(responseTime).toBeLessThan(500);
    }
  });

  test('performance metrics are within acceptable ranges', async ({ cleanPage }) => {
    // Measure various performance metrics
    await cleanPage.goto('/');

    const metrics = await cleanPage.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0];
      const paint = performance.getEntriesByType('paint');

      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: paint.find(p => p.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: paint.find(p => p.name === 'first-contentful-paint')?.startTime || 0
      };
    });

    // Performance thresholds
    expect(metrics.domContentLoaded).toBeLessThan(1000); // Under 1 second
    expect(metrics.loadComplete).toBeLessThan(2000);     // Under 2 seconds
    expect(metrics.firstPaint).toBeLessThan(1000);       // Under 1 second
    expect(metrics.firstContentfulPaint).toBeLessThan(1500); // Under 1.5 seconds

    console.log('Performance metrics:', metrics);
  });
});