import { useState, useEffect, useCallback } from 'react'

const KNOWN_ROUTES = new Set(['read-later', 'settings'])

export function parseHash(hash) {
  const path = hash.replace(/^#\/?/, '').trim()

  if (!path) {
    return { view: 'bookmarks', filter: 'all', tag: null }
  }

  if (path === 'settings') {
    return { view: 'settings', filter: 'all', tag: null }
  }

  if (path.startsWith('tag/')) {
    const tag = decodeURIComponent(path.slice(4))
    return { view: 'bookmarks', filter: 'tag', tag }
  }

  if (KNOWN_ROUTES.has(path)) {
    return { view: 'bookmarks', filter: path, tag: null }
  }

  return { view: 'bookmarks', filter: 'all', tag: null }
}

export function toHash(view, filter, tag) {
  if (view === 'settings') return '#/settings'
  if (filter === 'read-later') return '#/read-later'
  if (filter === 'tag' && tag != null) return `#/tag/${encodeURIComponent(tag)}`
  return '#/'
}

export function useHashRouter() {
  const [route, setRoute] = useState(() => parseHash(window.location.hash))

  useEffect(() => {
    const onHashChange = () => {
      setRoute(parseHash(window.location.hash))
    }
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  const navigate = useCallback((hash) => {
    if (window.location.hash !== hash) {
      window.location.hash = hash
    }
  }, [])

  return { view: route.view, filter: route.filter, tag: route.tag, navigate }
}
