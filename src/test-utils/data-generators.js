/**
 * Test data generators for Hypermark tests
 */

import { wordlist } from "../services/wordlist";

/**
 * Generate a valid bookmark object
 * @param {Object} overrides - Properties to override
 * @returns {Object} - Valid bookmark data
 */
export function generateBookmark(overrides = {}) {
  const id = `bookmark:${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  return {
    _id: id,
    id: id,
    type: "bookmark",
    url: `https://example${Math.floor(Math.random() * 1000)}.com/page`,
    title: `Test Bookmark ${Math.floor(Math.random() * 1000)}`,
    description: "A test bookmark description",
    tags: ["test", "sample"],
    readLater: false,
    favicon: null,
    preview: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Generate multiple bookmarks
 * @param {number} count - Number of bookmarks to generate
 * @param {Object} sharedOverrides - Properties to apply to all bookmarks
 * @returns {Array} - Array of bookmark objects
 */
export function generateBookmarks(count, sharedOverrides = {}) {
  return Array.from({ length: count }, (_, i) =>
    generateBookmark({
      url: `https://example.com/page-${i}`,
      title: `Bookmark ${i + 1}`,
      ...sharedOverrides,
    })
  );
}

/**
 * Generate bookmark data for validation testing (input data, not full object)
 * @param {Object} overrides - Properties to override
 * @returns {Object} - Bookmark input data
 */
export function generateBookmarkInput(overrides = {}) {
  return {
    url: "https://example.com/test",
    title: "Test Title",
    description: "Test description",
    tags: ["tag1", "tag2"],
    readLater: false,
    ...overrides,
  };
}

/**
 * Generate invalid bookmark data for testing validation failures
 * @returns {Array} - Array of invalid bookmark objects with error descriptions
 */
export function generateInvalidBookmarks() {
  return [
    { data: {}, error: "Missing URL and title" },
    { data: { url: "" }, error: "Empty URL" },
    { data: { url: "https://example.com" }, error: "Missing title" },
    { data: { url: "not-a-url", title: "Test" }, error: "Invalid URL format" },
    { data: { url: "https://example.com", title: "" }, error: "Empty title" },
    {
      data: { url: "https://example.com", title: "   " },
      error: "Whitespace-only title",
    },
    {
      data: { url: "https://example.com", title: 123 },
      error: "Non-string title",
    },
    { data: { url: 123, title: "Test" }, error: "Non-string URL" },
  ];
}

/**
 * Generate URL test cases for normalization testing
 * @returns {Array} - Array of {input, expected} pairs
 */
export function generateUrlTestCases() {
  return [
    // Protocol handling
    { input: "example.com", expected: "https://example.com" },
    { input: "http://example.com", expected: "http://example.com" },
    { input: "https://example.com", expected: "https://example.com" },

    // Trailing slash removal
    { input: "https://example.com/", expected: "https://example.com" },
    { input: "https://example.com/path/", expected: "https://example.com/path" },

    // Case normalization (hostname only)
    { input: "https://EXAMPLE.COM", expected: "https://example.com" },
    {
      input: "https://Example.Com/Path",
      expected: "https://example.com/Path",
    },

    // Query parameter sorting
    {
      input: "https://example.com?b=2&a=1",
      expected: "https://example.com/?a=1&b=2",
    },
    {
      input: "https://example.com/path?z=3&y=2&x=1",
      expected: "https://example.com/path?x=1&y=2&z=3",
    },

    // Fragments preserved
    {
      input: "https://example.com#section",
      expected: "https://example.com#section",
    },

    // Complex URLs
    {
      input: "https://user:pass@EXAMPLE.COM:8080/path/?b=2&a=1#hash",
      expected: "https://user:pass@example.com:8080/path?a=1&b=2#hash",
    },
  ];
}

/**
 * Generate invalid URLs for testing
 * @returns {Array} - Array of invalid URL strings
 */
export function generateInvalidUrls() {
  return [
    "not-a-url",
    "://missing-protocol.com",
    "javascript:alert(1)",
    "file:///etc/passwd",
    "ftp://example.com",
    "",
    "   ",
    "http://",
    "https://",
  ];
}

/**
 * Generate a valid pairing code
 * @returns {Object} - {code, room, words}
 */
export function generatePairingCode() {
  const room = Math.floor(Math.random() * 999) + 1;
  const word1 = wordlist[Math.floor(Math.random() * wordlist.length)];
  const word2 = wordlist[Math.floor(Math.random() * wordlist.length)];

  return {
    code: `${room}-${word1}-${word2}`,
    room,
    words: [word1, word2],
  };
}

/**
 * Generate invalid pairing codes for testing validation
 * @returns {Array} - Array of invalid pairing code strings
 */
export function generateInvalidPairingCodes() {
  return [
    // Invalid formats
    { code: "", error: "Empty string" },
    { code: "abc", error: "No separators" },
    { code: "123", error: "Room only" },
    { code: "-word-word", error: "Missing room number" },
    { code: "123-", error: "Missing words" },
    { code: "123-word", error: "Single word" },
    { code: "123-word-word-extra", error: "Too many words" },

    // Invalid room numbers
    { code: "0-word-word", error: "Room 0 (below minimum)" },
    { code: "1000-word-word", error: "Room 1000 (above maximum)" },
    { code: "-1-word-word", error: "Negative room number" },

    // Unknown words
    { code: "123-notaword-valid", error: "First word not in wordlist" },
    { code: "123-valid-notaword", error: "Second word not in wordlist" },
    { code: "123-xyzzy-plugh", error: "Both words unknown" },
  ];
}

/**
 * Generate tag test cases
 * @returns {Array} - Array of tag test scenarios
 */
export function generateTagTestCases() {
  return [
    { input: "test", normalized: "test" },
    { input: "TEST", normalized: "test" },
    { input: "TeSt", normalized: "test" },
    { input: "  test  ", normalized: "test" },
    { input: "multi word", normalized: "multi word" },
    { input: "", normalized: null }, // Should be filtered out
    { input: "   ", normalized: null }, // Should be filtered out
  ];
}

/**
 * Generate large dataset for performance testing
 * @param {number} count - Number of bookmarks (default 1000)
 * @returns {Array} - Large array of bookmarks
 */
export function generateLargeDataset(count = 1000) {
  const domains = ["github.com", "google.com", "example.com", "test.org"];
  const tagPools = [
    ["programming", "code", "dev"],
    ["design", "ui", "ux"],
    ["news", "article", "blog"],
    ["tool", "utility", "resource"],
  ];

  return Array.from({ length: count }, (_, i) => {
    const domain = domains[i % domains.length];
    const tagPool = tagPools[i % tagPools.length];

    return generateBookmark({
      url: `https://${domain}/path-${i}`,
      title: `Performance Test Bookmark ${i + 1}`,
      description: `This is a test description for bookmark number ${i + 1} used in performance testing`,
      tags: tagPool.slice(0, Math.floor(Math.random() * 3) + 1),
    });
  });
}

/**
 * Get sample words from the wordlist for testing
 * @param {number} count - Number of words to get
 * @returns {Array} - Array of words
 */
export function getSampleWords(count = 5) {
  const indices = new Set();
  while (indices.size < count && indices.size < wordlist.length) {
    indices.add(Math.floor(Math.random() * wordlist.length));
  }
  return Array.from(indices).map((i) => wordlist[i]);
}

/**
 * Get the full wordlist for testing
 * @returns {Array} - Full wordlist
 */
export function getWordlist() {
  return wordlist;
}
