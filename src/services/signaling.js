/**
 * Signaling Service
 * Lightweight client for y-webrtc compatible signaling server
 * Used for both pairing (temporary rooms) and coordinates with y-webrtc for sync
 */

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000] // Exponential backoff

/**
 * Get the signaling server URL
 * Priority: user-configured (localStorage) > env var > default
 * @returns {string}
 */
export function getSignalingUrl() {
  const custom = typeof localStorage !== 'undefined'
    && localStorage.getItem('hypermark_signaling_url')
  if (custom) return custom
  return import.meta.env.VITE_SIGNALING_URL || 'ws://localhost:4444'
}

/**
 * SignalingClient - connects to y-webrtc signaling server for pub/sub messaging
 * 
 * Usage:
 *   const client = new SignalingClient('wss://your-server.com')
 *   await client.connect()
 *   client.subscribe('pairing-abc123', (msg) => console.log(msg))
 *   client.publish('pairing-abc123', { type: 'handshake', ... })
 *   client.close()
 */
export class SignalingClient {
  constructor(url = null) {
    this.url = url || getSignalingUrl()
    this.ws = null
    this.subscriptions = new Map() // topic -> Set<callback>
    this.connected = false
    this.reconnectAttempt = 0
    this.shouldReconnect = true
    this.pendingMessages = [] // Queue messages while connecting
    this.connectionPromise = null
  }

  /**
   * Connect to signaling server
   * @returns {Promise<void>}
   */
  connect() {
    if (this.connectionPromise) {
      return this.connectionPromise
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        console.log('[Signaling] Connecting to:', this.url)
        this.ws = new WebSocket(this.url)

        const timeout = setTimeout(() => {
          if (!this.connected) {
            this.ws.close()
            reject(new Error('Connection timeout'))
          }
        }, 10000) // 10s timeout

        this.ws.onopen = () => {
          clearTimeout(timeout)
          console.log('[Signaling] Connected')
          this.connected = true
          this.reconnectAttempt = 0

          // Flush pending messages
          while (this.pendingMessages.length > 0) {
            const msg = this.pendingMessages.shift()
            this._send(msg)
          }

          // Re-subscribe to any existing subscriptions (for reconnect)
          for (const topic of this.subscriptions.keys()) {
            this._send({ type: 'subscribe', topics: [topic] })
          }

          resolve()
        }

        this.ws.onclose = () => {
          console.log('[Signaling] Disconnected')
          this.connected = false
          this.connectionPromise = null

          if (this.shouldReconnect) {
            this._scheduleReconnect()
          }
        }

        this.ws.onerror = (err) => {
          console.error('[Signaling] WebSocket error:', err)
          if (!this.connected) {
            clearTimeout(timeout)
            reject(new Error('WebSocket connection failed'))
          }
        }

        this.ws.onmessage = (event) => {
          this._handleMessage(event.data)
        }
      } catch (err) {
        reject(err)
      }
    })

    return this.connectionPromise
  }

  /**
   * Subscribe to a topic (room)
   * @param {string} topic - Room name
   * @param {function} callback - Called with each message
   */
  subscribe(topic, callback) {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, new Set())

      // Send subscribe message if connected
      if (this.connected) {
        this._send({ type: 'subscribe', topics: [topic] })
      }
    }

    this.subscriptions.get(topic).add(callback)
    console.log('[Signaling] Subscribed to:', topic)
  }

  /**
   * Unsubscribe from a topic
   * @param {string} topic - Room name
   * @param {function} callback - Optional specific callback to remove
   */
  unsubscribe(topic, callback = null) {
    if (!this.subscriptions.has(topic)) return

    if (callback) {
      this.subscriptions.get(topic).delete(callback)
      if (this.subscriptions.get(topic).size === 0) {
        this.subscriptions.delete(topic)
        this._send({ type: 'unsubscribe', topics: [topic] })
      }
    } else {
      this.subscriptions.delete(topic)
      this._send({ type: 'unsubscribe', topics: [topic] })
    }

    console.log('[Signaling] Unsubscribed from:', topic)
  }

  /**
   * Publish a message to a topic
   * @param {string} topic - Room name
   * @param {object} data - Message data (will be JSON stringified)
   */
  publish(topic, data) {
    const message = {
      type: 'publish',
      topic: topic,
      data: data,
    }

    if (this.connected) {
      this._send(message)
    } else {
      // Queue for when connected
      this.pendingMessages.push(message)
    }
  }

  /**
   * Close the connection
   */
  close() {
    console.log('[Signaling] Closing connection')
    this.shouldReconnect = false
    this.subscriptions.clear()
    this.pendingMessages = []

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
    this.connectionPromise = null
  }

  // Private methods

  _send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message))
    }
  }

  _handleMessage(data) {
    try {
      const message = JSON.parse(data)

      // Handle pong (keepalive)
      if (message.type === 'pong') {
        return
      }

      // Route to subscribers
      if (message.topic && this.subscriptions.has(message.topic)) {
        const callbacks = this.subscriptions.get(message.topic)
        for (const cb of callbacks) {
          try {
            cb(message.data, message)
          } catch (err) {
            console.error('[Signaling] Callback error:', err)
          }
        }
      }
    } catch (err) {
      console.error('[Signaling] Failed to parse message:', err)
    }
  }

  _scheduleReconnect() {
    const delay = RECONNECT_DELAYS[
      Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)
    ]
    this.reconnectAttempt++

    console.log(`[Signaling] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`)

    setTimeout(() => {
      if (this.shouldReconnect && !this.connected) {
        this.connect().catch(err => {
          console.error('[Signaling] Reconnect failed:', err)
        })
      }
    }, delay)
  }
}

/**
 * Create a pairing room name from session ID
 * @param {string} sessionId
 * @returns {string}
 */
export function getPairingRoomName(sessionId) {
  return `pairing-${sessionId}`
}

// Singleton instance for app-wide use (optional)
let defaultClient = null

export function getSignalingClient() {
  if (!defaultClient) {
    defaultClient = new SignalingClient()
  }
  return defaultClient
}

export function closeSignalingClient() {
  if (defaultClient) {
    defaultClient.close()
    defaultClient = null
  }
}
