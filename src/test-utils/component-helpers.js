/**
 * Component testing helpers for React components
 */

import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import * as Y from "yjs";

/**
 * Create a mock Yjs document with optional initial data
 * @param {Object} initialData - Initial data for the document
 * @returns {Y.Doc} - Mock Yjs document
 */
export function createMockYDoc(initialData = {}) {
  const doc = new Y.Doc();

  // Initialize standard maps
  const bookmarksMap = doc.getMap("bookmarks");
  const devicesMap = doc.getMap("devices");
  const settingsMap = doc.getMap("settings");

  // Populate with initial data if provided
  if (initialData.bookmarks) {
    for (const [id, bookmark] of Object.entries(initialData.bookmarks)) {
      const bookmarkMap = new Y.Map();
      for (const [key, value] of Object.entries(bookmark)) {
        if (key === "tags" && Array.isArray(value)) {
          const tagsArray = new Y.Array();
          tagsArray.push(value);
          bookmarkMap.set(key, tagsArray);
        } else {
          bookmarkMap.set(key, value);
        }
      }
      bookmarksMap.set(id, bookmarkMap);
    }
  }

  if (initialData.devices) {
    for (const [id, device] of Object.entries(initialData.devices)) {
      const deviceMap = new Y.Map();
      for (const [key, value] of Object.entries(device)) {
        deviceMap.set(key, value);
      }
      devicesMap.set(id, deviceMap);
    }
  }

  if (initialData.settings) {
    for (const [key, value] of Object.entries(initialData.settings)) {
      settingsMap.set(key, value);
    }
  }

  return doc;
}

/**
 * Create mock crypto service functions
 * @returns {Object} - Mock crypto functions
 */
export function createMockCryptoService() {
  return {
    isWebCryptoAvailable: vi.fn(() => true),
    generateDeviceKeypair: vi.fn(async () => ({
      privateKey: { type: "private", algorithm: { name: "ECDH" } },
      publicKey: { type: "public", algorithm: { name: "ECDH" } },
    })),
    generateEphemeralKeypair: vi.fn(async () => ({
      privateKey: { type: "private", algorithm: { name: "ECDH" } },
      publicKey: { type: "public", algorithm: { name: "ECDH" } },
    })),
    exportPublicKey: vi.fn(async () => "mockBase64PublicKey"),
    importPublicKey: vi.fn(async () => ({
      type: "public",
      algorithm: { name: "ECDH" },
    })),
    deriveSharedSecret: vi.fn(async () => new ArrayBuffer(32)),
    deriveSessionKey: vi.fn(async () => ({ type: "secret" })),
    encryptData: vi.fn(async (key, data) => ({
      ciphertext: new ArrayBuffer(data.byteLength + 16),
      iv: new Uint8Array(12),
    })),
    decryptData: vi.fn(async (key, ciphertext) => ciphertext),
    generateLEK: vi.fn(async () => ({
      type: "secret",
      algorithm: { name: "AES-GCM" },
    })),
    exportLEK: vi.fn(async () => new ArrayBuffer(32)),
    importLEK: vi.fn(async () => ({
      type: "secret",
      algorithm: { name: "AES-GCM" },
    })),
    deriveYjsPassword: vi.fn(async () => "mockYjsPassword"),
    generateUUID: vi.fn(() => "mock-uuid-1234-5678"),
    generateRandomBytes: vi.fn((length) => new Uint8Array(length)),
  };
}

/**
 * Create mock key storage service functions
 * @returns {Object} - Mock key storage functions
 */
export function createMockKeyStorage() {
  const storage = new Map();

  return {
    storeKey: vi.fn(async (name, key) => {
      storage.set(name, key);
    }),
    retrieveKey: vi.fn(async (name) => storage.get(name) || null),
    hasKey: vi.fn(async (name) => storage.has(name)),
    deleteKey: vi.fn(async (name) => {
      storage.delete(name);
    }),
    listKeys: vi.fn(async () => Array.from(storage.keys())),
    clearAllKeys: vi.fn(async () => {
      storage.clear();
    }),
    storeDeviceKeypair: vi.fn(async (keypair) => {
      storage.set("device-keypair", keypair);
    }),
    retrieveDeviceKeypair: vi.fn(async () => storage.get("device-keypair")),
    storeLEK: vi.fn(async (lek) => {
      storage.set("lek", lek);
    }),
    retrieveLEK: vi.fn(async () => storage.get("lek")),
    checkDeviceInitialization: vi.fn(async () => ({
      hasKeypair: storage.has("device-keypair"),
      hasLEK: storage.has("lek"),
    })),
    // Helper to access internal storage for testing
    _getStorage: () => storage,
    _clearStorage: () => storage.clear(),
  };
}

/**
 * Create mock pairing code service functions
 * @returns {Object} - Mock pairing code functions
 */
export function createMockPairingCodeService() {
  return {
    generatePairingCode: vi.fn(() => ({
      code: "123-apple-river",
      room: 123,
      words: ["apple", "river"],
    })),
    parsePairingCode: vi.fn((code) => {
      const match = code.match(/^(\d+)-(\w+)-(\w+)$/);
      if (!match) throw new Error("Invalid pairing code format");
      return {
        room: parseInt(match[1]),
        words: [match[2], match[3]],
      };
    }),
    getRoomName: vi.fn((room) => `pairing-${room}`),
    derivePSK: vi.fn(async () => ({ type: "secret" })),
    encryptMessage: vi.fn(async (psk, message) => ({
      ciphertext: "mockCiphertext",
      iv: "mockIv",
    })),
    decryptMessage: vi.fn(async (psk, ciphertext, iv) => ({ type: "test" })),
  };
}

/**
 * Create mock signaling service
 * @returns {Object} - Mock signaling service
 */
export function createMockSignalingService() {
  const subscriptions = new Map();
  const messageQueue = [];

  return {
    connect: vi.fn(async () => {}),
    disconnect: vi.fn(() => {}),
    subscribe: vi.fn((topic, callback) => {
      if (!subscriptions.has(topic)) {
        subscriptions.set(topic, []);
      }
      subscriptions.get(topic).push(callback);
      return () => {
        const callbacks = subscriptions.get(topic);
        const index = callbacks.indexOf(callback);
        if (index > -1) callbacks.splice(index, 1);
      };
    }),
    publish: vi.fn((topic, message) => {
      messageQueue.push({ topic, message });
    }),
    // Test helpers
    _simulateMessage: (topic, message) => {
      const callbacks = subscriptions.get(topic) || [];
      callbacks.forEach((cb) => cb(message));
    },
    _getSubscriptions: () => subscriptions,
    _getMessageQueue: () => messageQueue,
    _clearState: () => {
      subscriptions.clear();
      messageQueue.length = 0;
    },
  };
}

/**
 * Wait for element to appear in DOM
 * @param {Function} query - Query function
 * @param {Object} options - waitFor options
 */
export async function waitForElement(query, options = {}) {
  return waitFor(() => query(), {
    timeout: 3000,
    ...options,
  });
}

/**
 * Simulate typing in an input field
 * @param {HTMLElement} element - Input element
 * @param {string} text - Text to type
 */
export async function typeIntoInput(element, text) {
  const user = userEvent.setup();
  await user.clear(element);
  await user.type(element, text);
}

/**
 * Create a render function with common providers
 * @param {Object} options - Configuration options
 * @returns {Function} - Custom render function
 */
export function createRenderWithProviders(options = {}) {
  const { ydoc = createMockYDoc() } = options;

  return (component, renderOptions = {}) => {
    // We could wrap with context providers here if needed
    return render(component, renderOptions);
  };
}

/**
 * Flush all pending promises and timers
 */
export async function flushAsync() {
  await new Promise((resolve) => setTimeout(resolve, 0));
  await vi.runAllTimersAsync?.();
}

/**
 * Assert that console.error was not called
 * @param {Function} fn - Test function to run
 */
export async function expectNoConsoleErrors(fn) {
  const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
    expect(consoleSpy).not.toHaveBeenCalled();
  } finally {
    consoleSpy.mockRestore();
  }
}

/**
 * Create a test harness for async operations
 * @returns {Object} - Test harness with utilities
 */
export function createAsyncTestHarness() {
  const operations = [];
  const results = [];

  return {
    track: (name, promise) => {
      const tracked = promise.then(
        (result) => {
          results.push({ name, status: "fulfilled", result });
          return result;
        },
        (error) => {
          results.push({ name, status: "rejected", error });
          throw error;
        }
      );
      operations.push({ name, promise: tracked });
      return tracked;
    },
    waitForAll: () => Promise.allSettled(operations.map((o) => o.promise)),
    getResults: () => results,
    clear: () => {
      operations.length = 0;
      results.length = 0;
    },
  };
}
