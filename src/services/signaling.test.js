/**
 * Signaling Service Tests
 * Tests for src/services/signaling.js
 *
 * Tests SignalingClient message routing, subscription management,
 * publish/queue behavior, close cleanup, and the getPairingRoomName utility.
 *
 * These tests focus on deterministic, non-flaky behavior by testing
 * the pure logic (message routing, subscription state, queue management)
 * without relying on real WebSocket connections or timers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SignalingClient,
  getPairingRoomName,
  getSignalingUrl,
} from "./signaling.js";

describe("signaling service", () => {
  describe("getPairingRoomName", () => {
    it("creates room name with pairing prefix", () => {
      expect(getPairingRoomName("abc123")).toBe("pairing-abc123");
    });

    it("handles numeric session IDs", () => {
      expect(getPairingRoomName("42")).toBe("pairing-42");
    });

    it("handles UUID-style session IDs", () => {
      const uuid = "550e8400-e29b-41d4-a716-446655440000";
      expect(getPairingRoomName(uuid)).toBe(`pairing-${uuid}`);
    });

    it("handles empty string", () => {
      expect(getPairingRoomName("")).toBe("pairing-");
    });
  });

  describe("getSignalingUrl", () => {
    it("returns default URL when no custom URL is set", () => {
      const url = getSignalingUrl();
      // Should return env var or default localhost
      expect(typeof url).toBe("string");
      expect(url.length).toBeGreaterThan(0);
    });

    it("returns custom URL from localStorage when set", () => {
      localStorage.setItem(
        "hypermark_signaling_url",
        "wss://custom.server.com"
      );
      const url = getSignalingUrl();
      expect(url).toBe("wss://custom.server.com");
    });

    it("prioritizes localStorage over default", () => {
      localStorage.setItem("hypermark_signaling_url", "wss://override.com");
      const url = getSignalingUrl();
      expect(url).toBe("wss://override.com");
    });
  });

  describe("SignalingClient", () => {
    let client;

    beforeEach(() => {
      client = new SignalingClient("wss://test.example.com");
    });

    afterEach(() => {
      if (client) {
        client.close();
      }
    });

    describe("constructor", () => {
      it("initializes with provided URL", () => {
        expect(client.url).toBe("wss://test.example.com");
      });

      it("initializes with default URL when none provided", () => {
        const defaultClient = new SignalingClient();
        expect(typeof defaultClient.url).toBe("string");
        expect(defaultClient.url.length).toBeGreaterThan(0);
        defaultClient.close();
      });

      it("starts disconnected", () => {
        expect(client.connected).toBe(false);
      });

      it("starts with empty subscriptions", () => {
        expect(client.subscriptions.size).toBe(0);
      });

      it("starts with empty pending messages", () => {
        expect(client.pendingMessages).toEqual([]);
      });

      it("starts with shouldReconnect enabled", () => {
        expect(client.shouldReconnect).toBe(true);
      });

      it("starts with zero reconnect attempts", () => {
        expect(client.reconnectAttempt).toBe(0);
      });

      it("starts with no WebSocket instance", () => {
        expect(client.ws).toBeNull();
      });

      it("starts with no connection promise", () => {
        expect(client.connectionPromise).toBeNull();
      });
    });

    describe("subscribe", () => {
      it("registers callback for a topic", () => {
        const callback = vi.fn();
        client.subscribe("test-room", callback);

        expect(client.subscriptions.has("test-room")).toBe(true);
        expect(client.subscriptions.get("test-room").size).toBe(1);
      });

      it("allows multiple callbacks for same topic", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("test-room", cb1);
        client.subscribe("test-room", cb2);

        expect(client.subscriptions.get("test-room").size).toBe(2);
      });

      it("allows subscribing to multiple topics", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("room-1", cb1);
        client.subscribe("room-2", cb2);

        expect(client.subscriptions.size).toBe(2);
      });

      it("does not create duplicate entries for same callback", () => {
        const callback = vi.fn();
        client.subscribe("test-room", callback);
        client.subscribe("test-room", callback);

        // Set ensures uniqueness
        expect(client.subscriptions.get("test-room").size).toBe(1);
      });
    });

    describe("unsubscribe", () => {
      it("removes specific callback from topic", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("test-room", cb1);
        client.subscribe("test-room", cb2);

        client.unsubscribe("test-room", cb1);

        expect(client.subscriptions.get("test-room").size).toBe(1);
        expect(client.subscriptions.get("test-room").has(cb2)).toBe(true);
      });

      it("removes topic entirely when last callback is removed", () => {
        const callback = vi.fn();
        client.subscribe("test-room", callback);

        client.unsubscribe("test-room", callback);

        expect(client.subscriptions.has("test-room")).toBe(false);
      });

      it("removes all callbacks when no specific callback given", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("test-room", cb1);
        client.subscribe("test-room", cb2);

        client.unsubscribe("test-room");

        expect(client.subscriptions.has("test-room")).toBe(false);
      });

      it("handles unsubscribing from non-existent topic", () => {
        // Should not throw
        expect(() => client.unsubscribe("nonexistent")).not.toThrow();
      });

      it("does not affect other topics", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("room-1", cb1);
        client.subscribe("room-2", cb2);

        client.unsubscribe("room-1");

        expect(client.subscriptions.has("room-1")).toBe(false);
        expect(client.subscriptions.has("room-2")).toBe(true);
      });
    });

    describe("publish", () => {
      it("queues messages when not connected", () => {
        client.publish("test-room", { type: "hello" });

        expect(client.pendingMessages).toHaveLength(1);
        expect(client.pendingMessages[0]).toEqual({
          type: "publish",
          topic: "test-room",
          data: { type: "hello" },
        });
      });

      it("queues multiple messages in order", () => {
        client.publish("room", { seq: 1 });
        client.publish("room", { seq: 2 });
        client.publish("room", { seq: 3 });

        expect(client.pendingMessages).toHaveLength(3);
        expect(client.pendingMessages[0].data.seq).toBe(1);
        expect(client.pendingMessages[1].data.seq).toBe(2);
        expect(client.pendingMessages[2].data.seq).toBe(3);
      });

      it("queues messages with correct structure", () => {
        const data = { publicKey: "abc123", deviceId: "dev-1" };
        client.publish("pairing-42", data);

        const queued = client.pendingMessages[0];
        expect(queued.type).toBe("publish");
        expect(queued.topic).toBe("pairing-42");
        expect(queued.data).toEqual(data);
      });

      it("sends directly when connected", () => {
        // Simulate a connected state with mock ws
        const mockSend = vi.fn();
        client.connected = true;
        client.ws = {
          readyState: WebSocket.OPEN,
          send: mockSend,
          close: vi.fn(),
        };

        client.publish("room", { msg: "direct" });

        // Should send, not queue
        expect(client.pendingMessages).toHaveLength(0);
        expect(mockSend).toHaveBeenCalledTimes(1);

        const sent = JSON.parse(mockSend.mock.calls[0][0]);
        expect(sent.type).toBe("publish");
        expect(sent.topic).toBe("room");
        expect(sent.data).toEqual({ msg: "direct" });
      });
    });

    describe("_handleMessage", () => {
      it("routes messages to correct topic subscribers", () => {
        const callback = vi.fn();
        client.subscribe("room-1", callback);

        client._handleMessage(
          JSON.stringify({
            topic: "room-1",
            data: { type: "test", value: 42 },
          })
        );

        expect(callback).toHaveBeenCalledWith(
          { type: "test", value: 42 },
          expect.objectContaining({ topic: "room-1" })
        );
      });

      it("does not route to unrelated topic subscribers", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("room-1", cb1);
        client.subscribe("room-2", cb2);

        client._handleMessage(
          JSON.stringify({
            topic: "room-1",
            data: { msg: "hello" },
          })
        );

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).not.toHaveBeenCalled();
      });

      it("routes to all callbacks on the same topic", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        const cb3 = vi.fn();
        client.subscribe("room-1", cb1);
        client.subscribe("room-1", cb2);
        client.subscribe("room-1", cb3);

        client._handleMessage(
          JSON.stringify({
            topic: "room-1",
            data: { msg: "broadcast" },
          })
        );

        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);
        expect(cb3).toHaveBeenCalledTimes(1);
      });

      it("ignores pong messages", () => {
        const callback = vi.fn();
        client.subscribe("any-room", callback);

        client._handleMessage(JSON.stringify({ type: "pong" }));

        expect(callback).not.toHaveBeenCalled();
      });

      it("ignores messages for unsubscribed topics", () => {
        // No subscribers registered - should not throw
        expect(() =>
          client._handleMessage(
            JSON.stringify({ topic: "unknown-room", data: {} })
          )
        ).not.toThrow();
      });

      it("handles malformed JSON gracefully", () => {
        // Should not throw
        expect(() =>
          client._handleMessage("not valid json {{{")
        ).not.toThrow();
      });

      it("handles messages without topic field", () => {
        const callback = vi.fn();
        client.subscribe("room", callback);

        client._handleMessage(JSON.stringify({ data: "no topic" }));

        expect(callback).not.toHaveBeenCalled();
      });

      it("handles callback errors without crashing other callbacks", () => {
        const errorCallback = vi.fn(() => {
          throw new Error("callback error");
        });
        const normalCallback = vi.fn();

        client.subscribe("room", errorCallback);
        client.subscribe("room", normalCallback);

        // Should not throw even though first callback throws
        expect(() =>
          client._handleMessage(
            JSON.stringify({ topic: "room", data: { test: true } })
          )
        ).not.toThrow();

        // Both callbacks should have been called
        expect(errorCallback).toHaveBeenCalledTimes(1);
        expect(normalCallback).toHaveBeenCalledTimes(1);
      });

      it("passes full message object as second argument", () => {
        const callback = vi.fn();
        client.subscribe("room", callback);

        const fullMessage = {
          topic: "room",
          data: { key: "value" },
          sender: "peer-abc",
        };
        client._handleMessage(JSON.stringify(fullMessage));

        expect(callback).toHaveBeenCalledWith(
          { key: "value" },
          expect.objectContaining({
            topic: "room",
            data: { key: "value" },
            sender: "peer-abc",
          })
        );
      });

      it("handles message with null data", () => {
        const callback = vi.fn();
        client.subscribe("room", callback);

        client._handleMessage(
          JSON.stringify({ topic: "room", data: null })
        );

        expect(callback).toHaveBeenCalledWith(null, expect.anything());
      });

      it("handles message with nested complex data", () => {
        const callback = vi.fn();
        client.subscribe("room", callback);

        const complexData = {
          type: "LEK_TRANSFER",
          payload: { key: "base64data", iv: "ivdata" },
          metadata: { timestamp: 1700000000 },
        };

        client._handleMessage(
          JSON.stringify({ topic: "room", data: complexData })
        );

        expect(callback).toHaveBeenCalledWith(complexData, expect.anything());
      });
    });

    describe("close", () => {
      it("clears all subscriptions", () => {
        client.subscribe("room-1", vi.fn());
        client.subscribe("room-2", vi.fn());

        client.close();

        expect(client.subscriptions.size).toBe(0);
      });

      it("clears pending messages", () => {
        client.publish("room", { data: "test" });
        expect(client.pendingMessages.length).toBeGreaterThan(0);

        client.close();

        expect(client.pendingMessages).toEqual([]);
      });

      it("sets shouldReconnect to false", () => {
        client.close();

        expect(client.shouldReconnect).toBe(false);
      });

      it("sets connected to false", () => {
        client.connected = true; // simulate connected state
        client.close();

        expect(client.connected).toBe(false);
      });

      it("clears connectionPromise", () => {
        client.connectionPromise = Promise.resolve();
        client.close();

        expect(client.connectionPromise).toBeNull();
      });

      it("can be called multiple times safely", () => {
        client.close();
        expect(() => client.close()).not.toThrow();
        expect(() => client.close()).not.toThrow();
      });

      it("nullifies the WebSocket instance", () => {
        client.ws = { close: vi.fn() }; // simulate existing ws
        client.close();

        expect(client.ws).toBeNull();
      });
    });

    describe("_send", () => {
      it("sends JSON when WebSocket is open", () => {
        const mockSend = vi.fn();
        client.ws = {
          readyState: WebSocket.OPEN,
          send: mockSend,
          close: vi.fn(),
        };

        client._send({ type: "subscribe", topics: ["room-1"] });

        expect(mockSend).toHaveBeenCalledTimes(1);
        const sent = JSON.parse(mockSend.mock.calls[0][0]);
        expect(sent.type).toBe("subscribe");
        expect(sent.topics).toEqual(["room-1"]);
      });

      it("does not send when WebSocket is connecting", () => {
        const mockSend = vi.fn();
        client.ws = {
          readyState: WebSocket.CONNECTING,
          send: mockSend,
          close: vi.fn(),
        };

        client._send({ type: "test" });

        expect(mockSend).not.toHaveBeenCalled();
      });

      it("does not send when WebSocket is null", () => {
        client.ws = null;

        // Should not throw
        expect(() => client._send({ type: "test" })).not.toThrow();
      });

      it("does not send when WebSocket is closing", () => {
        const mockSend = vi.fn();
        client.ws = {
          readyState: WebSocket.CLOSING,
          send: mockSend,
          close: vi.fn(),
        };

        client._send({ type: "test" });

        expect(mockSend).not.toHaveBeenCalled();
      });

      it("does not send when WebSocket is closed", () => {
        const mockSend = vi.fn();
        client.ws = {
          readyState: WebSocket.CLOSED,
          send: mockSend,
          close: vi.fn(),
        };

        client._send({ type: "test" });

        expect(mockSend).not.toHaveBeenCalled();
      });
    });

    describe("subscribe-unsubscribe-handleMessage integration", () => {
      it("stops receiving messages after unsubscribe", () => {
        const callback = vi.fn();
        client.subscribe("room", callback);

        // First message goes through
        client._handleMessage(
          JSON.stringify({ topic: "room", data: { seq: 1 } })
        );
        expect(callback).toHaveBeenCalledTimes(1);

        // Unsubscribe
        client.unsubscribe("room", callback);

        // Second message should not reach callback
        client._handleMessage(
          JSON.stringify({ topic: "room", data: { seq: 2 } })
        );
        expect(callback).toHaveBeenCalledTimes(1);
      });

      it("only specific callback stops receiving after partial unsubscribe", () => {
        const cb1 = vi.fn();
        const cb2 = vi.fn();
        client.subscribe("room", cb1);
        client.subscribe("room", cb2);

        // Both receive first message
        client._handleMessage(
          JSON.stringify({ topic: "room", data: { seq: 1 } })
        );
        expect(cb1).toHaveBeenCalledTimes(1);
        expect(cb2).toHaveBeenCalledTimes(1);

        // Unsubscribe only cb1
        client.unsubscribe("room", cb1);

        // Only cb2 receives second message
        client._handleMessage(
          JSON.stringify({ topic: "room", data: { seq: 2 } })
        );
        expect(cb1).toHaveBeenCalledTimes(1); // still 1
        expect(cb2).toHaveBeenCalledTimes(2); // now 2
      });

      it("can re-subscribe after unsubscribe", () => {
        const callback = vi.fn();

        client.subscribe("room", callback);
        client.unsubscribe("room", callback);
        client.subscribe("room", callback);

        client._handleMessage(
          JSON.stringify({ topic: "room", data: { msg: "after resubscribe" } })
        );

        expect(callback).toHaveBeenCalledTimes(1);
      });
    });
  });
});
