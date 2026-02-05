/**
 * Hypermark server
 * - WebSocket: y-webrtc compatible signaling (pub/sub for WebRTC peer discovery and pairing)
 * - HTTP: Content suggestion API (metadata extraction for bookmarks)
 */

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { extractMetadata } from './metadata.js'

const PORT = process.env.PORT || 4444
const PING_INTERVAL = 30000
const MAX_REQUEST_SIZE = 4096

// ---- HTTP Server ----

const httpServer = createServer(async (req, res) => {
  // CORS headers (stateless, no cookies)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  // Health check
  if (req.method === 'GET' && req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', services: ['signaling', 'suggest'] }))
    return
  }

  // Content suggestion endpoint
  if (req.method === 'POST' && req.url === '/api/suggest') {
    try {
      const body = await readBody(req)
      const { url } = JSON.parse(body)

      if (!url || typeof url !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'url is required' }))
        return
      }

      // Validate URL format
      let parsed
      try {
        parsed = new URL(url)
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Invalid URL format' }))
        return
      }

      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Only http/https URLs are supported' }))
        return
      }

      const metadata = await extractMetadata(url)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(metadata))
    } catch (err) {
      console.error('[Suggest] Error:', err.message)
      const status = err.message.includes('HTTP ') ? 502 : 500
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Failed to fetch metadata', detail: err.message }))
    }
    return
  }

  // 404 for everything else
  res.writeHead(404, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'Not found' }))
})

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    let size = 0
    req.on('data', (chunk) => {
      size += chunk.length
      if (size > MAX_REQUEST_SIZE) {
        reject(new Error('Request body too large'))
        req.destroy()
        return
      }
      data += chunk
    })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

// ---- WebSocket Signaling ----

const wss = new WebSocketServer({ server: httpServer })

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

// ---- Start ----

httpServer.listen(PORT, () => {
  console.log(`Hypermark server running on port ${PORT}`)
  console.log(`  WebSocket signaling: ws://localhost:${PORT}`)
  console.log(`  Content suggestion:  http://localhost:${PORT}/api/suggest`)
  console.log(`  Health check:        http://localhost:${PORT}/api/health`)
})
