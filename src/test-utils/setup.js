/**
 * Global test setup file
 * This file runs before each test file and sets up the test environment
 *
 * IMPORTANT: Import order matters! fake-indexeddb must be imported before
 * any code that uses IndexedDB.
 */

// 1. IndexedDB polyfill - MUST be first
import "fake-indexeddb/auto";

// 2. Jest-DOM matchers for better assertions
import "@testing-library/jest-dom";

// 3. Crypto polyfill for Node.js environment
// jsdom doesn't provide a complete crypto.subtle implementation
import { webcrypto } from "node:crypto";

// Set up global crypto if not available or incomplete
if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
} else if (!globalThis.crypto.subtle) {
  globalThis.crypto.subtle = webcrypto.subtle;
}

// Ensure getRandomValues is available
if (!globalThis.crypto.getRandomValues) {
  globalThis.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
}

// Ensure window.crypto is also set (some code uses window.crypto)
// In jsdom environment, window exists but crypto may be incomplete
if (typeof window !== "undefined") {
  // Define window.crypto if not defined
  if (!window.crypto) {
    Object.defineProperty(window, "crypto", {
      value: webcrypto,
      writable: true,
      configurable: true,
    });
  } else if (!window.crypto.subtle) {
    Object.defineProperty(window.crypto, "subtle", {
      value: webcrypto.subtle,
      writable: true,
      configurable: true,
    });
  }
  if (!window.crypto.getRandomValues) {
    window.crypto.getRandomValues = webcrypto.getRandomValues.bind(webcrypto);
  }
}

// Also define window globally if running in jsdom but window wasn't defined
// (This can happen in some edge cases with test isolation)
if (typeof globalThis.window === "undefined") {
  // Create a minimal window object for tests
  globalThis.window = globalThis;
}

// Ensure globalThis.window has crypto
if (globalThis.window && !globalThis.window.crypto) {
  Object.defineProperty(globalThis.window, "crypto", {
    value: webcrypto,
    writable: true,
    configurable: true,
  });
}

// 4. TextEncoder/TextDecoder polyfill (usually available in jsdom but ensure it)
if (!globalThis.TextEncoder) {
  const { TextEncoder, TextDecoder } = await import("node:util");
  globalThis.TextEncoder = TextEncoder;
  globalThis.TextDecoder = TextDecoder;
}

// 5. Mock WebSocket for signaling service tests
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    this._messageQueue = [];

    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      if (this.onopen) {
        this.onopen({ type: "open" });
      }
    }, 0);
  }

  send(data) {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error("WebSocket is not open");
    }
    this._messageQueue.push(data);
  }

  close(code = 1000, reason = "") {
    this.readyState = MockWebSocket.CLOSING;
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED;
      if (this.onclose) {
        this.onclose({ type: "close", code, reason });
      }
    }, 0);
  }

  // Helper method for tests to simulate receiving a message
  _receiveMessage(data) {
    if (this.onmessage) {
      this.onmessage({ type: "message", data });
    }
  }

  // Helper method for tests to simulate an error
  _triggerError(error) {
    if (this.onerror) {
      this.onerror({ type: "error", error });
    }
  }
}

// Install WebSocket mock if not available
if (!globalThis.WebSocket) {
  globalThis.WebSocket = MockWebSocket;
}

// 6. Mock localStorage (jsdom provides this, but ensure it's clean)
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: (key) => store[key] ?? null,
    setItem: (key, value) => {
      store[key] = String(value);
    },
    removeItem: (key) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index) => Object.keys(store)[index] ?? null,
  };
})();

// Only override if localStorage is not properly functioning
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: localStorageMock,
  });
}

// 7. Cleanup hooks
import { afterEach, beforeEach, vi } from "vitest";

beforeEach(() => {
  // Clear localStorage before each test
  localStorage.clear();
});

afterEach(() => {
  // Clean up any pending timers
  vi.clearAllTimers();

  // Restore all mocks
  vi.restoreAllMocks();
});

// 8. Global test utilities
globalThis.sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 9. Console error/warn tracking for tests that shouldn't produce warnings
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

globalThis.suppressConsoleErrors = () => {
  console.error = vi.fn();
  console.warn = vi.fn();
};

globalThis.restoreConsole = () => {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
};
