# Hypermark Services

Backend services for Hypermark, deployed as a single lightweight Node.js process.

## Services

### 1. WebRTC Signaling (WebSocket)

Pub/sub message relay for WebRTC peer discovery. Used by Hypermark for:
- **Device pairing** - temporary rooms for secure key exchange
- **Real-time sync** - y-webrtc provider coordination

The signaling server **never sees your data** - all bookmark content is encrypted end-to-end. It only relays opaque signaling messages between your devices.

### 2. Content Suggestions (HTTP)

Metadata extraction API for bookmark enrichment. When a user adds a bookmark, this service can:
- Extract the page **title** (from `<title>`, Open Graph, Twitter cards)
- Extract the page **description** (from meta tags)
- Suggest **tags** (from meta keywords, article:tag, URL path patterns)
- Find the **favicon** URL

**Privacy**: This service receives the bookmark URL and fetches the page to extract metadata. It is:
- **Stateless** - no logging, no cookies, no sessions, no auth
- **Opt-in** - disabled by default in the client app
- **Self-hostable** - deploy your own instance
- **Disableable** - set `DISABLE_SUGGESTIONS=true` to run signaling-only

## Deployment

### Fly.io (recommended)

```bash
cd services
fly launch    # first time - creates the app
fly deploy    # subsequent deploys
```

The included `fly.toml` configures:
- 256MB shared-cpu VM (fits in free tier)
- Auto-start/stop to save resources
- Forced HTTPS

### Docker

```bash
cd services
docker build -t hypermark-services .
docker run -p 8080:8080 -e PORT=8080 hypermark-services
```

### Node.js directly

```bash
cd services
npm install
node server.js
```

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `PORT` | `4444` | Server port |
| `DISABLE_SUGGESTIONS` | `false` | Set to `true` to disable the suggestion API entirely |
| `RATE_LIMIT_RPM` | `30` | Max suggestion requests per minute per IP |

### Signaling-only mode

To run only the signaling service without the suggestion API:

```bash
DISABLE_SUGGESTIONS=true node server.js
```

The health endpoint will reflect this: `GET /api/health` returns `{"status":"ok","services":["signaling"]}`.

## API

### `GET /api/health`

Health check. Returns enabled services.

```json
{"status": "ok", "services": ["signaling", "suggest"]}
```

### `POST /api/suggest`

Extract metadata from a URL.

**Request:**
```json
{"url": "https://example.com/article"}
```

**Response:**
```json
{
  "title": "Article Title",
  "description": "A brief description of the article...",
  "suggestedTags": ["blog", "technology", "javascript"],
  "favicon": "https://example.com/favicon.ico"
}
```

**Error responses:**
- `400` - Invalid or missing URL
- `403` - URL resolves to a blocked IP range (SSRF protection)
- `429` - Rate limit exceeded (includes `Retry-After` header)
- `502` - Target URL returned an error
- `500` - Internal error

**Rate limiting headers:**
- `X-RateLimit-Limit` - Max requests per window
- `X-RateLimit-Remaining` - Requests remaining in current window

### WebSocket (signaling)

Connect via WebSocket to the same port. Protocol is y-webrtc compatible:

```javascript
// Subscribe to a topic
ws.send(JSON.stringify({ type: 'subscribe', topics: ['room-name'] }))

// Publish to a topic (broadcast to other subscribers)
ws.send(JSON.stringify({ type: 'publish', topic: 'room-name', data: { ... } }))

// Unsubscribe
ws.send(JSON.stringify({ type: 'unsubscribe', topics: ['room-name'] }))

// Keepalive
ws.send(JSON.stringify({ type: 'ping' }))
// Server responds with: { type: 'pong' }
```

## Security

### SSRF Protection

The suggestion API validates all URLs before fetching:
- **Blocked**: `localhost`, `.local`, `.internal` hostnames
- **Blocked**: Private IP ranges (10.x, 172.16-31.x, 192.168.x, 127.x)
- **Blocked**: Link-local (169.254.x.x), shared address space (100.64-127.x.x)
- **Blocked**: All IPv6 addresses (conservative policy)
- DNS resolution is checked against blocked ranges before any HTTP request

### Rate Limiting

In-memory per-IP rate limiting (default 30 req/min) prevents abuse. Rate limit headers are included in responses. The client handles 429 responses gracefully.

### Request Limits

- Request body: 4KB max
- Fetched HTML: 2MB max
- Fetch timeout: 10 seconds

## Testing

```bash
cd services
npm test
```

Tests cover metadata extraction, SSRF protection, IP blocking, and helper functions.
