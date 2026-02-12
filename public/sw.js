// AI DOGE Service Worker — offline caching for council transparency data
const CACHE_NAME = 'aidoge-v2'
const STATIC_ASSETS = [
  './',
  './index.html',
]

// Network-first for HTML (prevents stale index.html referencing dead JS chunks after deploy)
// Stale-while-revalidate for hashed assets (JS/CSS — hash in filename guarantees freshness)
// Network-first for data files (JSON — always try fresh data first)
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  )
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url)

  // Skip non-GET requests and cross-origin
  if (event.request.method !== 'GET') return
  if (url.origin !== self.location.origin) return

  // Data files: network-first (always try fresh data)
  if (url.pathname.includes('/data/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // HTML pages (index.html, navigation requests): network-first
  // This prevents stale HTML from referencing JS chunks that no longer exist after deploy
  if (event.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
          return response
        })
        .catch(() => caches.match(event.request))
    )
    return
  }

  // Hashed static assets (JS, CSS): cache-first (hash in filename = immutable)
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached
      return fetch(event.request).then((response) => {
        const clone = response.clone()
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        return response
      })
    })
  )
})
