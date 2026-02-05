import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  extractTitle,
  extractDescription,
  extractTags,
  extractPathTags,
  extractFavicon,
  getMetaContent,
  getAllMetaContent,
  decodeEntities,
  truncate,
  escapeRegex,
  ipToInt,
  isBlockedIP,
  validateHostname,
} from '../metadata.js'

// ---- Title Extraction ----

describe('extractTitle', () => {
  it('extracts og:title', () => {
    const html = '<meta property="og:title" content="OG Title">'
    assert.equal(extractTitle(html), 'OG Title')
  })

  it('extracts twitter:title', () => {
    const html = '<meta name="twitter:title" content="Twitter Title">'
    assert.equal(extractTitle(html), 'Twitter Title')
  })

  it('extracts <title> tag', () => {
    const html = '<html><head><title>Page Title</title></head></html>'
    assert.equal(extractTitle(html), 'Page Title')
  })

  it('prefers og:title over <title>', () => {
    const html = '<meta property="og:title" content="OG"><title>HTML Title</title>'
    assert.equal(extractTitle(html), 'OG')
  })

  it('returns null when no title found', () => {
    assert.equal(extractTitle('<html><body>No title here</body></html>'), null)
  })

  it('decodes HTML entities in title', () => {
    const html = '<title>Tom &amp; Jerry&#39;s &quot;Adventure&quot;</title>'
    assert.equal(extractTitle(html), 'Tom & Jerry\'s "Adventure"')
  })

  it('trims whitespace from title', () => {
    const html = '<title>  Spaced Title  </title>'
    assert.equal(extractTitle(html), 'Spaced Title')
  })
})

// ---- Description Extraction ----

describe('extractDescription', () => {
  it('extracts og:description', () => {
    const html = '<meta property="og:description" content="OG description text">'
    assert.equal(extractDescription(html), 'OG description text')
  })

  it('extracts meta description', () => {
    const html = '<meta name="description" content="Meta description text">'
    assert.equal(extractDescription(html), 'Meta description text')
  })

  it('extracts twitter:description', () => {
    const html = '<meta name="twitter:description" content="Twitter desc">'
    assert.equal(extractDescription(html), 'Twitter desc')
  })

  it('prefers og:description over meta description', () => {
    const html = '<meta property="og:description" content="OG"><meta name="description" content="Meta">'
    assert.equal(extractDescription(html), 'OG')
  })

  it('returns null when no description found', () => {
    assert.equal(extractDescription('<html></html>'), null)
  })

  it('truncates long descriptions', () => {
    const long = 'word '.repeat(100)
    const html = `<meta name="description" content="${long}">`
    const result = extractDescription(html)
    assert.ok(result.length <= 303) // 300 + "..."
    assert.ok(result.endsWith('...'))
  })
})

// ---- Tag Extraction ----

describe('extractTags', () => {
  it('extracts meta keywords', () => {
    const html = '<meta name="keywords" content="javascript, react, web dev">'
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(tags.includes('javascript'))
    assert.ok(tags.includes('react'))
    assert.ok(tags.includes('web dev'))
  })

  it('extracts article:tag properties', () => {
    const html = `
      <meta property="article:tag" content="TypeScript">
      <meta property="article:tag" content="Node.js">
    `
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(tags.includes('typescript'))
    assert.ok(tags.includes('nodejs'))
  })

  it('extracts article:section', () => {
    const html = '<meta property="article:section" content="Technology">'
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(tags.includes('technology'))
  })

  it('extracts og:type when specific', () => {
    const html = '<meta property="og:type" content="article">'
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(tags.includes('article'))
  })

  it('ignores og:type "website"', () => {
    const html = '<meta property="og:type" content="website">'
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(!tags.includes('website'))
  })

  it('filters tags by length', () => {
    const html = '<meta name="keywords" content="a, valid-tag, ' + 'x'.repeat(40) + '">'
    const tags = extractTags(html, new URL('https://example.com'))
    assert.ok(!tags.includes('a')) // too short
    assert.ok(tags.includes('valid-tag'))
    assert.ok(!tags.some(t => t.length >= 30)) // too long filtered
  })

  it('returns empty array when no tags found', () => {
    const tags = extractTags('<html></html>', new URL('https://example.com'))
    assert.deepEqual(tags, [])
  })
})

// ---- Path Tags ----

describe('extractPathTags', () => {
  it('extracts known category patterns', () => {
    assert.deepEqual(extractPathTags('/blog/my-post'), ['blog'])
    assert.deepEqual(extractPathTags('/tutorials/react'), ['tutorials'])
    assert.deepEqual(extractPathTags('/docs/api/reference'), ['docs', 'reference'])
  })

  it('ignores non-category path segments', () => {
    assert.deepEqual(extractPathTags('/abc123/my-post'), [])
    assert.deepEqual(extractPathTags('/user/profile/settings'), [])
  })

  it('handles root path', () => {
    assert.deepEqual(extractPathTags('/'), [])
  })

  it('only checks first 3 segments', () => {
    const tags = extractPathTags('/blog/docs/guide/tools')
    assert.ok(tags.length <= 3)
    assert.ok(!tags.includes('tools'))
  })
})

// ---- Favicon Extraction ----

describe('extractFavicon', () => {
  const origin = new URL('https://example.com')

  it('extracts link rel="icon"', () => {
    const html = '<link rel="icon" href="/favicon.png">'
    assert.equal(extractFavicon(html, origin), 'https://example.com/favicon.png')
  })

  it('extracts shortcut icon', () => {
    const html = '<link rel="shortcut icon" href="/icon.ico">'
    assert.equal(extractFavicon(html, origin), 'https://example.com/icon.ico')
  })

  it('extracts apple-touch-icon', () => {
    const html = '<link rel="apple-touch-icon" href="/apple-icon.png">'
    assert.equal(extractFavicon(html, origin), 'https://example.com/apple-icon.png')
  })

  it('resolves relative URLs', () => {
    const html = '<link rel="icon" href="assets/icon.svg">'
    assert.equal(extractFavicon(html, origin), 'https://example.com/assets/icon.svg')
  })

  it('resolves absolute URLs', () => {
    const html = '<link rel="icon" href="https://cdn.example.com/icon.png">'
    assert.equal(extractFavicon(html, origin), 'https://cdn.example.com/icon.png')
  })

  it('falls back to /favicon.ico', () => {
    const html = '<html><head></head></html>'
    assert.equal(extractFavicon(html, origin), 'https://example.com/favicon.ico')
  })

  it('handles href before rel ordering', () => {
    const html = '<link href="/custom.ico" rel="icon">'
    assert.equal(extractFavicon(html, origin), 'https://example.com/custom.ico')
  })
})

// ---- Meta Content Parsing ----

describe('getMetaContent', () => {
  it('matches attr-first ordering', () => {
    const html = '<meta property="og:title" content="Title">'
    assert.equal(getMetaContent(html, 'og:title', 'property'), 'Title')
  })

  it('matches content-first ordering', () => {
    const html = '<meta content="Title" property="og:title">'
    assert.equal(getMetaContent(html, 'og:title', 'property'), 'Title')
  })

  it('handles single quotes', () => {
    const html = "<meta property='og:title' content='Single Quoted'>"
    assert.equal(getMetaContent(html, 'og:title', 'property'), 'Single Quoted')
  })

  it('returns null when not found', () => {
    assert.equal(getMetaContent('<html></html>', 'og:title', 'property'), null)
  })

  it('is case-insensitive', () => {
    const html = '<META PROPERTY="og:title" CONTENT="Upper Case">'
    assert.equal(getMetaContent(html, 'og:title', 'property'), 'Upper Case')
  })
})

describe('getAllMetaContent', () => {
  it('finds multiple values', () => {
    const html = `
      <meta property="article:tag" content="React">
      <meta property="article:tag" content="JavaScript">
      <meta property="article:tag" content="Web">
    `
    const results = getAllMetaContent(html, 'article:tag', 'property')
    assert.deepEqual(results, ['React', 'JavaScript', 'Web'])
  })

  it('deduplicates', () => {
    const html = `
      <meta property="article:tag" content="React">
      <meta property="article:tag" content="React">
    `
    const results = getAllMetaContent(html, 'article:tag', 'property')
    assert.deepEqual(results, ['React'])
  })

  it('returns empty array when none found', () => {
    assert.deepEqual(getAllMetaContent('<html></html>', 'article:tag', 'property'), [])
  })
})

// ---- Helpers ----

describe('decodeEntities', () => {
  it('decodes &amp;', () => {
    assert.equal(decodeEntities('Tom &amp; Jerry'), 'Tom & Jerry')
  })

  it('decodes &lt; and &gt;', () => {
    assert.equal(decodeEntities('&lt;div&gt;'), '<div>')
  })

  it('decodes &quot;', () => {
    assert.equal(decodeEntities('&quot;quoted&quot;'), '"quoted"')
  })

  it('decodes &#39; and &#x27;', () => {
    assert.equal(decodeEntities("it&#39;s"), "it's")
    assert.equal(decodeEntities("it&#x27;s"), "it's")
  })

  it('decodes numeric entities', () => {
    assert.equal(decodeEntities('&#169;'), '\u00A9') // copyright symbol
  })
})

describe('truncate', () => {
  it('returns short strings unchanged', () => {
    assert.equal(truncate('hello', 10), 'hello')
  })

  it('truncates at word boundary', () => {
    const result = truncate('hello world this is a test', 15)
    assert.ok(result.endsWith('...'))
    assert.ok(result.length <= 18) // 15 + "..."
  })

  it('handles exact length', () => {
    assert.equal(truncate('exact', 5), 'exact')
  })
})

describe('escapeRegex', () => {
  it('escapes special characters', () => {
    assert.equal(escapeRegex('a.b'), 'a\\.b')
    assert.equal(escapeRegex('a+b'), 'a\\+b')
    assert.equal(escapeRegex('a(b)'), 'a\\(b\\)')
  })
})

// ---- SSRF Protection ----

describe('ipToInt', () => {
  it('converts valid IPv4', () => {
    assert.equal(ipToInt('0.0.0.0'), 0)
    assert.equal(ipToInt('0.0.0.1'), 1)
    assert.equal(ipToInt('255.255.255.255'), 4294967295)
    assert.equal(ipToInt('192.168.1.1'), (192 << 24 | 168 << 16 | 1 << 8 | 1) >>> 0)
  })

  it('returns null for invalid IPs', () => {
    assert.equal(ipToInt('not-an-ip'), null)
    assert.equal(ipToInt('256.0.0.1'), null)
    assert.equal(ipToInt('1.2.3'), null)
    assert.equal(ipToInt(''), null)
  })
})

describe('isBlockedIP', () => {
  it('blocks loopback (127.x.x.x)', () => {
    assert.ok(isBlockedIP('127.0.0.1'))
    assert.ok(isBlockedIP('127.255.255.255'))
  })

  it('blocks private ranges (10.x, 172.16-31.x, 192.168.x)', () => {
    assert.ok(isBlockedIP('10.0.0.1'))
    assert.ok(isBlockedIP('10.255.255.255'))
    assert.ok(isBlockedIP('172.16.0.1'))
    assert.ok(isBlockedIP('172.31.255.255'))
    assert.ok(isBlockedIP('192.168.0.1'))
    assert.ok(isBlockedIP('192.168.255.255'))
  })

  it('blocks link-local (169.254.x.x)', () => {
    assert.ok(isBlockedIP('169.254.169.254')) // AWS metadata
    assert.ok(isBlockedIP('169.254.0.1'))
  })

  it('blocks shared address space (100.64-127.x.x)', () => {
    assert.ok(isBlockedIP('100.64.0.1'))
    assert.ok(isBlockedIP('100.127.255.255'))
  })

  it('allows public IPs', () => {
    assert.ok(!isBlockedIP('8.8.8.8'))
    assert.ok(!isBlockedIP('1.1.1.1'))
    assert.ok(!isBlockedIP('93.184.216.34')) // example.com
    assert.ok(!isBlockedIP('172.32.0.1')) // just outside 172.16-31 range
    assert.ok(!isBlockedIP('100.63.255.255')) // just below shared address space
  })

  it('blocks IPv6 addresses', () => {
    assert.ok(isBlockedIP('::1'))
    assert.ok(isBlockedIP('fe80::1'))
    assert.ok(isBlockedIP('2001:db8::1'))
  })

  it('blocks unparseable addresses', () => {
    assert.ok(isBlockedIP('garbage'))
    assert.ok(isBlockedIP(''))
  })
})

describe('validateHostname', () => {
  it('blocks localhost', async () => {
    await assert.rejects(
      () => validateHostname('localhost'),
      { message: /blocked hostname/ }
    )
  })

  it('blocks .local domains', async () => {
    await assert.rejects(
      () => validateHostname('myserver.local'),
      { message: /blocked hostname/ }
    )
  })

  it('blocks .internal domains', async () => {
    await assert.rejects(
      () => validateHostname('metadata.internal'),
      { message: /blocked hostname/ }
    )
  })

  it('blocks private IPs directly', async () => {
    await assert.rejects(
      () => validateHostname('127.0.0.1'),
      { message: /blocked IP/ }
    )
    await assert.rejects(
      () => validateHostname('10.0.0.1'),
      { message: /blocked IP/ }
    )
    await assert.rejects(
      () => validateHostname('192.168.1.1'),
      { message: /blocked IP/ }
    )
    await assert.rejects(
      () => validateHostname('169.254.169.254'),
      { message: /blocked IP/ }
    )
  })

  it('allows public IPs directly', async () => {
    // This just validates the IP check, doesn't actually connect
    await assert.doesNotReject(() => validateHostname('8.8.8.8'))
  })
})
