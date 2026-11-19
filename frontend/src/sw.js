/**
 * Service Worker do advDocs (Palhares Ferreira Advocacia)
 *
 * REGRAS DE SEGURANÇA E PERFORMANCE (PWA + iOS Safari/WebKit):
 * 1. NUNCA armazena em cache requisições de API (/api/*, /auth*, /clientes*, /users*, /rbac*, /notificacoes*),
 *    downloads/uploads de documentos jurídicos, certificados (.pfx/.p12) ou requisições com header Authorization.
 * 2. NUNCA intercepta métodos mutáveis (POST, PUT, PATCH, DELETE).
 * 3. Network-Only estrita para dados dinâmicos/autenticados.
 * 4. Network-First com timeout de 3s para documentos HTML de navegação (abertura rápida mesmo com rede lenta).
 * 5. Cache-First instantânea para assets estáticos locais (.css, .js, .svg, .png, .woff2) e fontes/kits externos.
 */

const CACHE_VERSION = 'v1.3.1';
const STATIC_CACHE_NAME = `advdocs-static-${CACHE_VERSION}`;

// Precache completo das telas HTML, estilos e scripts essenciais na instalação
const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/gateway.js',
    '/manifest.json',
    '/css/public.css',
    '/assets/logo.svg',
    '/icons/apple-touch-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512.png',
    '/icons/icon-512x512.png',
    '/utils/utils.js',
    '/utils/cnjParser.js',
    '/utils/themeManager.js',
    '/utils/pwaManager.js',
    '/utils/pushManager.js',
    '/utils/notificationsWidget.js',
    '/utils/tiposService.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css',
    '/pages/auth/',
    '/pages/auth/index.html',
    '/pages/auth/css/style.css',
    '/pages/auth/js/script.js',
    '/pages/main/',
    '/pages/main/index.html',
    '/pages/main/css/pastas.css',
    '/pages/main/js/pastas.js',
    '/pages/main/components/cardComponent.js',
    '/pages/main/components/modalComponent.js',
    '/pages/consult/',
    '/pages/consult/index.html',
    '/pages/consult/css/consult.css',
    '/pages/consult/js/consult.js',
    '/pages/register/',
    '/pages/register/index.html',
    '/pages/register/css/register.css',
    '/pages/register/js/register.js',
    '/pages/edit/',
    '/pages/edit/index.html',
    '/pages/edit/css/edit.css',
    '/pages/edit/js/edit.js',
    '/pages/config/',
    '/pages/config/index.html',
    '/pages/config/css/config.css',
    '/pages/config/js/config.js'
];

// Prefixos de rotas dinâmicas/API que NUNCA devem passar pelo Cache Storage
const NETWORK_ONLY_PREFIXES = [
    '/api/',
    '/auth',
    '/clientes',
    '/users',
    '/rbac',
    '/notificacoes'
];

// Origens externas estáticas permitidas no Cache-First (Google Fonts & FontAwesome CDN)
const CACHEABLE_EXTERNAL_ORIGINS = new Set([
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdnjs.cloudflare.com',
    'https://kit.fontawesome.com',
    'https://ka-f.fontawesome.com'
]);

// Extensões de assets estáticos elegíveis para Cache-First
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i;

/**
 * Verifica se a URL pertence a uma rota de API, autenticação ou dado sensível.
 * @param {URL} url
 * @param {Request} request
 * @returns {boolean}
 */
function isSensitiveOrDynamicRequest(url, request) {
    // 1. Apenas requisições GET podem ser avaliadas para cache
    if (request.method !== 'GET') {
        return true;
    }

    // 2. Qualquer requisição que carregue credenciais explícitas (JWT Authorization) é Network-Only
    if (request.headers.has('Authorization')) {
        return true;
    }

    // 3. Apenas mesma origem ou CDNs de fontes/ícones explicitamente confiáveis
    const isSameOrigin = url.origin === self.location.origin;
    if (!isSameOrigin && !CACHEABLE_EXTERNAL_ORIGINS.has(url.origin)) {
        return true;
    }

    // 4. O próprio Service Worker nunca deve ser cacheado
    if (isSameOrigin && url.pathname === '/sw.js') {
        return true;
    }

    // 5. Qualquer rota de backend / API / autenticação / documentos
    if (isSameOrigin) {
        for (let i = 0; i < NETWORK_ONLY_PREFIXES.length; i++) {
            const prefix = NETWORK_ONLY_PREFIXES[i];
            if (url.pathname === prefix || (url.pathname.startsWith(prefix + '/') && !url.pathname.startsWith('/pages/'))) {
                return true;
            }
        }
    }

    return false;
}

/**
 * Busca documento HTML na rede com timeout curto (3.5s) via Promise.race,
 * evitando passar `{ signal }` para `fetch(request)` com `mode: 'navigate'` (que lança TypeError no Chromium/WebKit).
 */
function fetchWithTimeout(request, timeoutMs = 3500) {
    let timerId;
    const timeoutPromise = new Promise((_, reject) => {
        timerId = setTimeout(() => reject(new Error('Network timeout')), timeoutMs);
    });

    return Promise.race([
        fetch(request),
        timeoutPromise
    ]).finally(() => clearTimeout(timerId));
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => Promise.allSettled(
                PRECACHE_ASSETS.map((assetUrl) => cache.add(assetUrl))
            ))
            .then(() => self.skipWaiting())
            .catch(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => Promise.all(
                cacheNames
                    .filter((name) => name.startsWith('advdocs-') && name !== STATIC_CACHE_NAME)
                    .map((oldName) => caches.delete(oldName))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const { request } = event;
    let url;

    try {
        url = new URL(request.url);
    } catch (_) {
        return;
    }

    // Regra crítica: Network-Only estrita para APIs, autenticação, métodos mutáveis e requests autenticadas
    if (isSensitiveOrDynamicRequest(url, request)) {
        return;
    }

    const isSameOrigin = url.origin === self.location.origin;

    // Estratégia 1: Navegação HTML (Network-First com timeout curto + fallback para cache)
    if (isSameOrigin && (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html'))) {
        event.respondWith(
            fetchWithTimeout(request, 3500)
                .then((networkResponse) => {
                    if (
                        networkResponse &&
                        networkResponse.ok &&
                        !networkResponse.redirected &&
                        networkResponse.type === 'basic'
                    ) {
                        const copy = networkResponse.clone();
                        caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(url.pathname, copy)).catch(() => {});
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedExact = await caches.match(request, { ignoreSearch: true });
                    if (cachedExact) return cachedExact;
                    const cachedPath = await caches.match(url.pathname);
                    if (cachedPath) return cachedPath;
                    throw new Error('Sem conexão de rede.');
                })
        );
        return;
    }

    // Estratégia 2: Cache-First instantânea para assets estáticos locais e fontes/ícones externos
    const isExternalStatic = CACHEABLE_EXTERNAL_ORIGINS.has(url.origin);
    if (isExternalStatic || STATIC_EXTENSIONS.test(url.pathname) || url.pathname === '/manifest.json') {
        event.respondWith(
            caches.open(STATIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse =
                    (await cache.match(request, { ignoreVary: true })) ||
                    (await cache.match(url.href, { ignoreVary: true }));
                if (cachedResponse) {
                    return cachedResponse;
                }

                try {
                    const networkResponse = await fetch(request);
                    const isCacheableResponse = networkResponse && (
                        (networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) ||
                        networkResponse.type === 'opaque'
                    );

                    if (isCacheableResponse && !networkResponse.headers.get('Cache-Control')?.includes('no-store')) {
                        cache.put(request, networkResponse.clone()).catch(() => {});
                    }

                    return networkResponse;
                } catch (err) {
                    throw err;
                }
            })
        );
    }
});

// Suporte explícito para limpeza de cache no logout ou atualização forçada
self.addEventListener('message', (event) => {
    if (!event.data) return;
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    } else if (event.data.type === 'CLEAR_STATIC_CACHE') {
        caches.keys().then((names) => Promise.all(names.map((n) => caches.delete(n)))).catch(() => {});
    }
});

// ==========================================================================
// Web Push API (RFC 8030 / VAPID) — Compatível com APNs iOS 16.4+ & FCM
// Regra crítica APNs: todo evento `push` DEVE exibir uma notificação visível.
// ==========================================================================
self.addEventListener('push', (event) => {
    let payload = {
        title: 'advDocs — Alerta Jurídico',
        body: 'Você possui uma nova atualização processual no sistema.',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/apple-touch-icon.png',
        tag: 'advdocs-notification',
        url: '/pages/main/'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            if (parsed && typeof parsed === 'object') {
                payload = { ...payload, ...parsed };
            }
        } catch (_) {
            try {
                const text = event.data.text();
                if (text) payload.body = text;
            } catch (_) {}
        }
    }

    const targetUrl = payload.url || (payload.data && payload.data.url) || '/pages/main/';
    const options = {
        body: payload.body || 'Você possui uma nova atualização processual no sistema.',
        icon: payload.icon || '/icons/icon-192x192.png',
        badge: payload.badge || '/icons/apple-touch-icon.png',
        tag: payload.tag || 'advdocs-notification',
        renotify: true,
        data: {
            ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
            url: targetUrl
        }
    };

    event.waitUntil(
        self.registration.showNotification(payload.title || 'advDocs — Alerta Jurídico', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const rawUrl = event.notification.data?.url || '/pages/main/';
    let targetUrl;
    try {
        targetUrl = new URL(rawUrl, self.location.origin).href;
    } catch (_) {
        targetUrl = `${self.location.origin}/pages/main/`;
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (windowClients) => {
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url && client.url.startsWith(self.location.origin)) {
                    if ('navigate' in client) {
                        try {
                            await client.navigate(targetUrl);
                        } catch (_) {}
                    }
                    if ('focus' in client) {
                        return client.focus();
                    }
                }
            }

            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
            return null;
        })
    );
});
