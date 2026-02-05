/**
 * Metadata extraction module
 * Fetches a URL and extracts title, description, tags, and favicon
 * Uses only built-in Node.js APIs (no external dependencies)
 */

const FETCH_TIMEOUT = 10000
const MAX_BODY_SIZE = 2 * 1024 * 1024 // 2MB limit for HTML
const USER_AGENT = 'Mozilla/5.0 (compatible; Hypermark/1.0; +https://hypermark.app)'

/**
 * Fetch a URL and extract metadata
 * @param {string} url - The URL to analyze
 * @returns {Promise<{title: string, description: string, suggestedTags: string[], favicon: string|null}>}
 */
export async function extractMetadata(url) {
  const html = await fetchPage(url)
  const parsedUrl = new URL(url)

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
function extractTitle(html) {
  // Try og:title first
  const ogTitle = getMetaContent(html, 'og:title', 'property')
  if (ogTitle) return ogTitle

  // Try twitter:title
  const twitterTitle = getMetaContent(html, 'twitter:title', 'name')
  if (twitterTitle) return twitterTitle

  // Fall back to <title> tag
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i)
  if (titleMatch) return decodeEntities(titleMatch[1].trim())

  return null
}

/**
 * Extract page description
 */
function extractDescription(html) {
  // Try og:description first
  const ogDesc = getMetaContent(html, 'og:description', 'property')
  if (ogDesc) return truncate(ogDesc, 300)

  // Try meta description
  const metaDesc = getMetaContent(html, 'description', 'name')
  if (metaDesc) return truncate(metaDesc, 300)

  // Try twitter:description
  const twitterDesc = getMetaContent(html, 'twitter:description', 'name')
  if (twitterDesc) return truncate(twitterDesc, 300)

  return null
}

/**
 * Extract suggested tags from various sources
 */
function extractTags(html, parsedUrl) {
  const tags = []

  // 1. Meta keywords
  const keywords = getMetaContent(html, 'keywords', 'name')
  if (keywords) {
    keywords.split(',')
      .map(k => k.trim().toLowerCase())
      .filter(k => k.length > 1 && k.length < 30)
      .forEach(k => tags.push(k))
  }

  // 2. article:tag meta properties (multiple allowed)
  const articleTags = getAllMetaContent(html, 'article:tag', 'property')
  articleTags
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 1 && t.length < 30)
    .forEach(t => tags.push(t))

  // 3. article:section
  const section = getMetaContent(html, 'article:section', 'property')
  if (section) tags.push(section.trim().toLowerCase())

  // 4. og:type (if specific enough)
  const ogType = getMetaContent(html, 'og:type', 'property')
  if (ogType && ogType !== 'website' && ogType !== 'webpage') {
    tags.push(ogType.toLowerCase())
  }

  // 5. URL path hints
  const pathTags = extractPathTags(parsedUrl.pathname)
  pathTags.forEach(t => tags.push(t))

  // Filter and deduplicate
  return tags
    .map(t => t.replace(/[^\w\s-]/g, '').trim())
    .filter(t => t.length > 1 && t.length < 30)
}

/**
 * Extract tags from URL path segments
 * e.g., /blog/javascript/async-await -> ['blog', 'javascript']
 */
function extractPathTags(pathname) {
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
    // Only include if it looks like a category, not an ID or slug
    if (CATEGORY_PATTERNS.includes(clean)) {
      tags.push(clean)
    }
  }

  return tags
}

/**
 * Extract favicon URL
 */
function extractFavicon(html, parsedUrl) {
  // Try link[rel="icon"] variants
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

  // Default to /favicon.ico
  return `${parsedUrl.origin}/favicon.ico`
}

// ---- Helpers ----

/**
 * Get content of a meta tag
 */
function getMetaContent(html, name, attr = 'name') {
  // Match both orderings: attr before content, and content before attr
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escapeRegex(name)}["']`, 'i'),
  ]

  for (const pattern of patterns) {
    const match = html.match(pattern)
    if (match) return decodeEntities(match[1].trim())
  }

  return null
}

/**
 * Get all matching meta tag contents (for tags that appear multiple times)
 */
function getAllMetaContent(html, name, attr = 'name') {
  const results = []
  const patterns = [
    new RegExp(`<meta[^>]*${attr}=["']${escapeRegex(name)}["'][^>]*content=["']([^"']*)["']`, 'gi'),
    new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*${attr}=["']${escapeRegex(name)}["']`, 'gi'),
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

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
}

function truncate(str, max) {
  if (str.length <= max) return str
  return str.slice(0, max).replace(/\s+\S*$/, '') + '...'
}
