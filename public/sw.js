// AI DOGE Service Worker — offline caching for council transparency data
const CACHE_NAME = 'aidoge-v1'
const STATIC_ASSETS = [
  './',
  './index.html',
]

// Cache-first for static assets (JS, CSS, fonts)
// Network-first for data files (JSON) — always try fresh data first
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

  // Static assets: cache-first
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
