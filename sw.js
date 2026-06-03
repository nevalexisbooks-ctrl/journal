// ─── Service Worker — Journal PWA ────────────────────────────────────────────
// Strategia: Cache First per asset statici, Network First per tutto il resto.
// Al primo avvio mette in cache le risorse principali dell'app shell.

const CACHE_NAME = 'journal-v1'

const APP_SHELL = [
  '/journal/',
  '/journal/index.html',
]

// ── Install: pre-cache app shell ──────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  )
  self.skipWaiting()
})

// ── Activate: rimuovi cache vecchie ──────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  )
  self.clients.claim()
})

// ── Fetch: Network First con fallback su cache ────────────────────────────────
self.addEventListener('fetch', (event) => {
  // Ignora richieste non-GET e richieste a Firebase / API esterne
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (
    url.hostname.includes('firestore') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('anthropic') ||
    url.hostname.includes('fonts.g')
  ) return

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clona e salva in cache solo risposte valide dello stesso origin
        if (response && response.status === 200 && response.type === 'basic') {
          const clone = response.clone()
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone))
        }
        return response
      })
      .catch(() => caches.match(event.request))
  )
})
