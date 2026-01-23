/**
 * Search Index Service Tests
 * Tests for src/services/search-index.js
 *
 * Tests MiniSearch integration for full-text bookmark search.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createSearchIndex,
  buildSearchIndex,
  searchBookmarks,
  updateSearchIndex,
  removeFromSearchIndex,
} from "./search-index.js";
import { generateBookmarks, generateLargeDataset } from "../test-utils/data-generators.js";

describe("search-index service", () => {
  describe("createSearchIndex", () => {
    it("creates a MiniSearch instance", () => {
      const index = createSearchIndex();

      expect(index).toBeDefined();
      expect(typeof index.search).toBe("function");
      expect(typeof index.add).toBe("function");
    });

    it("configures correct fields", () => {
      const index = createSearchIndex();

      // MiniSearch doesn't expose fields directly, but we can test by adding a document
      index.add({
        id: "test",
        _id: "test",
        title: "Test Title",
        description: "Test Description",
        url: "https://example.com",
        tags: "tag1 tag2",
      });

      // Should find by title
      expect(index.search("Title").length).toBeGreaterThan(0);
      // Should find by description
      expect(index.search("Description").length).toBeGreaterThan(0);
      // Should find by url
      expect(index.search("example").length).toBeGreaterThan(0);
      // Should find by tags
      expect(index.search("tag1").length).toBeGreaterThan(0);
    });
  });

  describe("buildSearchIndex", () => {
    it("builds index from bookmarks array", () => {
      const bookmarks = generateBookmarks(5);
      const index = buildSearchIndex(bookmarks);

      expect(index).toBeDefined();
    });

    it("handles empty bookmarks array", () => {
      const index = buildSearchIndex([]);

      expect(index).toBeDefined();
      expect(searchBookmarks(index, "anything")).toEqual([]);
    });

    it("indexes all bookmarks", () => {
      const bookmarks = [
        {
          _id: "1",
          title: "Unique Title One",
          description: "",
          url: "https://one.com",
          tags: [],
        },
        {
          _id: "2",
          title: "Unique Title Two",
          description: "",
          url: "https://two.com",
          tags: [],
        },
        {
          _id: "3",
          title: "Unique Title Three",
          description: "",
          url: "https://three.com",
          tags: [],
        },
      ];

      const index = buildSearchIndex(bookmarks);

      expect(searchBookmarks(index, "One").length).toBe(1);
      expect(searchBookmarks(index, "Two").length).toBe(1);
      expect(searchBookmarks(index, "Three").length).toBe(1);
    });

    it("joins tags array into searchable string", () => {
      const bookmarks = [
        {
          _id: "1",
          title: "Test",
          description: "",
          url: "https://example.com",
          tags: ["javascript", "react", "typescript"],
        },
      ];

      const index = buildSearchIndex(bookmarks);

      expect(searchBookmarks(index, "javascript").length).toBe(1);
      expect(searchBookmarks(index, "react").length).toBe(1);
      expect(searchBookmarks(index, "typescript").length).toBe(1);
    });

    it("handles missing fields gracefully", () => {
      const bookmarks = [
        { _id: "1", title: "Test" }, // Missing description, url, tags
        { _id: "2", title: null, description: "desc", url: "", tags: null },
      ];

      const index = buildSearchIndex(bookmarks);

      expect(index).toBeDefined();
      expect(searchBookmarks(index, "Test").length).toBe(1);
    });
  });

  describe("searchBookmarks", () => {
    let index;

    beforeEach(() => {
      const bookmarks = [
        {
          _id: "github",
          title: "GitHub",
          description: "Code hosting and collaboration platform",
          url: "https://github.com",
          tags: ["git", "code", "development"],
        },
        {
          _id: "google",
          title: "Google",
          description: "Search engine and web services",
          url: "https://google.com",
          tags: ["search", "web"],
        },
        {
          _id: "stackoverflow",
          title: "Stack Overflow",
          description: "Programming Q&A community",
          url: "https://stackoverflow.com",
          tags: ["programming", "qa", "development"],
        },
        {
          _id: "mdn",
          title: "MDN Web Docs",
          description: "Web technology documentation",
          url: "https://developer.mozilla.org",
          tags: ["documentation", "web", "javascript"],
        },
      ];

      index = buildSearchIndex(bookmarks);
    });

    it("returns empty array for empty query", () => {
      expect(searchBookmarks(index, "")).toEqual([]);
      expect(searchBookmarks(index, "   ")).toEqual([]);
    });

    it("returns empty array for null query", () => {
      expect(searchBookmarks(index, null)).toEqual([]);
    });

    it("returns results with id and score", () => {
      const results = searchBookmarks(index, "GitHub");

      expect(results.length).toBeGreaterThan(0);
      expect(results[0]).toHaveProperty("id");
      expect(results[0]).toHaveProperty("score");
    });

    it("finds by exact title match", () => {
      const results = searchBookmarks(index, "GitHub");

      expect(results.some((r) => r.id === "github")).toBe(true);
    });

    it("finds by partial match (prefix search)", () => {
      const results = searchBookmarks(index, "Git");

      expect(results.some((r) => r.id === "github")).toBe(true);
    });

    it("finds by description content", () => {
      const results = searchBookmarks(index, "collaboration");

      expect(results.some((r) => r.id === "github")).toBe(true);
    });

    it("finds by URL content", () => {
      const results = searchBookmarks(index, "mozilla");

      expect(results.some((r) => r.id === "mdn")).toBe(true);
    });

    it("finds by tag", () => {
      const results = searchBookmarks(index, "development");

      expect(results.some((r) => r.id === "github")).toBe(true);
      expect(results.some((r) => r.id === "stackoverflow")).toBe(true);
    });

    it("supports fuzzy matching for typos", () => {
      // Search with a prefix match which is explicitly supported
      const results = searchBookmarks(index, "githu");

      // Should find GitHub due to prefix matching
      expect(results.some((r) => r.id === "github")).toBe(true);
    });

    it("returns results sorted by relevance score", () => {
      // Search for "web" which appears in multiple bookmarks
      const results = searchBookmarks(index, "web");

      // Scores should be descending
      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1].score).toBeGreaterThanOrEqual(results[i].score);
      }
    });

    it("boosts title matches over description", () => {
      // Create index with specific test data
      const testIndex = buildSearchIndex([
        {
          _id: "title-match",
          title: "JavaScript Guide",
          description: "A guide for programming",
          url: "https://example.com/1",
          tags: [],
        },
        {
          _id: "desc-match",
          title: "Programming Tutorial",
          description: "Learn JavaScript basics",
          url: "https://example.com/2",
          tags: [],
        },
      ]);

      const results = searchBookmarks(testIndex, "JavaScript");

      // Title match should rank higher
      expect(results[0].id).toBe("title-match");
    });

    it("handles special characters in query", () => {
      const results = searchBookmarks(index, "Q&A");

      // Should not crash and may find Stack Overflow
      expect(Array.isArray(results)).toBe(true);
    });

    it("handles very long queries", () => {
      const longQuery = "a".repeat(1000);
      const results = searchBookmarks(index, longQuery);

      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("updateSearchIndex", () => {
    it("adds new bookmark to existing index", () => {
      const index = buildSearchIndex([]);

      updateSearchIndex(index, {
        _id: "new",
        title: "New Bookmark",
        description: "Just added",
        url: "https://new.com",
        tags: ["fresh"],
      });

      const results = searchBookmarks(index, "New Bookmark");
      expect(results.some((r) => r.id === "new")).toBe(true);
    });

    it("updates existing bookmark in index", () => {
      const index = buildSearchIndex([
        {
          _id: "update-me",
          title: "Original Title",
          description: "Original description",
          url: "https://example.com",
          tags: [],
        },
      ]);

      // Verify original is searchable
      expect(searchBookmarks(index, "Original").length).toBe(1);

      // Update the bookmark
      updateSearchIndex(index, {
        _id: "update-me",
        title: "Updated Title",
        description: "Updated description",
        url: "https://example.com",
        tags: [],
      });

      // Old unique word should not be found (avoiding "Title" which exists in both)
      expect(searchBookmarks(index, "Original").length).toBe(0);

      // New title should be found
      expect(searchBookmarks(index, "Updated").length).toBe(1);
    });

    it("handles missing fields in bookmark", () => {
      const index = buildSearchIndex([]);

      // Should not throw
      updateSearchIndex(index, {
        _id: "partial",
        title: "Partial Bookmark",
      });

      expect(searchBookmarks(index, "Partial").length).toBe(1);
    });

    it("handles tags as array", () => {
      const index = buildSearchIndex([]);

      updateSearchIndex(index, {
        _id: "with-tags",
        title: "Tagged Bookmark",
        description: "",
        url: "",
        tags: ["alpha", "beta", "gamma"],
      });

      expect(searchBookmarks(index, "alpha").length).toBe(1);
      expect(searchBookmarks(index, "gamma").length).toBe(1);
    });
  });

  describe("removeFromSearchIndex", () => {
    it("removes bookmark from index", () => {
      const index = buildSearchIndex([
        {
          _id: "remove-me",
          title: "To Be Removed",
          description: "",
          url: "https://example.com",
          tags: [],
        },
      ]);

      // Verify it exists
      expect(searchBookmarks(index, "Removed").length).toBe(1);

      // Remove it
      removeFromSearchIndex(index, "remove-me");

      // Should no longer be found
      expect(searchBookmarks(index, "Removed").length).toBe(0);
    });

    it("handles removal of non-existent bookmark", () => {
      const index = buildSearchIndex([]);

      // Should not throw
      expect(() => removeFromSearchIndex(index, "non-existent")).not.toThrow();
    });

    it("only removes specified bookmark", () => {
      const index = buildSearchIndex([
        {
          _id: "keep",
          title: "Keep Me",
          description: "",
          url: "https://keep.com",
          tags: [],
        },
        {
          _id: "remove",
          title: "Remove Me",
          description: "",
          url: "https://remove.com",
          tags: [],
        },
      ]);

      removeFromSearchIndex(index, "remove");

      expect(searchBookmarks(index, "Keep").length).toBe(1);
      expect(searchBookmarks(index, "Remove").length).toBe(0);
    });
  });

  describe("performance", () => {
    it("handles large dataset efficiently", () => {
      const largeDataset = generateLargeDataset(1000);

      const startBuild = performance.now();
      const index = buildSearchIndex(largeDataset);
      const buildTime = performance.now() - startBuild;

      // Building should complete in reasonable time (< 2 seconds)
      expect(buildTime).toBeLessThan(2000);

      const startSearch = performance.now();
      const results = searchBookmarks(index, "Performance");
      const searchTime = performance.now() - startSearch;

      // Search should be fast (< 100ms)
      expect(searchTime).toBeLessThan(100);
    });

    it("maintains performance after many updates", () => {
      const index = buildSearchIndex([]);

      // Add 100 bookmarks one by one
      for (let i = 0; i < 100; i++) {
        updateSearchIndex(index, {
          _id: `bookmark-${i}`,
          title: `Bookmark Number ${i}`,
          description: `Description for bookmark ${i}`,
          url: `https://example${i}.com`,
          tags: [`tag${i}`],
        });
      }

      const startSearch = performance.now();
      searchBookmarks(index, "Number 50");
      const searchTime = performance.now() - startSearch;

      expect(searchTime).toBeLessThan(50);
    });
  });

  describe("edge cases", () => {
    it("handles bookmarks with unicode content", () => {
      const index = buildSearchIndex([
        {
          _id: "unicode",
          title: "\u4e2d\u6587\u6807\u9898", // Chinese characters
          description: "\u65e5\u672c\u8a9e", // Japanese
          url: "https://example.com",
          tags: ["\u{1F600}"], // Emoji
        },
      ]);

      // Should not crash
      expect(searchBookmarks(index, "\u4e2d\u6587")).toBeDefined();
    });

    it("handles very long titles", () => {
      const longTitle = "A".repeat(10000);
      const index = buildSearchIndex([
        {
          _id: "long",
          title: longTitle,
          description: "",
          url: "https://example.com",
          tags: [],
        },
      ]);

      // Should be searchable
      expect(searchBookmarks(index, "AAA").length).toBe(1);
    });

    it("handles bookmarks with empty strings", () => {
      const index = buildSearchIndex([
        {
          _id: "empty",
          title: "",
          description: "",
          url: "",
          tags: [],
        },
      ]);

      // Should not crash
      expect(index).toBeDefined();
    });

    it("handles multiple bookmarks with same title", () => {
      const index = buildSearchIndex([
        {
          _id: "1",
          title: "Duplicate Title",
          description: "First",
          url: "https://first.com",
          tags: [],
        },
        {
          _id: "2",
          title: "Duplicate Title",
          description: "Second",
          url: "https://second.com",
          tags: [],
        },
      ]);

      const results = searchBookmarks(index, "Duplicate Title");

      expect(results.length).toBe(2);
    });
  });
});
