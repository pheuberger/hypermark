/**
 * Test Fixtures and Data for E2E Tests
 * Reusable test data and setup functions
 */

import { test as base } from '@playwright/test';
import { clearBrowserStorage, waitForAppLoad } from '../utils/test-helpers.js';

/**
 * Sample bookmark data for testing
 */
export const sampleBookmarks = [
  {
    title: 'React Documentation',
    url: 'https://reactjs.org/docs',
    description: 'Official React documentation with guides and API reference',
    tags: ['react', 'javascript', 'frontend', 'documentation'],
    folder: 'Development'
  },
  {
    title: 'MDN Web Docs',
    url: 'https://developer.mozilla.org',
    description: 'Comprehensive web development documentation',
    tags: ['web', 'documentation', 'html', 'css', 'javascript'],
    folder: 'Development'
  },
  {
    title: 'GitHub',
    url: 'https://github.com',
    description: 'Code hosting platform for version control',
    tags: ['git', 'code', 'repository', 'collaboration'],
    folder: 'Tools'
  },
  {
    title: 'Stack Overflow',
    url: 'https://stackoverflow.com',
    description: 'Programming Q&A community',
    tags: ['programming', 'help', 'community', 'qa'],
    folder: 'Resources'
  },
  {
    title: 'Playwright Testing',
    url: 'https://playwright.dev',
    description: 'End-to-end testing framework',
    tags: ['testing', 'automation', 'e2e', 'playwright'],
    folder: 'Testing'
  },
  {
    title: 'TypeScript Handbook',
    url: 'https://www.typescriptlang.org/docs',
    description: 'TypeScript language documentation',
    tags: ['typescript', 'javascript', 'documentation', 'types'],
    folder: 'Development'
  },
  {
    title: 'Vite Build Tool',
    url: 'https://vitejs.dev',
    description: 'Fast build tool for modern web development',
    tags: ['build', 'development', 'bundler', 'vite'],
    folder: 'Tools'
  },
  {
    title: 'Tailwind CSS',
    url: 'https://tailwindcss.com',
    description: 'Utility-first CSS framework',
    tags: ['css', 'styling', 'framework', 'utility'],
    folder: 'Development'
  },
];

/**
 * Search test cases with expected results
 */
export const searchTestCases = [
  {
    query: 'react',
    expectedCount: 1,
    expectedTitles: ['React Documentation']
  },
  {
    query: 'documentation',
    expectedCount: 3,
    expectedTitles: ['React Documentation', 'MDN Web Docs', 'TypeScript Handbook']
  },
  {
    query: 'javascript',
    expectedCount: 3,
    expectedTitles: ['React Documentation', 'MDN Web Docs', 'TypeScript Handbook']
  },
  {
    query: 'development',
    expectedCount: 3,
    expectedTitles: ['Vite Build Tool', 'MDN Web Docs', 'Tailwind CSS']
  },
  {
    query: 'testing',
    expectedCount: 1,
    expectedTitles: ['Playwright Testing']
  },
  {
    query: 'nonexistent',
    expectedCount: 0,
    expectedTitles: []
  }
];

/**
 * Performance test data - larger dataset
 */
export function generateLargeBookmarkDataset(size = 1000) {
  const categories = ['Work', 'Personal', 'Research', 'Tools', 'Documentation', 'Entertainment'];
  const tags = ['important', 'reference', 'tutorial', 'news', 'tool', 'documentation', 'entertainment', 'work', 'personal', 'urgent'];
  const domains = ['github.com', 'stackoverflow.com', 'medium.com', 'dev.to', 'mozilla.org', 'w3.org', 'react.dev', 'vue.org'];

  return Array.from({ length: size }, (_, i) => ({
    title: `Bookmark ${i + 1}: ${generateRandomTitle()}`,
    url: `https://${domains[i % domains.length]}/page-${i}`,
    description: `Description for bookmark ${i + 1}. ${generateRandomDescription()}`,
    tags: generateRandomTags(tags, Math.floor(Math.random() * 4) + 1),
    folder: categories[i % categories.length],
    created: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString(),
    visited: Math.random() > 0.7
  }));
}

function generateRandomTitle() {
  const titles = [
    'Complete Guide to Web Development',
    'Best Practices for Modern JavaScript',
    'Understanding React Hooks',
    'CSS Grid Layout Tutorial',
    'Node.js Performance Optimization',
    'Database Design Principles',
    'API Design Guidelines',
    'Security Best Practices',
    'DevOps Automation Tools',
    'Machine Learning Basics'
  ];
  return titles[Math.floor(Math.random() * titles.length)];
}

function generateRandomDescription() {
  const descriptions = [
    'This article covers essential concepts and practical examples.',
    'Learn about advanced techniques and real-world applications.',
    'Step-by-step tutorial with code examples and explanations.',
    'Comprehensive guide covering theory and implementation.',
    'Industry best practices and common pitfalls to avoid.',
    'In-depth analysis with performance considerations.',
    'Practical tips and tricks for everyday development.',
    'Complete reference with detailed documentation.',
    'Latest trends and emerging technologies in the field.',
    'Expert insights and professional recommendations.'
  ];
  return descriptions[Math.floor(Math.random() * descriptions.length)];
}

function generateRandomTags(availableTags, count) {
  const shuffled = [...availableTags].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

/**
 * Custom test fixture with clean browser state
 */
export const test = base.extend({
  cleanPage: async ({ page }, use) => {
    // Clear storage before each test
    await clearBrowserStorage(page);

    // Navigate to the app and wait for it to load
    await page.goto('/');
    await waitForAppLoad(page);

    await use(page);

    // Cleanup after test
    await clearBrowserStorage(page);
  },

  /**
   * Two pages for multi-device testing
   */
  devicePair: async ({ browser }, use) => {
    const context1 = await browser.newContext();
    const context2 = await browser.newContext();

    const page1 = await context1.newPage();
    const page2 = await context2.newPage();

    // Setup both pages
    await Promise.all([
      clearBrowserStorage(page1),
      clearBrowserStorage(page2)
    ]);

    await Promise.all([
      page1.goto('/'),
      page2.goto('/')
    ]);

    await Promise.all([
      waitForAppLoad(page1),
      waitForAppLoad(page2)
    ]);

    await use({ device1: page1, device2: page2 });

    // Cleanup
    await Promise.all([
      context1.close(),
      context2.close()
    ]);
  },

  /**
   * Page with sample bookmark data pre-loaded
   */
  pageWithBookmarks: async ({ page }, use) => {
    await clearBrowserStorage(page);
    await page.goto('/');
    await waitForAppLoad(page);

    // Add sample bookmarks through the app
    await page.evaluate((bookmarks) => {
      // Simulate adding bookmarks directly to storage for faster setup
      const bookmarkData = bookmarks.map((bookmark, index) => ({
        ...bookmark,
        id: `bookmark-${index}`,
        created: new Date().toISOString(),
        modified: new Date().toISOString()
      }));

      // Store in localStorage as initial data (app should handle this)
      localStorage.setItem('hypermark-bookmarks', JSON.stringify(bookmarkData));

      // Trigger a storage event to notify the app
      window.dispatchEvent(new StorageEvent('storage', {
        key: 'hypermark-bookmarks',
        newValue: JSON.stringify(bookmarkData)
      }));
    }, sampleBookmarks);

    // Wait for bookmarks to appear in the UI
    await page.reload();
    await waitForAppLoad(page);

    await use(page);
  }
});

export { expect } from '@playwright/test';