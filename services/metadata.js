/**
 * Metadata extraction module
 * Fetches a URL and extracts title, description, tags, and favicon
 * Uses only built-in Node.js APIs (no external dependencies)
 *
 * Security: includes SSRF protection to block requests to private/internal networks.
 */

import { lookup } from 'node:dns/promises'

const FETCH_TIMEOUT = 10000
const MAX_BODY_SIZE = 2 * 1024 * 1024 // 2MB limit for HTML
const USER_AGENT = 'Mozilla/5.0 (compatible; Hypermark/1.0; +https://hypermark.app)'

/**
 * Private/reserved IP ranges that must not be fetched (SSRF protection)
 */
const BLOCKED_IP_RANGES = [
  // IPv4
  { start: '0.0.0.0', end: '0.255.255.255' },         // "This" network
  { start: '10.0.0.0', end: '10.255.255.255' },        // Private (RFC 1918)
  { start: '100.64.0.0', end: '100.127.255.255' },     // Shared address space (RFC 6598)
  { start: '127.0.0.0', end: '127.255.255.255' },      // Loopback
  { start: '169.254.0.0', end: '169.254.255.255' },    // Link-local
  { start: '172.16.0.0', end: '172.31.255.255' },      // Private (RFC 1918)
  { start: '192.0.0.0', end: '192.0.0.255' },          // IETF protocol assignments
  { start: '192.168.0.0', end: '192.168.255.255' },    // Private (RFC 1918)
  { start: '198.18.0.0', end: '198.19.255.255' },      // Benchmarking
  { start: '224.0.0.0', end: '239.255.255.255' },      // Multicast
  { start: '240.0.0.0', end: '255.255.255.255' },      // Reserved
]

/**
 * Convert IPv4 address to a 32-bit integer for range comparison
 */
export function ipToInt(ip) {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4 || parts.some(p => isNaN(p) || p < 0 || p > 255)) return null
  return (parts[0] << 24 | parts[1] << 16 | parts[2] << 8 | parts[3]) >>> 0
}

/**
 * Check if an IP address is in a blocked (private/reserved) range
 */
export function isBlockedIP(ip) {
  // Block all IPv6 (conservative - most private services are IPv4)
  if (ip.includes(':')) return true

  const ipInt = ipToInt(ip)
  if (ipInt === null) return true // Unparseable = blocked

  for (const range of BLOCKED_IP_RANGES) {
    const startInt = ipToInt(range.start)
    const endInt = ipToInt(range.end)
    if (ipInt >= startInt && ipInt <= endInt) return true
  }

  return false
}

/**
 * Resolve hostname and check for SSRF before fetching
 * @param {string} hostname
 * @throws {Error} if hostname resolves to a blocked IP
 */
export async function validateHostname(hostname) {
  // Direct IP addresses
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    if (isBlockedIP(hostname)) {
      throw new Error('URL resolves to a blocked IP range')
    }
    return
  }

  // Block localhost variants
  if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    throw new Error('URL resolves to a blocked hostname')
  }

  // DNS resolution check
  try {
    const result = await lookup(hostname)
    if (isBlockedIP(result.address)) {
      throw new Error('URL resolves to a blocked IP range')
    }
  } catch (err) {
    if (err.message.includes('blocked')) throw err
    throw new Error(`DNS resolution failed: ${err.code || err.message}`)
  }
}

/**
 * Fetch a URL and extract metadata
 * @param {string} url - The URL to analyze
 * @returns {Promise<{title: string, description: string, suggestedTags: string[], favicon: string|null}>}
 */
export async function extractMetadata(url) {
  const parsedUrl = new URL(url)

  // SSRF check before fetching
  await validateHostname(parsedUrl.hostname)

  const html = await fetchPage(url)

  const title = extractTitle(html)
  const description = extractDescription(html)
  const suggestedTags = extractTags(html, parsedUrl)
  const favicon = extractFavicon(html, parsedUrl)

  return {
    title: title || parsedUrl.hostname,
    description: description || '',
    suggestedTags: [...new Set(suggestedTags)].slice(0, 8),
    favicon,
  }
}

/**
 * Fetch page HTML with safety limits
 */
async function fetchPage(url) {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) {
      throw new Error('Not an HTML page')
    }

    const reader = response.body.getReader()
    const chunks = []
    let totalSize = 0

    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalSize += value.length
      if (totalSize > MAX_BODY_SIZE) {
        reader.cancel()
        break
      }
      chunks.push(value)
    }

    const decoder = new TextDecoder()
    return chunks.map(chunk => decoder.decode(chunk, { stream: true })).join('')
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * Extract page title (prefers OG title, falls back to <title>)
 */
export function extractTitle(html) {
  const ogTitle = getMetaContent(html, 'og:title', 'property')
  if (ogTitle) return ogTitle

  const twitterTitle = getMetaContent(html, 'twitter:title', 'name')
  if (twitterTitle) return twitterTitle

  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return decodeEntities(titleMatch[1].trim())

  return null
}

/**
 * Extract page description
 */
export function extractDescription(html) {
  const ogDesc = getMetaContent(html, 'og:description', 'property')
  if (ogDesc) return truncate(ogDesc, 300)

  const metaDesc = getMetaContent(html, 'description', 'name')
  if (metaDesc) return truncate(metaDesc, 300)

  const twitterDesc = getMetaContent(html, 'twitter:description', 'name')
  if (twitterDesc) return truncate(twitterDesc, 300)

  return null
}

/**
 * Extract suggested tags from various sources
 */
export function extractTags(html, parsedUrl) {
  const tags = []

  const keywords = getMetaContent(html, 'keywords', 'name')
  if (keywords) {
    keywords.split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 1 && k.length < 30)
      .forEach(k => tags.push(k))
  }

  const articleTags = getAllMetaContent(html, 'article:tag', 'property')
  articleTags
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 1 && t.length < 30)
    .forEach(t => tags.push(t))

  const section = getMetaContent(html, 'article:section', 'property')
  if (section) tags.push(section.trim().toLowerCase())

  const ogType = getMetaContent(html, 'og:type', 'property')
  if (ogType && ogType !== 'website' && ogType !== 'webpage') {
    tags.push(ogType.toLowerCase())
  }

  const pathTags = extractPathTags(parsedUrl.pathname)
  pathTags.forEach(t => tags.push(t))

  return tags
    .map(t => t.replace(/[^\w\s-]/g, '').trim())
    .filter(t => t.length > 1 && t.length < 30)
}

/**
 * Extract tags from URL path segments
 */
export function extractPathTags(pathname) {
  const CATEGORY_PATTERNS = [
    'blog', 'article', 'articles', 'post', 'posts', 'news', 'tutorial',
    'tutorials', 'guide', 'guides', 'docs', 'documentation', 'reference',
    'video', 'videos', 'podcast', 'podcasts', 'tool', 'tools',
    'recipe', 'recipes', 'review', 'reviews', 'research',
  ]

  const segments = pathname.split('/').filter(Boolean)
  const tags = []

  for (const segment of segments.slice(0, 3)) {
    const clean = segment.toLowerCase().replace(/[-_]/g, ' ').trim()
    if (CATEGORY_PATTERNS.includes(clean)) {
      tags.push(clean)
    }
  }

  return tags
}

/**
 * Extract favicon URL
 */
export function extractFavicon(html, parsedUrl) {
  const iconPatterns = [
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']+)["']/i,
    /<link[^>]*href=["']([^"']+)["'][^>]*rel=["'](?:shortcut )?icon["']/i,
    /<link[^>]*rel=["']apple-touch-icon["'][^>]*href=["']([^"']+)["']/i,
  ]

  for (const pattern of iconPatterns) {
    const match = html.match(pattern)
    if (match) {
      try {
        return new URL(match[1], parsedUrl.origin).href
      } catch {
        // ignore malformed URLs
      }
    }
  }

  return `${parsedUrl.origin}/favicon.ico`
}

// ---- Helpers (exported for testing) ----

export function getMetaContent(html, name, attr = 'name') {
  const patterns = [
    new RegExp(`<meta[^>]*${escapeRegex(attr)}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${escapeRegex(attr)}=["']${escapeRegex(name)}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeEntities(match[1].trim())
  }

  return null
}

export function getAllMetaContent(html, name, attr = 'name') {
  const results = []
  const patterns = [
    new RegExp(`<meta[^>]*${escapeRegex(attr)}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'gi'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${escapeRegex(attr)}=["']${escapeRegex(name)}["']`, 'gi'),
  ]

  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(html)) !== null) {
      const val = decodeEntities(match[1].trim())
      if (val && !results.includes(val)) results.push(val)
    }
  }

  return results
}

export function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

export function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max).replace(/\s+\S*$/, '') + '...'
}
