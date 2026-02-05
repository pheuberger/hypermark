/**
 * Bookmark Import/Export Service Tests
 * Tests for src/services/bookmark-io.js
 *
 * Tests Netscape HTML export/import functionality including:
 * - HTML format generation
 * - HTML parsing
 * - Folder-to-tags conversion
 * - Duplicate detection
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportToNetscapeHtml, importFromNetscapeHtml } from './bookmark-io.js'
import * as bookmarksService from './bookmarks.js'

// Mock the bookmarks service
vi.mock('./bookmarks.js', async () => {
  const actual = await vi.importActual('./bookmarks.js')
  return {
    ...actual,
    getAllBookmarks: vi.fn(),
    createBookmark: vi.fn(),
    findBookmarksByUrl: vi.fn(),
  }
})

describe('bookmark-io service', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('exportToNetscapeHtml', () => {
    it('generates valid Netscape HTML header', () => {
      bookmarksService.getAllBookmarks.mockReturnValue([])
      const html = exportToNetscapeHtml()

      expect(html).toContain('<!DOCTYPE NETSCAPE-Bookmark-file-1>')
      expect(html).toContain('<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">')
      expect(html).toContain('<TITLE>Bookmarks</TITLE>')
      expect(html).toContain('<H1>Bookmarks</H1>')
      expect(html).toContain('<DL><p>')
      expect(html).toContain('</DL><p>')
    })

    it('exports bookmark with basic attributes', () => {
      const bookmark = {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        tags: [],
        createdAt: 1700000000000,
        updatedAt: 1700000100000,
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('HREF="https://example.com"')
      expect(html).toContain('>Example</A>')
      expect(html).toContain('ADD_DATE="1700000000"')
      expect(html).toContain('LAST_MODIFIED="1700000100"')
    })

    it('exports tags as TAGS attribute', () => {
      const bookmark = {
        url: 'https://example.com',
        title: 'Example',
        description: '',
        tags: ['programming', 'javascript'],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('TAGS="programming,javascript"')
    })

    it('exports description as DD element', () => {
      const bookmark = {
        url: 'https://example.com',
        title: 'Example',
        description: 'A great website',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('<DD>A great website')
    })

    it('escapes HTML in title', () => {
      const bookmark = {
        url: 'https://example.com',
        title: '<script>alert("xss")</script>',
        description: '',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).not.toContain('<script>')
      expect(html).toContain('&lt;script&gt;')
    })

    it('escapes HTML in URL', () => {
      const bookmark = {
        url: 'https://example.com?q=<test>&a=1',
        title: 'Example',
        description: '',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('&lt;test&gt;')
      expect(html).toContain('&amp;a=1')
    })

    it('escapes quotes in attributes', () => {
      const bookmark = {
        url: 'https://example.com',
        title: 'Test "Quote"',
        description: '',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('&quot;Quote&quot;')
    })

    it('exports multiple bookmarks', () => {
      const bookmarks = [
        { url: 'https://a.com', title: 'A', description: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
        { url: 'https://b.com', title: 'B', description: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
        { url: 'https://c.com', title: 'C', description: '', tags: [], createdAt: Date.now(), updatedAt: Date.now() },
      ]
      bookmarksService.getAllBookmarks.mockReturnValue(bookmarks)
      const html = exportToNetscapeHtml()

      expect(html).toContain('HREF="https://a.com"')
      expect(html).toContain('HREF="https://b.com"')
      expect(html).toContain('HREF="https://c.com"')
    })

    it('uses URL as title fallback', () => {
      const bookmark = {
        url: 'https://example.com/page',
        title: '',
        description: '',
        tags: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }
      bookmarksService.getAllBookmarks.mockReturnValue([bookmark])
      const html = exportToNetscapeHtml()

      expect(html).toContain('>https://example.com/page</A>')
    })
  })

  describe('importFromNetscapeHtml', () => {
    beforeEach(() => {
      bookmarksService.findBookmarksByUrl.mockReturnValue([])
      bookmarksService.createBookmark.mockImplementation((data) => ({
        id: `bookmark:${Date.now()}`,
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
    })

    it('imports simple bookmark', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com" ADD_DATE="1700000000">Example</A>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(1)
      expect(result.imported).toBe(1)
      expect(result.skipped).toBe(0)
      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://example.com',
          title: 'Example',
        })
      )
    })

    it('imports bookmark with description', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com">Example</A>
          <DD>A great website
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'A great website',
        })
      )
    })

    it('imports tags from TAGS attribute', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com" TAGS="programming,javascript">Example</A>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['programming', 'javascript']),
        })
      )
    })

    it('converts folder hierarchy to tags', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><H3>Development</H3>
          <DL><p>
            <DT><A HREF="https://example.com">Example</A>
          </DL><p>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['development']),
        })
      )
    })

    it('converts nested folder hierarchy to multiple tags', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><H3>Development</H3>
          <DL><p>
            <DT><H3>JavaScript</H3>
            <DL><p>
              <DT><A HREF="https://example.com">Example</A>
            </DL><p>
          </DL><p>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['development', 'javascript']),
        })
      )
    })

    it('skips root browser folders', () => {
      const rootFolders = [
        'Bookmarks Bar',
        'Other Bookmarks',
        'Mobile Bookmarks',
        'Bookmarks Menu',
      ]

      for (const folder of rootFolders) {
        vi.clearAllMocks()
        bookmarksService.findBookmarksByUrl.mockReturnValue([])
        bookmarksService.createBookmark.mockImplementation((data) => ({ id: 'test', ...data }))

        const html = `
          <!DOCTYPE NETSCAPE-Bookmark-file-1>
          <DL><p>
            <DT><H3>${folder}</H3>
            <DL><p>
              <DT><A HREF="https://example.com">Example</A>
            </DL><p>
          </DL><p>
        `

        importFromNetscapeHtml(html)

        expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
          expect.objectContaining({
            tags: expect.not.arrayContaining([folder.toLowerCase()]),
          })
        )
      }
    })

    it('skips duplicate bookmarks by URL', () => {
      bookmarksService.findBookmarksByUrl.mockReturnValue([{ id: 'existing', url: 'https://example.com' }])

      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com">Example</A>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(1)
      expect(result.imported).toBe(0)
      expect(result.skipped).toBe(1)
      expect(bookmarksService.createBookmark).not.toHaveBeenCalled()
    })

    it('skips invalid URLs', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="javascript:alert(1)">XSS</A>
          <DT><A HREF="https://example.com">Valid</A>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(2)
      expect(result.imported).toBe(1)
      expect(result.errors).toHaveLength(1)
    })

    it('handles missing URL gracefully', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A>No URL</A>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(1)
      expect(result.imported).toBe(0)
      expect(result.errors).toHaveLength(1)
    })

    it('uses hostname as title fallback', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com/page"></A>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'example.com',
        })
      )
    })

    it('imports multiple bookmarks', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://a.com">A</A>
          <DT><A HREF="https://b.com">B</A>
          <DT><A HREF="https://c.com">C</A>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(3)
      expect(result.imported).toBe(3)
      expect(bookmarksService.createBookmark).toHaveBeenCalledTimes(3)
    })

    it('handles empty file', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
        </DL><p>
      `

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(0)
      expect(result.imported).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('handles malformed HTML gracefully', () => {
      const html = 'not valid html at all'

      const result = importFromNetscapeHtml(html)

      expect(result.total).toBe(0)
      expect(result.errors).toHaveLength(0)
    })

    it('combines TAGS attribute with folder hierarchy', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><H3>Development</H3>
          <DL><p>
            <DT><A HREF="https://example.com" TAGS="tutorial,guide">Example</A>
          </DL><p>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['development', 'tutorial', 'guide']),
        })
      )
    })

    it('lowercases tags', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><A HREF="https://example.com" TAGS="JavaScript,REACT">Example</A>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: expect.arrayContaining(['javascript', 'react']),
        })
      )
    })

    it('deduplicates tags', () => {
      const html = `
        <!DOCTYPE NETSCAPE-Bookmark-file-1>
        <DL><p>
          <DT><H3>JavaScript</H3>
          <DL><p>
            <DT><A HREF="https://example.com" TAGS="javascript,react">Example</A>
          </DL><p>
        </DL><p>
      `

      importFromNetscapeHtml(html)

      const callArgs = bookmarksService.createBookmark.mock.calls[0][0]
      const tagCounts = {}
      callArgs.tags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1
      })

      // Each tag should only appear once
      Object.values(tagCounts).forEach(count => {
        expect(count).toBe(1)
      })
    })
  })

  describe('Chrome bookmark format', () => {
    beforeEach(() => {
      bookmarksService.findBookmarksByUrl.mockReturnValue([])
      bookmarksService.createBookmark.mockImplementation((data) => ({
        id: `bookmark:${Date.now()}`,
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
    })

    it('imports Chrome exported bookmarks', () => {
      // Real Chrome export format
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
    <DT><H3 ADD_DATE="1609459200" LAST_MODIFIED="1609459200" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks bar</H3>
    <DL><p>
        <DT><A HREF="https://github.com" ADD_DATE="1609459200" ICON="data:image/png;base64,">GitHub</A>
    </DL><p>
    <DT><H3 ADD_DATE="1609459200" LAST_MODIFIED="1609459200">Other bookmarks</H3>
    <DL><p>
        <DT><H3 ADD_DATE="1609459200" LAST_MODIFIED="1609459200">Dev Resources</H3>
        <DL><p>
            <DT><A HREF="https://stackoverflow.com" ADD_DATE="1609459200">Stack Overflow</A>
        </DL><p>
    </DL><p>
</DL><p>`

      const result = importFromNetscapeHtml(html)

      expect(result.imported).toBe(2)
      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'GitHub' })
      )
      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Stack Overflow',
          tags: expect.arrayContaining(['dev resources']),
        })
      )
    })
  })

  describe('Firefox bookmark format', () => {
    beforeEach(() => {
      bookmarksService.findBookmarksByUrl.mockReturnValue([])
      bookmarksService.createBookmark.mockImplementation((data) => ({
        id: `bookmark:${Date.now()}`,
        ...data,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      }))
    })

    it('imports Firefox exported bookmarks', () => {
      // Real Firefox export format
      const html = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks Menu</H1>

<DL><p>
    <DT><H3 ADD_DATE="1609459200" LAST_MODIFIED="1609459200" PERSONAL_TOOLBAR_FOLDER="true">Bookmarks Toolbar</H3>
    <DL><p>
        <DT><A HREF="https://mozilla.org" ADD_DATE="1609459200" LAST_MODIFIED="1609459200" TAGS="browser,open-source">Mozilla</A>
        <DD>The Mozilla Foundation
    </DL><p>
</DL><p>`

      const result = importFromNetscapeHtml(html)

      expect(result.imported).toBe(1)
      expect(bookmarksService.createBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Mozilla',
          description: 'The Mozilla Foundation',
          tags: expect.arrayContaining(['browser', 'open-source']),
        })
      )
    })
  })
})
