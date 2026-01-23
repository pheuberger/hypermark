/**
 * E2E Test Utilities
 * Shared helper functions for Playwright tests
 */

/**
 * Wait for the application to be fully loaded
 */
export async function waitForAppLoad(page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForLoadState('networkidle');

  // Wait for the main app content to be visible
  await page.waitForSelector('[data-testid="app-content"], .bookmark-manager, .pairing-interface', {
    timeout: 10000
  });
}

/**
 * Clear all browser storage (localStorage, indexedDB, etc.)
 */
export async function clearBrowserStorage(page) {
  await page.evaluate(() => {
    // Clear localStorage
    localStorage.clear();

    // Clear sessionStorage
    sessionStorage.clear();

    // Clear indexedDB
    if ('indexedDB' in window) {
      indexedDB.databases().then(databases => {
        databases.forEach(({ name }) => {
          if (name) {
            indexedDB.deleteDatabase(name);
          }
        });
      });
    }
  });
}

/**
 * Generate test bookmark data
 */
export function generateTestBookmark(index = 0) {
  return {
    title: `Test Bookmark ${index}`,
    url: `https://example.com/page-${index}`,
    description: `Test description for bookmark ${index}`,
    tags: [`tag${index}`, `category${index % 3}`],
    folder: index % 2 === 0 ? 'Work' : 'Personal'
  };
}

/**
 * Generate multiple test bookmarks
 */
export function generateTestBookmarks(count = 10) {
  return Array.from({ length: count }, (_, i) => generateTestBookmark(i));
}

/**
 * Add a bookmark through the UI
 */
export async function addBookmarkViaUI(page, bookmark) {
  // Look for add bookmark button
  await page.click('[data-testid="add-bookmark"], .add-bookmark-btn, [aria-label*="add"], button:has-text("Add")');

  // Fill in bookmark details
  await page.fill('[data-testid="bookmark-title"], input[placeholder*="title"]', bookmark.title);
  await page.fill('[data-testid="bookmark-url"], input[placeholder*="url"]', bookmark.url);

  if (bookmark.description) {
    await page.fill('[data-testid="bookmark-description"], textarea[placeholder*="description"]', bookmark.description);
  }

  if (bookmark.tags && bookmark.tags.length > 0) {
    // Handle tags input
    const tagsInput = page.locator('[data-testid="bookmark-tags"], input[placeholder*="tag"]');
    if (await tagsInput.isVisible()) {
      await tagsInput.fill(bookmark.tags.join(', '));
    }
  }

  // Save the bookmark
  await page.click('[data-testid="save-bookmark"], button:has-text("Save"), button:has-text("Add")');

  // Wait for the bookmark to appear in the list
  await page.waitForSelector(`[data-testid="bookmark-${bookmark.title}"], .bookmark-item:has-text("${bookmark.title}")`, {
    timeout: 5000
  });
}

/**
 * Search for bookmarks
 */
export async function searchBookmarks(page, query) {
  const searchInput = page.locator('[data-testid="search-input"], input[placeholder*="search"]');
  await searchInput.fill(query);
  await searchInput.press('Enter');

  // Wait for search results to update
  await page.waitForTimeout(500);
}

/**
 * Start device pairing flow
 */
export async function startPairingAsInitiator(page) {
  // Navigate to pairing section
  await page.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');

  // Start as initiator (show code)
  await page.click('[data-testid="show-pairing-code"], button:has-text("Show"), button:has-text("Generate")');

  // Wait for pairing code to be generated
  await page.waitForSelector('[data-testid="pairing-code"], .pairing-code, code', {
    timeout: 10000
  });

  // Get the pairing code
  const codeElement = page.locator('[data-testid="pairing-code"], .pairing-code, code').first();
  const pairingCode = await codeElement.textContent();

  return pairingCode.trim();
}

/**
 * Join pairing using a code
 */
export async function joinPairingAsResponder(page, pairingCode) {
  // Navigate to pairing section
  await page.click('[data-testid="pairing-section"], [href*="pair"], button:has-text("Pair")');

  // Start as responder (enter code)
  await page.click('[data-testid="enter-pairing-code"], button:has-text("Enter"), button:has-text("Join")');

  // Enter the pairing code
  await page.fill('[data-testid="pairing-code-input"], input[placeholder*="code"]', pairingCode);

  // Submit the code
  await page.click('[data-testid="connect-button"], button:has-text("Connect"), button:has-text("Join")');

  // Wait for pairing to complete
  await page.waitForSelector('[data-testid="pairing-success"], .pairing-complete, :has-text("successful")', {
    timeout: 30000
  });
}

/**
 * Wait for pairing to complete successfully
 */
export async function waitForPairingComplete(page, timeout = 30000) {
  await page.waitForSelector([
    '[data-testid="pairing-success"]',
    '.pairing-complete',
    ':has-text("Pairing Complete")',
    ':has-text("successfully")'
  ].join(', '), { timeout });
}

/**
 * Simulate network conditions
 */
export async function simulateNetworkConditions(page, conditions) {
  const context = page.context();

  switch (conditions) {
    case 'slow':
      await context.setOffline(false);
      await context.addRequestListener(request => {
        // Simulate slow network by delaying requests
        return new Promise(resolve => {
          setTimeout(() => resolve(request.continue()), 1000);
        });
      });
      break;

    case 'offline':
      await context.setOffline(true);
      break;

    case 'intermittent':
      // Randomly drop some requests
      await context.addRequestListener(request => {
        if (Math.random() < 0.3) {
          return request.abort('connectionrefused');
        }
        return request.continue();
      });
      break;

    default:
      await context.setOffline(false);
  }
}

/**
 * Check that bookmark exists in the UI
 */
export async function expectBookmarkExists(page, bookmarkTitle) {
  await page.waitForSelector(`[data-testid="bookmark-${bookmarkTitle}"], .bookmark-item:has-text("${bookmarkTitle}")`, {
    timeout: 5000
  });
}

/**
 * Check that bookmark count matches expected
 */
export async function expectBookmarkCount(page, expectedCount) {
  await page.waitForFunction(
    count => {
      const bookmarks = document.querySelectorAll('[data-testid^="bookmark-"], .bookmark-item');
      return bookmarks.length === count;
    },
    expectedCount,
    { timeout: 5000 }
  );
}

/**
 * Wait for sync to complete between devices
 */
export async function waitForSyncComplete(page, timeout = 10000) {
  // Look for sync indicators
  await page.waitForFunction(
    () => {
      // Check if sync is idle (no sync indicators showing)
      const syncIndicators = document.querySelectorAll('[data-testid="sync-status"], .sync-indicator, .syncing');
      return syncIndicators.length === 0 ||
             Array.from(syncIndicators).every(el =>
               el.textContent.includes('synced') ||
               el.textContent.includes('idle') ||
               el.classList.contains('hidden')
             );
    },
    { timeout }
  );
}