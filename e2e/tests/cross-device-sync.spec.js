import { test, expect } from '../fixtures/test-data.js';
import {
  startPairingAsInitiator,
  joinPairingAsResponder,
  waitForPairingComplete,
  addBookmarkViaUI,
  expectBookmarkExists,
  expectBookmarkCount,
  waitForSyncComplete,
  simulateNetworkConditions
} from '../utils/test-helpers.js';

/**
 * Cross-Device Sync E2E Tests
 *
 * Tests bookmark synchronization between paired devices:
 * - Real-time sync after pairing
 * - Conflict resolution
 * - Network resilience
 * - Large dataset sync
 * - Bidirectional updates
 */

test.describe('Cross-Device Sync', () => {
  let pairedDevices;

  test.beforeEach(async ({ devicePair }) => {
    pairedDevices = devicePair;
    const { device1, device2 } = pairedDevices;

    // Establish pairing between devices
    const pairingCode = await startPairingAsInitiator(device1);
    await joinPairingAsResponder(device2, pairingCode);

    await Promise.all([
      waitForPairingComplete(device1),
      waitForPairingComplete(device2)
    ]);

    // Wait for initial sync to stabilize
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);
  });

  test('bookmark created on device1 appears on device2', async () => {
    const { device1, device2 } = pairedDevices;

    const testBookmark = {
      title: 'Sync Test Bookmark',
      url: 'https://sync-test.example.com',
      description: 'Testing cross-device synchronization',
      tags: ['sync', 'test']
    };

    // Add bookmark on device1
    await addBookmarkViaUI(device1, testBookmark);

    // Wait for sync
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify bookmark appears on device2
    await expectBookmarkExists(device2, testBookmark.title);

    // Verify bookmark details are correct
    await device2.click(`[data-testid="bookmark-${testBookmark.title}"], .bookmark-item:has-text("${testBookmark.title}")`);
    await expect(device2.locator(`:has-text("${testBookmark.url}")`)).toBeVisible();
    await expect(device2.locator(`:has-text("${testBookmark.description}")`)).toBeVisible();
  });

  test('bookmark updated on device2 syncs to device1', async () => {
    const { device1, device2 } = pairedDevices;

    // Add initial bookmark on device1
    const originalBookmark = {
      title: 'Original Bookmark',
      url: 'https://original.example.com',
      description: 'Original description'
    };

    await addBookmarkViaUI(device1, originalBookmark);
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Update bookmark on device2
    await device2.click(`[data-testid="bookmark-${originalBookmark.title}"], .bookmark-item:has-text("${originalBookmark.title}")`);
    await device2.click('[data-testid="edit-bookmark"], button:has-text("Edit")');

    const updatedDescription = 'Updated description from device2';
    await device2.fill('[data-testid="bookmark-description"], textarea[name="description"]', updatedDescription);
    await device2.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Wait for sync
    await waitForSyncComplete(device2);
    await waitForSyncComplete(device1);

    // Verify update appears on device1
    await device1.click(`[data-testid="bookmark-${originalBookmark.title}"], .bookmark-item:has-text("${originalBookmark.title}")`);
    await expect(device1.locator(`:has-text("${updatedDescription}")`)).toBeVisible();
  });

  test('bookmark deleted on device1 removes from device2', async () => {
    const { device1, device2 } = pairedDevices;

    // Add bookmark on device1
    const bookmarkToDelete = {
      title: 'Delete Test Bookmark',
      url: 'https://delete-test.example.com'
    };

    await addBookmarkViaUI(device1, bookmarkToDelete);
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify bookmark exists on both devices
    await expectBookmarkExists(device1, bookmarkToDelete.title);
    await expectBookmarkExists(device2, bookmarkToDelete.title);

    // Delete bookmark on device1
    await device1.click(`[data-testid="bookmark-${bookmarkToDelete.title}"], .bookmark-item:has-text("${bookmarkToDelete.title}")`);
    await device1.click('[data-testid="delete-bookmark"], button:has-text("Delete")');
    await device1.click('[data-testid="confirm-delete"], button:has-text("Confirm")');

    // Wait for sync
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify bookmark is removed from device2
    await expect(device2.locator(`[data-testid="bookmark-${bookmarkToDelete.title}"]`)).not.toBeVisible();
  });

  test('conflict resolution when both devices modify same bookmark', async () => {
    const { device1, device2 } = pairedDevices;

    // Add initial bookmark
    const initialBookmark = {
      title: 'Conflict Test Bookmark',
      url: 'https://conflict-test.example.com',
      description: 'Initial description'
    };

    await addBookmarkViaUI(device1, initialBookmark);
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Simulate network interruption to create conflict scenario
    await simulateNetworkConditions(device1, 'offline');
    await simulateNetworkConditions(device2, 'offline');

    // Modify bookmark differently on both devices
    await device1.click(`[data-testid="bookmark-${initialBookmark.title}"], .bookmark-item:has-text("${initialBookmark.title}")`);
    await device1.click('[data-testid="edit-bookmark"], button:has-text("Edit")');
    await device1.fill('[data-testid="bookmark-description"], textarea[name="description"]', 'Modified on device1');
    await device1.click('[data-testid="save-bookmark"], button:has-text("Save")');

    await device2.click(`[data-testid="bookmark-${initialBookmark.title}"], .bookmark-item:has-text("${initialBookmark.title}")`);
    await device2.click('[data-testid="edit-bookmark"], button:has-text("Edit")');
    await device2.fill('[data-testid="bookmark-description"], textarea[name="description"]', 'Modified on device2');
    await device2.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Restore network connectivity
    await simulateNetworkConditions(device1, 'online');
    await simulateNetworkConditions(device2, 'online');

    // Wait for conflict resolution
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify conflict is resolved (both devices should have consistent data)
    // The exact resolution strategy depends on the implementation (last-write-wins, merge, etc.)
    await device1.click(`[data-testid="bookmark-${initialBookmark.title}"], .bookmark-item:has-text("${initialBookmark.title}")`);
    const device1Text = await device1.locator('[data-testid="bookmark-description"], .bookmark-description').textContent();

    await device2.click(`[data-testid="bookmark-${initialBookmark.title}"], .bookmark-item:has-text("${initialBookmark.title}")`);
    const device2Text = await device2.locator('[data-testid="bookmark-description"], .bookmark-description').textContent();

    // Both devices should have the same final state
    expect(device1Text).toBe(device2Text);
  });

  test('sync handles large dataset efficiently', async () => {
    const { device1, device2 } = pairedDevices;

    // Add many bookmarks on device1
    const bookmarkCount = 50;
    const bookmarks = [];

    for (let i = 0; i < bookmarkCount; i++) {
      const bookmark = {
        title: `Bulk Bookmark ${i}`,
        url: `https://bulk-test-${i}.example.com`,
        description: `Bulk test bookmark number ${i}`,
        tags: [`bulk`, `test${i % 5}`]
      };

      bookmarks.push(bookmark);
      await addBookmarkViaUI(device1, bookmark);

      // Sync in batches to avoid overwhelming the system
      if (i % 10 === 9) {
        await waitForSyncComplete(device1);
      }
    }

    // Wait for final sync
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify all bookmarks synced to device2
    await expectBookmarkCount(device2, bookmarkCount);

    // Spot check a few bookmarks
    await expectBookmarkExists(device2, 'Bulk Bookmark 0');
    await expectBookmarkExists(device2, 'Bulk Bookmark 25');
    await expectBookmarkExists(device2, 'Bulk Bookmark 49');
  });

  test('sync recovers after extended network outage', async () => {
    const { device1, device2 } = pairedDevices;

    // Add some bookmarks while both devices are online
    await addBookmarkViaUI(device1, {
      title: 'Pre-Outage Bookmark',
      url: 'https://pre-outage.example.com'
    });

    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Simulate extended network outage on device2
    await simulateNetworkConditions(device2, 'offline');

    // Add more bookmarks on device1 while device2 is offline
    const offlineBookmarks = [];
    for (let i = 0; i < 5; i++) {
      const bookmark = {
        title: `Offline Bookmark ${i}`,
        url: `https://offline-${i}.example.com`
      };
      offlineBookmarks.push(bookmark);
      await addBookmarkViaUI(device1, bookmark);
    }

    await waitForSyncComplete(device1);

    // Restore network on device2
    await simulateNetworkConditions(device2, 'online');

    // Wait for catch-up sync
    await waitForSyncComplete(device2, 30000); // Longer timeout for catch-up

    // Verify all offline changes synced to device2
    for (const bookmark of offlineBookmarks) {
      await expectBookmarkExists(device2, bookmark.title);
    }
  });

  test('bidirectional sync works simultaneously', async () => {
    const { device1, device2 } = pairedDevices;

    // Add bookmarks on both devices simultaneously
    const device1Bookmarks = [
      { title: 'Device1 Bookmark A', url: 'https://d1a.example.com' },
      { title: 'Device1 Bookmark B', url: 'https://d1b.example.com' }
    ];

    const device2Bookmarks = [
      { title: 'Device2 Bookmark A', url: 'https://d2a.example.com' },
      { title: 'Device2 Bookmark B', url: 'https://d2b.example.com' }
    ];

    // Add bookmarks in parallel
    await Promise.all([
      ...device1Bookmarks.map(bookmark => addBookmarkViaUI(device1, bookmark)),
      ...device2Bookmarks.map(bookmark => addBookmarkViaUI(device2, bookmark))
    ]);

    // Wait for sync
    await waitForSyncComplete(device1);
    await waitForSyncComplete(device2);

    // Verify all bookmarks appear on both devices
    const allBookmarks = [...device1Bookmarks, ...device2Bookmarks];

    for (const bookmark of allBookmarks) {
      await expectBookmarkExists(device1, bookmark.title);
      await expectBookmarkExists(device2, bookmark.title);
    }

    // Both devices should have the same total count
    await expectBookmarkCount(device1, allBookmarks.length);
    await expectBookmarkCount(device2, allBookmarks.length);
  });

  test('sync status indicators provide user feedback', async () => {
    const { device1, device2 } = pairedDevices;

    // Add a bookmark and watch for sync status
    await addBookmarkViaUI(device1, {
      title: 'Status Test Bookmark',
      url: 'https://status-test.example.com'
    });

    // Should show syncing status
    await expect(device1.locator('[data-testid="sync-status"], .sync-indicator:has-text("syncing")')).toBeVisible({ timeout: 2000 });

    // Wait for sync to complete
    await waitForSyncComplete(device1);

    // Should show synced status
    await expect(device1.locator('[data-testid="sync-status"], .sync-indicator:has-text("synced")')).toBeVisible();
  });

  test('partial sync failure recovery', async () => {
    const { device1, device2 } = pairedDevices;

    // Start adding bookmark
    await addBookmarkViaUI(device1, {
      title: 'Partial Sync Test',
      url: 'https://partial-sync.example.com'
    });

    // Simulate network failure during sync
    await device1.waitForTimeout(1000); // Let sync start
    await simulateNetworkConditions(device1, 'intermittent');

    // Wait and restore network
    await device1.waitForTimeout(3000);
    await simulateNetworkConditions(device1, 'online');

    // Sync should eventually recover and complete
    await waitForSyncComplete(device1, 15000);
    await waitForSyncComplete(device2, 15000);

    // Bookmark should appear on device2
    await expectBookmarkExists(device2, 'Partial Sync Test');
  });
});