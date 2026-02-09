/**
 * Recent Items Utility Tests
 * Tests for src/utils/recent-items.js
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  addRecentBookmark,
  getRecentBookmarks,
  addRecentCommand,
  getRecentCommands,
  clearRecentItems,
  STORAGE_KEYS,
  MAX_RECENT_BOOKMARKS,
  MAX_RECENT_COMMANDS,
  BOOKMARK_EXPIRY_DAYS,
  COMMAND_EXPIRY_DAYS,
} from "./recent-items.js";

// Mock localStorage
const mockLocalStorage = {
  store: new Map(),
  getItem: vi.fn((key) => mockLocalStorage.store.get(key) || null),
  setItem: vi.fn((key, value) => {
    mockLocalStorage.store.set(key, value);
  }),
  removeItem: vi.fn((key) => {
    mockLocalStorage.store.delete(key);
  }),
  clear: vi.fn(() => {
    mockLocalStorage.store.clear();
  }),
};

// Set up global localStorage mock
Object.defineProperty(globalThis, "localStorage", {
  value: mockLocalStorage,
  writable: true,
});

describe("recent-items utility", () => {
  beforeEach(() => {
    // Clear localStorage and reset mocks before each test
    mockLocalStorage.store.clear();
    vi.clearAllMocks();
    clearRecentItems();
  });

  describe("addRecentBookmark + getRecentBookmarks", () => {
    it("basic round-trip - add bookmark and retrieve", () => {
      addRecentBookmark("bookmark-123");
      const recent = getRecentBookmarks();
      expect(recent).toEqual(["bookmark-123"]);
    });

    it("returns empty array when nothing stored", () => {
      const recent = getRecentBookmarks();
      expect(recent).toEqual([]);
    });

    it("deduplicates - adding same ID moves it to front", () => {
      addRecentBookmark("a");
      addRecentBookmark("b");
      addRecentBookmark("c");
      addRecentBookmark("a"); // Should move 'a' to front

      const recent = getRecentBookmarks();
      expect(recent).toEqual(["a", "c", "b"]);
    });

    it("respects max limit (10 items)", () => {
      // Add 12 items
      for (let i = 1; i <= 12; i++) {
        addRecentBookmark(`bookmark-${i}`);
      }

      const recent = getRecentBookmarks();
      expect(recent).toHaveLength(10);
      // Should have the 10 most recent (bookmark-12 to bookmark-3)
      expect(recent).toEqual([
        "bookmark-12",
        "bookmark-11",
        "bookmark-10",
        "bookmark-9",
        "bookmark-8",
        "bookmark-7",
        "bookmark-6",
        "bookmark-5",
        "bookmark-4",
        "bookmark-3",
      ]);
    });

    it("filters expired items", () => {
      const now = 1000000000; // Fixed timestamp
      vi.spyOn(Date, "now").mockReturnValue(now);

      // Add a bookmark
      addRecentBookmark("bookmark-old");

      // Advance time by 8 days (past 7-day expiry)
      const eightDaysLater = now + 8 * 24 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(eightDaysLater);

      const recent = getRecentBookmarks();
      expect(recent).toEqual([]);

      vi.restoreAllMocks();
    });
  });

  describe("addRecentCommand + getRecentCommands", () => {
    it("basic round-trip - add command and retrieve", () => {
      addRecentCommand("search");
      const recent = getRecentCommands();
      expect(recent).toEqual(["search"]);
    });

    it("respects max limit (5 items)", () => {
      // Add 7 commands
      for (let i = 1; i <= 7; i++) {
        addRecentCommand(`command-${i}`);
      }

      const recent = getRecentCommands();
      expect(recent).toHaveLength(5);
      // Should have the 5 most recent (command-7 to command-3)
      expect(recent).toEqual([
        "command-7",
        "command-6",
        "command-5",
        "command-4",
        "command-3",
      ]);
    });

    it("filters expired items (30-day expiry)", () => {
      const now = 1000000000; // Fixed timestamp
      vi.spyOn(Date, "now").mockReturnValue(now);

      // Add a command
      addRecentCommand("old-command");

      // Advance time by 31 days (past 30-day expiry)
      const thirtyOneDaysLater = now + 31 * 24 * 60 * 60 * 1000;
      vi.spyOn(Date, "now").mockReturnValue(thirtyOneDaysLater);

      const recent = getRecentCommands();
      expect(recent).toEqual([]);

      vi.restoreAllMocks();
    });
  });

  describe("clearRecentItems", () => {
    it("removes all data", () => {
      // Add some data
      addRecentBookmark("bookmark-1");
      addRecentBookmark("bookmark-2");
      addRecentCommand("command-1");
      addRecentCommand("command-2");

      // Verify data exists
      expect(getRecentBookmarks()).toHaveLength(2);
      expect(getRecentCommands()).toHaveLength(2);

      // Clear all
      clearRecentItems();

      // Verify data is gone
      expect(getRecentBookmarks()).toEqual([]);
      expect(getRecentCommands()).toEqual([]);
    });
  });

  describe("error handling", () => {
    it("gracefully handles corrupted localStorage data", () => {
      // Set invalid JSON in localStorage
      mockLocalStorage.store.set(STORAGE_KEYS.recentBookmarks, "invalid-json");
      mockLocalStorage.store.set(STORAGE_KEYS.recentCommands, "invalid-json");

      // Should not throw and return empty arrays
      expect(() => getRecentBookmarks()).not.toThrow();
      expect(() => getRecentCommands()).not.toThrow();
      expect(getRecentBookmarks()).toEqual([]);
      expect(getRecentCommands()).toEqual([]);
    });

    it("gracefully handles localStorage being unavailable - getters", () => {
      // Mock localStorage to throw errors
      const originalGetItem = mockLocalStorage.getItem;
      mockLocalStorage.getItem = vi.fn(() => {
        throw new Error("localStorage unavailable");
      });

      // Should not throw and return empty arrays
      expect(() => getRecentBookmarks()).not.toThrow();
      expect(() => getRecentCommands()).not.toThrow();
      expect(getRecentBookmarks()).toEqual([]);
      expect(getRecentCommands()).toEqual([]);

      // Restore original method
      mockLocalStorage.getItem = originalGetItem;
    });

    it("gracefully handles localStorage being unavailable - setters", () => {
      // Mock localStorage to throw errors
      const originalSetItem = mockLocalStorage.setItem;
      mockLocalStorage.setItem = vi.fn(() => {
        throw new Error("localStorage unavailable");
      });

      // Should not throw
      expect(() => addRecentBookmark("test")).not.toThrow();
      expect(() => addRecentCommand("test")).not.toThrow();

      // Restore original method
      mockLocalStorage.setItem = originalSetItem;
    });

    it("gracefully handles localStorage being unavailable - clear", () => {
      // Mock localStorage to throw errors
      const originalRemoveItem = mockLocalStorage.removeItem;
      mockLocalStorage.removeItem = vi.fn(() => {
        throw new Error("localStorage unavailable");
      });

      // Should not throw
      expect(() => clearRecentItems()).not.toThrow();

      // Restore original method
      mockLocalStorage.removeItem = originalRemoveItem;
    });

    it("handles null/undefined data gracefully", () => {
      // Set null values in localStorage
      mockLocalStorage.store.set(STORAGE_KEYS.recentBookmarks, null);
      mockLocalStorage.store.set(STORAGE_KEYS.recentCommands, null);

      // Should return empty arrays
      expect(getRecentBookmarks()).toEqual([]);
      expect(getRecentCommands()).toEqual([]);
    });
  });

  describe("constants", () => {
    it("exports correct storage keys", () => {
      expect(STORAGE_KEYS.recentBookmarks).toBe("hypermark:recent-bookmarks");
      expect(STORAGE_KEYS.recentCommands).toBe("hypermark:recent-commands");
    });

    it("exports correct limits and expiry values", () => {
      expect(MAX_RECENT_BOOKMARKS).toBe(10);
      expect(MAX_RECENT_COMMANDS).toBe(5);
      expect(BOOKMARK_EXPIRY_DAYS).toBe(7);
      expect(COMMAND_EXPIRY_DAYS).toBe(30);
    });
  });

  describe("edge cases", () => {
    it("handles adding empty or invalid IDs", () => {
      // These should not crash the system
      addRecentBookmark("");
      addRecentBookmark(null);
      addRecentBookmark(undefined);
      addRecentCommand("");
      addRecentCommand(null);
      addRecentCommand(undefined);

      // Should handle gracefully (may store these values or filter them out)
      const bookmarks = getRecentBookmarks();
      const commands = getRecentCommands();

      // Should not throw and return arrays
      expect(Array.isArray(bookmarks)).toBe(true);
      expect(Array.isArray(commands)).toBe(true);
    });

    it("maintains order correctly with multiple operations", () => {
      // Complex sequence of operations
      addRecentBookmark("first");
      addRecentBookmark("second");
      addRecentBookmark("third");
      addRecentBookmark("first"); // Move to front
      addRecentBookmark("fourth");

      const recent = getRecentBookmarks();
      expect(recent).toEqual(["fourth", "first", "third", "second"]);
    });
  });
});