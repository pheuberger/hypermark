/**
 * Hypermark services
 * - WebSocket: y-webrtc compatible signaling (pub/sub for WebRTC peer discovery and pairing)
 * - HTTP: Content suggestion API (metadata extraction for bookmarks)
 *
 * Environment variables:
 *   PORT                  - Server port (default: 4444)
 *   DISABLE_SUGGESTIONS   - Set to "true" to disable the /api/suggest endpoint
 *   RATE_LIMIT_RPM        - Max requests per minute per IP for /api/suggest (default: 30)
 */

import { createServer } from 'node:http'
import { WebSocketServer } from 'ws'
import { extractMetadata } from './metadata.js'

const PORT = process.env.PORT || 4444
const PING_INTERVAL = 30000
const MAX_REQUEST_SIZE = 4096
const SUGGESTIONS_DISABLED = process.env.DISABLE_SUGGESTIONS === 'true'
const RATE_LIMIT_RPM = parseInt(process.env.RATE_LIMIT_RPM, 10) || 30
const RATE_LIMIT_WINDOW = 60_000 // 1 minute

// ---- Rate Limiter (in-memory, per-IP) ----

const rateLimitStore = new Map() // ip -> { count, resetAt }

function checkRateLimit(ip) {
  const now = Date.now()
  const entry = rateLimitStore.get(ip)

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW })
    return { allowed: true, remaining: RATE_LIMIT_RPM - 1 }
  }

  entry.count++
  if (entry.count > RATE_LIMIT_RPM) {
    return { allowed: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) }
  }

  return { allowed: true, remaining: RATE_LIMIT_RPM - entry.count }
}

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now()
  for (const [ip, entry] of rateLimitStore) {
    if (now > entry.resetAt) rateLimitStore.delete(ip)
  }
}, 5 * 60_000)

function getClientIP(req) {
  // Fly.io sets Fly-Client-IP; standard proxies use X-Forwarded-For
  return req.headers['fly-client-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress
    || 'unknown'
}

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
    const services = ['signaling']
    if (!SUGGESTIONS_DISABLED) services.push('suggest')
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', services }))
    return
  }

  // Content suggestion endpoint
  if (req.method === 'POST' && req.url === '/api/suggest') {
    if (SUGGESTIONS_DISABLED) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Suggestions are disabled on this server' }))
      return
    }

    // Rate limit
    const ip = getClientIP(req)
    const limit = checkRateLimit(ip)
    res.setHeader('X-RateLimit-Limit', RATE_LIMIT_RPM)
    res.setHeader('X-RateLimit-Remaining', limit.remaining)

    if (!limit.allowed) {
      res.setHeader('Retry-After', limit.retryAfter)
      res.writeHead(429, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Rate limit exceeded', retryAfter: limit.retryAfter }))
      return
    }

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

      if (err.message.includes('blocked')) {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'URL is not allowed', detail: err.message }))
        return
      }

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
  console.log(`Hypermark services running on port ${PORT}`)
  console.log(`  WebSocket signaling: ws://localhost:${PORT}`)
  if (SUGGESTIONS_DISABLED) {
    console.log('  Content suggestions: DISABLED')
  } else {
    console.log(`  Content suggestions: http://localhost:${PORT}/api/suggest (${RATE_LIMIT_RPM} req/min)`)
  }
  console.log(`  Health check:        http://localhost:${PORT}/api/health`)
})

// Export for testing
export { httpServer, wss, checkRateLimit, getClientIP }
