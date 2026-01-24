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
  if (!topics.has(topic)) return

  const message = JSON.stringify({ topic, data })

  for (const client of topics.get(topic)) {
    // Don't send back to sender
    if (client !== ws && client.readyState === client.OPEN) {
      client.send(message)
    }
  }
}

function cleanup(ws) {
  if (ws.topics) {
    unsubscribe(ws, Array.from(ws.topics))
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true

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
      console.error('Failed to parse message:', err)
    }
  })

  ws.on('close', () => {
    cleanup(ws)
  })

  ws.on('error', (err) => {
    console.error('WebSocket error:', err)
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
