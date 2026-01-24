/**
 * y-webrtc compatible signaling server
 * Handles pub/sub for WebRTC peer discovery and pairing
 */

import { WebSocketServer } from 'ws'

const PORT = process.env.PORT || 4444
const PING_INTERVAL = 30000

const wss = new WebSocketServer({ port: PORT })

// topic -> Set<WebSocket>
const topics = new Map()

// Client ID counter for logging
let clientIdCounter = 0

function send(ws, message) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(message))
  }
}

function subscribe(ws, topicList) {
  for (const topic of topicList) {
    if (!topics.has(topic)) {
      topics.set(topic, new Set())
    }
    topics.get(topic).add(ws)

    if (!ws.topics) ws.topics = new Set()
    ws.topics.add(topic)

    const subscriberCount = topics.get(topic).size
    console.log(`[${ws.clientId}] Subscribed to "${topic}" (${subscriberCount} total)`)
  }
}

function unsubscribe(ws, topicList) {
  for (const topic of topicList) {
    if (topics.has(topic)) {
      topics.get(topic).delete(ws)
      if (topics.get(topic).size === 0) {
        topics.delete(topic)
      }
    }
    if (ws.topics) {
      ws.topics.delete(topic)
    }
  }
}

function publish(ws, topic, data) {
  if (!topics.has(topic)) {
    console.log(`[${ws.clientId}] Publish to "${topic}" - no subscribers`)
    return
  }

  const message = JSON.stringify({ topic, data })
  let sentCount = 0
  let skippedSelf = false
  let skippedClosed = 0

  for (const client of topics.get(topic)) {
    if (client === ws) {
      skippedSelf = true
      continue
    }
    if (client.readyState !== client.OPEN) {
      skippedClosed++
      continue
    }
    client.send(message)
    sentCount++
  }

  console.log(`[${ws.clientId}] Publish to "${topic}" - sent to ${sentCount}, skipped self: ${skippedSelf}, closed: ${skippedClosed}`)
}

function cleanup(ws) {
  if (ws.topics) {
    unsubscribe(ws, Array.from(ws.topics))
  }
}

wss.on('connection', (ws) => {
  ws.clientId = ++clientIdCounter
  ws.isAlive = true
  console.log(`[${ws.clientId}] Connected`)

  ws.on('pong', () => {
    ws.isAlive = true
  })

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString())

      switch (message.type) {
        case 'subscribe':
          subscribe(ws, message.topics || [])
          break
        case 'unsubscribe':
          unsubscribe(ws, message.topics || [])
          break
        case 'publish':
          publish(ws, message.topic, message.data)
          break
        case 'ping':
          send(ws, { type: 'pong' })
          break
      }
    } catch (err) {
      console.error(`[${ws.clientId}] Failed to parse message:`, err)
    }
  })

  ws.on('close', () => {
    console.log(`[${ws.clientId}] Disconnected`)
    cleanup(ws)
  })

  ws.on('error', (err) => {
    console.error(`[${ws.clientId}] WebSocket error:`, err)
    cleanup(ws)
  })
})

// Heartbeat to detect dead connections
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      cleanup(ws)
      return ws.terminate()
    }
    ws.isAlive = false
    ws.ping()
  })
}, PING_INTERVAL)

wss.on('close', () => {
  clearInterval(interval)
})

console.log(`Signaling server running on port ${PORT}`)
