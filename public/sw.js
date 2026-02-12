// Service Worker for Hypermark PWA
// Version: 1.0.0

const CACHE_NAME = 'hypermark-v2'
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

self.addEventListener('install', (event) => {
  console.log('[SW] Install event')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Caching static assets')
      return cache.addAll(STATIC_ASSETS)
    })
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    })
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Handle Web Share Target POST requests.
  // When a user shares a URL to Hypermark via the iOS/Android share sheet,
  // the OS sends a POST to /_share-target. We extract the shared data from
  // the form body and redirect to the app with query params so the client
  // can pick it up and create a bookmark.
  if (event.request.method === 'POST' && url.pathname === '/_share-target') {
    event.respondWith(
      (async () => {
        const formData = await event.request.formData()
        const title = formData.get('title') || ''
        const text = formData.get('text') || ''
        const sharedUrl = formData.get('url') || ''
        const params = new URLSearchParams()
        if (sharedUrl) params.set('shared_url', sharedUrl)
        if (title) params.set('shared_title', title)
        if (text) params.set('shared_text', text)
        return Response.redirect(`/?${params.toString()}`, 303)
      })()
    )
    return
  }

  // Only intercept same-origin GET requests. In iOS PWA standalone mode,
  // calling event.respondWith() on WebSocket upgrade requests or cross-origin
  // requests can silently break connections (e.g. signaling server WebSocket).
  if (event.request.method !== 'GET') return
  if (!event.request.url.startsWith(self.location.origin)) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, clone)
        })
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
