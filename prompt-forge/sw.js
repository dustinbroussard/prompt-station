const CACHE_NAME = 'promptforge-cache-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/offline.html',
  '/style.css',
  '/script.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css'
];

// Cache Font Awesome fonts
const FONT_AWESOME_DOMAINS = [
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/webfonts'
];

// (Removed duplicate constant)


self.addEventListener('install', event => {
    console.log('Service Worker: Installing...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Caching all core assets');
                return cache.addAll(PRECACHE_URLS);
            })
            .catch(err => {
                console.error('Service Worker: Failed to cache assets', err);
            })
    );
});

self.addEventListener('activate', event => {
    console.log('Service Worker: Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Deleting old cache', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim()) // Take control of un-controlled pages
    );
});

self.addEventListener('fetch', event => {
    // Skip cross-origin requests
    if (!event.request.url.startsWith(self.location.origin) && 
        !FONT_AWESOME_DOMAINS.some(domain => event.request.url.startsWith(domain))) {
        return;
    }

    // Network-first strategy for API calls
    // Check if the request is for the OpenRouter API
    const openrouterUrl = 'https://openrouter.ai/api/v1/';
    if (event.request.url.startsWith(openrouterUrl)) {
        // AI API requests: Use a Network-first strategy. Don't cache these.
        event.respondWith(
            fetch(event.request).catch(() => {
                // If network fails, respond with a specific error message or a blank response.
                // We can't fulfill this request offline.
                return new Response(JSON.stringify({ error: 'AI features unavailable offline.' }), {
                    status: 503,
                    statusText: 'Service Unavailable',
                    headers: { 'Content-Type': 'application/json' }
                });
            })
        );
        return;
    }
    
    // For all other requests (our core assets)
    event.respondWith(
        caches.match(event.request).then(response => {
            // Cache hit - return cached response
            if (response) {
                console.log('Serving from cache:', event.request.url);
                return response;
            }

            // Not in cache, fetch from network
            console.log('Fetching from network:', event.request.url);
            return fetch(event.request)
                .then(res => {
                    // Cache the new response if it's valid
                    if (!res || res.status !== 200 || res.type !== 'basic') {
                        return res;
                    }
                    
                    // Clone the response because it's a stream and can only be consumed once
                    const responseToCache = res.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                    
                    return res;
                })
                .catch(err => {
                    // If both cache and network fail, serve the offline page.
                    console.error('Fetch failed for:', event.request.url, err);
                    if (event.request.mode === 'navigate') {
                        return caches.match('/offline.html');
                    }
                    // For other assets, just fail silently.
                    return new Response(null, { status: 404, statusText: 'Not Found' });
                });
        })
    );
});
