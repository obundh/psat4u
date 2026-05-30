const CACHE_NAME = 'psat4u-pwa-v20260530-1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/favicon.png',
  '/apple-touch-icon.png',
  '/icon-192.png',
  '/icon-512.png',
];

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function toCacheableUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    return isSameOrigin(url) ? url.pathname + url.search : null;
  } catch {
    return null;
  }
}

function extractBuildAssetUrls(html) {
  const urls = new Set(APP_SHELL);
  const attrPattern = /\b(?:href|src)="([^"]+)"/g;
  let match;

  while ((match = attrPattern.exec(html)) !== null) {
    const path = toCacheableUrl(match[1]);
    if (path && (path.startsWith('/assets/') || path.endsWith('.webmanifest') || path.endsWith('.png'))) {
      urls.add(path);
    }
  }

  return [...urls];
}

async function cacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  const indexResponse = await fetch(new Request('/index.html', { cache: 'reload' }));
  const html = await indexResponse.clone().text();

  await cache.put('/index.html', indexResponse.clone());
  await cache.put('/', indexResponse);

  const urls = extractBuildAssetUrls(html);
  await Promise.all(urls.map(async (url) => {
    try {
      const response = await fetch(new Request(url, { cache: 'reload' }));
      if (response.ok) {
        await cache.put(url, response);
      }
    } catch {
      // A missing optional icon should not prevent the offline app shell from installing.
    }
  }));
}

async function deleteOldCaches() {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith('psat4u-pwa-') && key !== CACHE_NAME)
    .map((key) => caches.delete(key)));
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response.ok) {
      await cache.put('/index.html', response.clone());
    }
    return response;
  } catch {
    return (await cache.match('/index.html')) || (await cache.match('/'));
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) {
    return cached;
  }

  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheAppShell().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);
  if (!isSameOrigin(url) || url.pathname === '/sw.js') {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirst(request));
});
