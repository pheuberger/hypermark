/**
 * Nostr Sync Service Tests
 * Tests for src/services/nostr-sync.js
 *
 * Tests the core NostrSyncService functionality including relay connection
 * management, event publishing, subscription handling, and error recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { webcrypto } from "node:crypto";

// Set up crypto environment
if (!globalThis.window?.crypto) {
  globalThis.window = globalThis.window || globalThis;
  globalThis.window.crypto = webcrypto;
}

import { generateLEK } from './crypto.js';

import {
  NostrSyncService,
  createNostrSyncService,
  NOSTR_KINDS,
  CONNECTION_STATES,
  DEFAULT_RELAYS
} from './nostr-sync.js';

describe('NostrSyncService', () => {
  let service;
  let mockWebSocket;
  let originalWebSocket;
  let testLEK;

  beforeEach(async () => {
    // Create a real LEK for testing
    testLEK = await generateLEK();
    // Mock WebSocket
    originalWebSocket = globalThis.WebSocket;
    mockWebSocket = {
      CONNECTING: 0,
      OPEN: 1,
      CLOSING: 2,
      CLOSED: 3,
      readyState: 0,
      url: '',
      onopen: null,
      onclose: null,
      onerror: null,
      onmessage: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      send: vi.fn(),
      close: vi.fn()
    };

    globalThis.WebSocket = vi.fn(() => {
      // Simulate immediate connection for most tests
      setTimeout(() => {
        mockWebSocket.readyState = 1; // OPEN
        if (mockWebSocket.onopen) {
          mockWebSocket.onopen({ type: 'open' });
        }
      }, 0);
      return mockWebSocket;
    });

    // Create service instance
    service = new NostrSyncService({
      relays: ['wss://test-relay.example.com'],
      debug: false,
      autoReconnect: false // Disable for controlled testing
    });
  });

  afterEach(async () => {
    if (service) {
      await service.disconnect();
    }
    globalThis.WebSocket = originalWebSocket;
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('initializes with default configuration', () => {
      const defaultService = new NostrSyncService();

      expect(defaultService.relays).toEqual(DEFAULT_RELAYS);
      expect(defaultService.autoReconnect).toBe(true);
      expect(defaultService.isInitialized).toBe(false);
    });

    it('accepts custom configuration', () => {
      const customRelays = ['wss://custom.relay.com'];
      const customService = new NostrSyncService({
        relays: customRelays,
        debug: true,
        autoReconnect: false
      });

      expect(customService.relays).toEqual(customRelays);
      expect(customService.debug).toBe(true);
      expect(customService.autoReconnect).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('initializes with LEK successfully', async () => {
      expect(service.isInitialized).toBe(false);

      await service.initialize(testLEK);

      expect(service.isInitialized).toBe(true);
      expect(service.nostrKeypair).toBeTruthy();
      expect(service.nostrKeypair.publicKeyHex).toBeTruthy();
      expect(service.nostrKeypair.privateKeyHex).toBeTruthy();
    });

    it('throws error when LEK is not provided', async () => {
      await expect(service.initialize()).rejects.toThrow('LEK is required');
      await expect(service.initialize(null)).rejects.toThrow('LEK is required');
      await expect(service.initialize('')).rejects.toThrow('LEK is required');
    });

    it('auto-connects to relays when autoReconnect is enabled', async () => {
      const autoConnectService = new NostrSyncService({
        relays: ['wss://test.relay.com'],
        autoReconnect: true
      });

      await autoConnectService.initialize(testLEK);

      expect(globalThis.WebSocket).toHaveBeenCalledWith('wss://test.relay.com');

      await autoConnectService.disconnect();
    });
  });

  describe('Connection Management', () => {
    beforeEach(async () => {
      await service.initialize(testLEK);
    });

    it('connects to configured relays', async () => {
      await service.connectToRelays();

      expect(globalThis.WebSocket).toHaveBeenCalledWith('wss://test-relay.example.com');
      expect(service.connections.size).toBe(1);

      const connection = service.connections.get('wss://test-relay.example.com');
      expect(connection.state).toBe(CONNECTION_STATES.CONNECTING);
    });

    it('handles connection success', async () => {
      await service.connectToRelays();

      // Simulate connection opening
      const connection = service.connections.get('wss://test-relay.example.com');
      connection.state = CONNECTION_STATES.CONNECTED;
      connection.connectedAt = Date.now();

      const status = service.getStatus();
      expect(status.relays.connected).toBe(1);
    });

    it('disconnects from all relays', async () => {
      await service.connectToRelays();

      await service.disconnect();

      expect(service.connections.size).toBe(0);
      expect(service.subscriptions.size).toBe(0);
    });

    it('provides connection status information', async () => {
      const status = service.getStatus();

      expect(status).toHaveProperty('isInitialized', true);
      expect(status.publicKey).toBeTruthy();
      expect(status.relays).toHaveProperty('total');
      expect(status.relays).toHaveProperty('connected');
      expect(status.relays).toHaveProperty('connections');
      expect(status.subscriptions).toHaveProperty('active');
      expect(status).toHaveProperty('queuedEvents');
    });
  });

  describe('Event Publishing', () => {
    beforeEach(async () => {
      await service.initialize(testLEK);
    });

    it('throws error if not initialized', async () => {
      const uninitializedService = new NostrSyncService();

      await expect(uninitializedService.publishEvent({}))
        .rejects.toThrow('Service must be initialized');
    });

    it('queues events when no relays are connected', async () => {
      const eventData = {
        kind: NOSTR_KINDS.REPLACEABLE_EVENT,
        content: 'test content',
        tags: [['d', 'bookmark-1']]
      };

      const result = await service.publishEvent(eventData);

      expect(result).toBe(null);
      expect(service.eventQueue).toHaveLength(1);
      expect(service.eventQueue[0]).toEqual(eventData);
    });

    it('publishes events to connected relays', async () => {
      await service.connectToRelays();

      // Simulate connected state
      const connection = service.connections.get('wss://test-relay.example.com');
      connection.state = CONNECTION_STATES.CONNECTED;
      connection.ws = mockWebSocket;

      const eventData = {
        kind: NOSTR_KINDS.REPLACEABLE_EVENT,
        content: 'test content'
      };

      const result = await service.publishEvent(eventData);

      expect(result).toBeTruthy();
      expect(result.kind).toBe(NOSTR_KINDS.REPLACEABLE_EVENT);
      expect(result.pubkey).toBe(mockNostrKeypair.publicKey);
      expect(mockWebSocket.send).toHaveBeenCalled();

      // Verify the message format
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage[0]).toBe('EVENT');
      expect(sentMessage[1]).toEqual(result);
    });

    it('processes queued events when connections are restored', async () => {
      // Queue an event while disconnected
      const eventData = { kind: 1, content: 'queued event' };
      await service.publishEvent(eventData);
      expect(service.eventQueue).toHaveLength(1);

      // Connect to relays
      await service.connectToRelays();

      // Simulate connection
      const connection = service.connections.get('wss://test-relay.example.com');
      connection.state = CONNECTION_STATES.CONNECTED;
      connection.ws = mockWebSocket;

      // Trigger queue processing by connecting
      await service.connectToRelays();

      expect(service.eventQueue).toHaveLength(0);
    });
  });

  describe('Event Subscriptions', () => {
    beforeEach(async () => {
      await service.initialize(testLEK);
      await service.connectToRelays();

      // Simulate connected state
      const connection = service.connections.get('wss://test-relay.example.com');
      connection.state = CONNECTION_STATES.CONNECTED;
      connection.ws = mockWebSocket;
    });

    it('throws error if not initialized', async () => {
      const uninitializedService = new NostrSyncService();

      await expect(uninitializedService.subscribe([], () => {}))
        .rejects.toThrow('Service must be initialized');
    });

    it('creates subscription with filters and handler', async () => {
      const filters = [{ kinds: [NOSTR_KINDS.REPLACEABLE_EVENT] }];
      const handler = vi.fn();

      const subscriptionId = await service.subscribe(filters, handler);

      expect(subscriptionId).toBeTruthy();
      expect(service.subscriptions.has(subscriptionId)).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalled();

      // Verify REQ message format
      const sentMessage = JSON.parse(mockWebSocket.send.mock.calls[0][0]);
      expect(sentMessage[0]).toBe('REQ');
      expect(sentMessage[1]).toBe(subscriptionId);
      expect(sentMessage[2]).toEqual(filters[0]);
    });

    it('handles subscription events', async () => {
      const handler = vi.fn();
      const subscriptionId = await service.subscribe([], handler);

      // Simulate receiving an event
      const event = {
        id: 'event-id',
        pubkey: 'some-pubkey',
        created_at: Math.floor(Date.now() / 1000),
        kind: 1,
        content: 'test event',
        sig: 'signature'
      };

      await service._handleEventMessage('wss://test-relay.example.com', [subscriptionId, event]);

      expect(handler).toHaveBeenCalledWith(event, 'wss://test-relay.example.com');
    });

    it('unsubscribes from relays', async () => {
      const subscriptionId = await service.subscribe([], vi.fn());

      await service.unsubscribe(subscriptionId);

      expect(service.subscriptions.has(subscriptionId)).toBe(false);
      expect(mockWebSocket.send).toHaveBeenCalledTimes(2); // REQ + CLOSE

      // Verify CLOSE message format
      const closeMessage = JSON.parse(mockWebSocket.send.mock.calls[1][0]);
      expect(closeMessage[0]).toBe('CLOSE');
      expect(closeMessage[1]).toBe(subscriptionId);
    });

    it('ignores events for unknown subscriptions', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      await service._handleEventMessage('wss://test-relay.example.com', ['unknown-sub', {}]);

      // Should not throw, just log
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('unknown subscription'),
        'unknown-sub'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Error Handling and Resilience', () => {
    beforeEach(async () => {
      await service.initialize(testLEK);
    });

    it('handles WebSocket connection errors gracefully', async () => {
      // Mock WebSocket to fail immediately
      globalThis.WebSocket = vi.fn(() => {
        const failingWs = { ...mockWebSocket };
        setTimeout(() => {
          if (failingWs.onerror) {
            failingWs.onerror({ type: 'error' });
          }
        }, 0);
        return failingWs;
      });

      await service.connectToRelays();

      // Should not throw, connection should be marked as error
      await new Promise(resolve => setTimeout(resolve, 10)); // Wait for async error handling

      const connection = service.connections.get('wss://test-relay.example.com');
      expect(connection.state).toBe(CONNECTION_STATES.ERROR);
    });

    it('handles malformed messages gracefully', async () => {
      await service.connectToRelays();

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      // Simulate malformed JSON message
      await service._handleWebSocketMessage('wss://test-relay.example.com', {
        data: 'invalid json {'
      });

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('validates event signatures', () => {
      const validEvent = {
        id: 'event-id',
        pubkey: 'pubkey',
        created_at: 1234567890,
        kind: 1,
        sig: 'signature'
      };

      const invalidEvent = {
        id: 'event-id',
        // missing required fields
      };

      expect(service._verifyEventSignature(validEvent)).toBe(true);
      expect(service._verifyEventSignature(invalidEvent)).toBe(false);
    });
  });

  describe('Event Handlers and Callbacks', () => {
    beforeEach(async () => {
      await service.initialize(testLEK);
    });

    it('registers and calls event handlers', () => {
      const handler = vi.fn();
      service.onEvent('test-event', handler);

      expect(service.eventHandlers.get('test-event')).toBe(handler);
    });

    it('registers and calls connection change handlers', () => {
      const handler = vi.fn();
      service.onConnectionChange(handler);

      expect(service.connectionHandlers).toContain(handler);

      // Trigger a connection change
      service._notifyConnectionChange('test-relay', 'disconnected', 'connected');

      expect(handler).toHaveBeenCalledWith('test-relay', 'disconnected', 'connected');
    });

    it('handles errors in connection change handlers', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      service.onConnectionChange(errorHandler);
      service._notifyConnectionChange('test-relay', 'disconnected', 'connected');

      expect(errorHandler).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Connection change handler error'),
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Utility Functions', () => {
    it('generates unique event IDs', () => {
      const id1 = service._generateEventId();
      const id2 = service._generateEventId();

      expect(id1).toHaveLength(64); // 32 bytes * 2 hex chars
      expect(id2).toHaveLength(64);
      expect(id1).not.toBe(id2);
    });

    it('generates unique subscription IDs', () => {
      const id1 = service._generateSubscriptionId();
      const id2 = service._generateSubscriptionId();

      expect(id1).toHaveLength(32); // 16 bytes * 2 hex chars
      expect(id2).toHaveLength(32);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Factory Function', () => {
    it('creates and initializes service', async () => {
      const createdService = await createNostrSyncService(testLEK, {
        relays: ['wss://test.com'],
        debug: true
      });

      expect(createdService).toBeInstanceOf(NostrSyncService);
      expect(createdService.isInitialized).toBe(true);
      expect(createdService.debug).toBe(true);

      await createdService.disconnect();
    });
  });
});