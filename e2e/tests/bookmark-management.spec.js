import { test, expect } from '../fixtures/test-data.js';
import { sampleBookmarks, searchTestCases } from '../fixtures/test-data.js';
import {
  addBookmarkViaUI,
  searchBookmarks,
  expectBookmarkExists,
  expectBookmarkCount
} from '../utils/test-helpers.js';

/**
 * Bookmark Management E2E Tests
 *
 * Tests the complete bookmark management workflow:
 * - Adding, editing, deleting bookmarks
 * - Tag management and organization
 * - Search and filtering functionality
 * - Bulk operations
 * - Import/export capabilities
 */

test.describe('Bookmark Management', () => {
  test('add new bookmark with complete details', async ({ cleanPage }) => {
    const testBookmark = {
      title: 'Playwright Documentation',
      url: 'https://playwright.dev/docs',
      description: 'Complete guide to Playwright testing framework',
      tags: ['testing', 'automation', 'playwright'],
      folder: 'Development'
    };

    await addBookmarkViaUI(cleanPage, testBookmark);

    // Verify bookmark appears in the list
    await expectBookmarkExists(cleanPage, testBookmark.title);

    // Verify bookmark details are saved correctly
    await cleanPage.click(`[data-testid="bookmark-${testBookmark.title}"], .bookmark-item:has-text("${testBookmark.title}")`);

    // Check that details are displayed
    await expect(cleanPage.locator(`:has-text("${testBookmark.url}")`)).toBeVisible();
    await expect(cleanPage.locator(`:has-text("${testBookmark.description}")`)).toBeVisible();

    // Check tags
    for (const tag of testBookmark.tags) {
      await expect(cleanPage.locator(`.tag:has-text("${tag}"), [data-tag="${tag}"]`)).toBeVisible();
    }
  });

  test('edit existing bookmark', async ({ pageWithBookmarks }) => {
    const bookmarkToEdit = sampleBookmarks[0];
    const updatedData = {
      title: 'Updated React Docs',
      description: 'Updated description for React documentation',
      tags: ['react', 'updated', 'docs']
    };

    // Open bookmark for editing
    await pageWithBookmarks.click(`[data-testid="bookmark-${bookmarkToEdit.title}"], .bookmark-item:has-text("${bookmarkToEdit.title}")`);
    await pageWithBookmarks.click('[data-testid="edit-bookmark"], button:has-text("Edit"), .edit-button');

    // Update details
    await pageWithBookmarks.fill('[data-testid="bookmark-title"], input[name="title"]', updatedData.title);
    await pageWithBookmarks.fill('[data-testid="bookmark-description"], textarea[name="description"]', updatedData.description);

    // Update tags
    const tagsInput = pageWithBookmarks.locator('[data-testid="bookmark-tags"], input[name="tags"]');
    await tagsInput.clear();
    await tagsInput.fill(updatedData.tags.join(', '));

    // Save changes
    await pageWithBookmarks.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Verify changes are applied
    await expectBookmarkExists(pageWithBookmarks, updatedData.title);
    await expect(pageWithBookmarks.locator(`:has-text("${updatedData.description}")`)).toBeVisible();
  });

  test('delete bookmark with confirmation', async ({ pageWithBookmarks }) => {
    const initialCount = sampleBookmarks.length;
    const bookmarkToDelete = sampleBookmarks[0];

    // Verify bookmark exists initially
    await expectBookmarkExists(pageWithBookmarks, bookmarkToDelete.title);

    // Delete bookmark
    await pageWithBookmarks.click(`[data-testid="bookmark-${bookmarkToDelete.title}"], .bookmark-item:has-text("${bookmarkToDelete.title}")`);
    await pageWithBookmarks.click('[data-testid="delete-bookmark"], button:has-text("Delete"), .delete-button');

    // Confirm deletion
    await pageWithBookmarks.click('[data-testid="confirm-delete"], button:has-text("Confirm"), button:has-text("Yes")');

    // Verify bookmark is removed
    await expectBookmarkCount(pageWithBookmarks, initialCount - 1);
    await expect(pageWithBookmarks.locator(`[data-testid="bookmark-${bookmarkToDelete.title}"]`)).not.toBeVisible();
  });

  test('bulk operations on multiple bookmarks', async ({ pageWithBookmarks }) => {
    // Select multiple bookmarks
    await pageWithBookmarks.click('[data-testid="select-all"], input[type="checkbox"][name="select-all"]');

    // Verify all bookmarks are selected
    const checkboxes = pageWithBookmarks.locator('[data-testid^="checkbox-bookmark"], input[type="checkbox"][data-bookmark-id]');
    const checkboxCount = await checkboxes.count();
    expect(checkboxCount).toBeGreaterThan(0);

    // Use bulk actions
    await pageWithBookmarks.click('[data-testid="bulk-actions"], .bulk-actions-menu');

    // Test bulk tag addition
    await pageWithBookmarks.click('[data-testid="bulk-add-tags"], button:has-text("Add Tags")');
    await pageWithBookmarks.fill('[data-testid="bulk-tags-input"], input[name="tags"]', 'bulk-test');
    await pageWithBookmarks.click('[data-testid="apply-bulk-tags"], button:has-text("Apply")');

    // Verify tag was added to selected bookmarks
    await expect(pageWithBookmarks.locator('.tag:has-text("bulk-test"), [data-tag="bulk-test"]').first()).toBeVisible();
  });

  test('bookmark validation and error handling', async ({ cleanPage }) => {
    // Try to add bookmark without required fields
    await cleanPage.click('[data-testid="add-bookmark"], .add-bookmark-btn');

    // Try to save without title
    await cleanPage.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Should show validation error
    await expect(cleanPage.locator('.error, .invalid, [role="alert"]')).toBeVisible();

    // Add invalid URL
    await cleanPage.fill('[data-testid="bookmark-title"], input[name="title"]', 'Test Bookmark');
    await cleanPage.fill('[data-testid="bookmark-url"], input[name="url"]', 'not-a-valid-url');
    await cleanPage.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Should show URL validation error
    await expect(cleanPage.locator(':has-text("valid URL"), :has-text("invalid"), .url-error')).toBeVisible();

    // Fix URL and save successfully
    await cleanPage.fill('[data-testid="bookmark-url"], input[name="url"]', 'https://example.com');
    await cleanPage.click('[data-testid="save-bookmark"], button:has-text("Save")');

    // Should save successfully
    await expectBookmarkExists(cleanPage, 'Test Bookmark');
  });

  test('bookmark organization with folders', async ({ cleanPage }) => {
    const bookmarkWithFolder = {
      title: 'Work Document',
      url: 'https://work.example.com/doc',
      folder: 'Work Projects'
    };

    await addBookmarkViaUI(cleanPage, bookmarkWithFolder);

    // Verify bookmark is in the correct folder
    await cleanPage.click('[data-testid="folder-work-projects"], .folder:has-text("Work Projects")');
    await expectBookmarkExists(cleanPage, bookmarkWithFolder.title);

    // Test moving bookmark to different folder
    await cleanPage.click(`[data-testid="bookmark-${bookmarkWithFolder.title}"]`);
    await cleanPage.click('[data-testid="move-bookmark"], button:has-text("Move")');
    await cleanPage.selectOption('[data-testid="folder-select"], select[name="folder"]', 'Personal');
    await cleanPage.click('[data-testid="confirm-move"], button:has-text("Move")');

    // Verify bookmark is in new folder
    await cleanPage.click('[data-testid="folder-personal"], .folder:has-text("Personal")');
    await expectBookmarkExists(cleanPage, bookmarkWithFolder.title);
  });

  test('bookmark import from browser bookmarks format', async ({ cleanPage }) => {
    // Test bookmark import functionality
    await cleanPage.click('[data-testid="import-bookmarks"], button:has-text("Import")');

    // Mock HTML bookmarks file content
    const mockBookmarksHTML = `
      <!DOCTYPE NETSCAPE-Bookmark-file-1>
      <META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
      <TITLE>Bookmarks</TITLE>
      <H1>Bookmarks Menu</H1>
      <DL><p>
          <DT><H3>Development</H3>
          <DL><p>
              <DT><A HREF="https://developer.mozilla.org/">MDN Web Docs</A>
              <DT><A HREF="https://github.com/">GitHub</A>
          </DL><p>
      </DL><p>
    `;

    // Simulate file upload (if supported by the app)
    // This would typically involve file input and upload simulation
    await cleanPage.setInputFiles('[data-testid="import-file"], input[type="file"]', {
      name: 'bookmarks.html',
      mimeType: 'text/html',
      buffer: Buffer.from(mockBookmarksHTML)
    });

    await cleanPage.click('[data-testid="process-import"], button:has-text("Import")');

    // Verify imported bookmarks appear
    await expectBookmarkExists(cleanPage, 'MDN Web Docs');
    await expectBookmarkExists(cleanPage, 'GitHub');
  });

  test('bookmark export functionality', async ({ pageWithBookmarks }) => {
    // Test bookmark export
    await pageWithBookmarks.click('[data-testid="export-bookmarks"], button:has-text("Export")');

    // Choose export format
    await pageWithBookmarks.click('[data-testid="export-format-html"], input[value="html"]');
    await pageWithBookmarks.click('[data-testid="start-export"], button:has-text("Export")');

    // Wait for download to complete
    const [download] = await Promise.all([
      pageWithBookmarks.waitForEvent('download'),
      pageWithBookmarks.click('[data-testid="download-export"], button:has-text("Download")')
    ]);

    // Verify download properties
    expect(download.suggestedFilename()).toContain('bookmarks');
    expect(download.suggestedFilename()).toContain('.html');
  });
});

test.describe('Search and Discovery', () => {
  test.beforeEach(async ({ pageWithBookmarks }) => {
    // Ensure we start with a known set of bookmarks
    await expectBookmarkCount(pageWithBookmarks, sampleBookmarks.length);
  });

  searchTestCases.forEach(({ query, expectedCount, expectedTitles }) => {
    test(`search for "${query}" returns ${expectedCount} results`, async ({ pageWithBookmarks }) => {
      await searchBookmarks(pageWithBookmarks, query);

      // Verify result count
      await expectBookmarkCount(pageWithBookmarks, expectedCount);

      // Verify specific expected bookmarks are shown
      for (const title of expectedTitles) {
        await expectBookmarkExists(pageWithBookmarks, title);
      }
    });
  });

  test('fuzzy search handles typos and partial matches', async ({ pageWithBookmarks }) => {
    const fuzzySearchTests = [
      { query: 'recat', expected: 'React Documentation' },  // Typo
      { query: 'docu', expected: 'React Documentation' },   // Partial
      { query: 'TYPE', expected: 'TypeScript Handbook' },   // Case insensitive
      { query: 'play wright', expected: 'Playwright Testing' } // Space handling
    ];

    for (const { query, expected } of fuzzySearchTests) {
      await searchBookmarks(pageWithBookmarks, query);
      await expectBookmarkExists(pageWithBookmarks, expected);

      // Clear search for next test
      await searchBookmarks(pageWithBookmarks, '');
    }
  });

  test('search by tags returns relevant results', async ({ pageWithBookmarks }) => {
    // Search for specific tag
    await searchBookmarks(pageWithBookmarks, 'tag:javascript');

    // Should return bookmarks with javascript tag
    const jsBookmarks = sampleBookmarks.filter(b => b.tags.includes('javascript'));
    await expectBookmarkCount(pageWithBookmarks, jsBookmarks.length);

    for (const bookmark of jsBookmarks) {
      await expectBookmarkExists(pageWithBookmarks, bookmark.title);
    }
  });

  test('search filters can be combined', async ({ pageWithBookmarks }) => {
    // Test combined search filters
    await searchBookmarks(pageWithBookmarks, 'documentation folder:Development');

    // Should return documentation bookmarks in Development folder
    const matchingBookmarks = sampleBookmarks.filter(b =>
      b.title.toLowerCase().includes('documentation') && b.folder === 'Development'
    );

    await expectBookmarkCount(pageWithBookmarks, matchingBookmarks.length);
  });

  test('search performance with large dataset', async ({ cleanPage }) => {
    // Add many bookmarks for performance testing
    const bookmarkPromises = [];
    for (let i = 0; i < 100; i++) {
      bookmarkPromises.push(
        addBookmarkViaUI(cleanPage, {
          title: `Performance Test Bookmark ${i}`,
          url: `https://example.com/test-${i}`,
          description: `Test bookmark ${i} for performance testing`,
          tags: [`perf${i % 10}`, `test${i % 5}`]
        })
      );

      // Add bookmarks in batches to avoid overwhelming the UI
      if (i % 10 === 9) {
        await Promise.all(bookmarkPromises.slice(-10));
      }
    }

    // Test search performance
    const startTime = Date.now();
    await searchBookmarks(cleanPage, 'performance');
    const searchTime = Date.now() - startTime;

    // Search should complete within reasonable time (under 1 second)
    expect(searchTime).toBeLessThan(1000);

    // Verify some results are returned
    await expect(cleanPage.locator('.bookmark-item:has-text("Performance")')).toHaveCount({ min: 1 });
  });
});