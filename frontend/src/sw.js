/**
 * Service Worker do advDocs (Palhares Ferreira Advocacia)
 *
 * REGRA CRÍTICA DE SEGURANÇA (Sistema Jurídico Autenticado):
 * 1. NUNCA armazena em cache requisições de API (/api/*, /auth*, /clientes*, /users*, /rbac*, /notificacoes*),
 *    downloads/uploads de documentos jurídicos, certificados (.pfx/.p12) ou requisições com header Authorization.
 * 2. NUNCA intercepta métodos mutáveis (POST, PUT, PATCH, DELETE).
 * 3. Aplica estratégia Network-Only estrita para dados dinâmicos/autenticados,
 *    Network-First para documentos HTML de navegação e Stale-While-Revalidate apenas para
 *    assets estáticos públicos (CSS, JS de UI, SVG, PNG, fontes).
 */

const CACHE_VERSION = 'v1.1.0';
const STATIC_CACHE_NAME = `advdocs-static-${CACHE_VERSION}`;

// Shell estático essencial pré-carregado na instalação
const PRECACHE_ASSETS = [
    '/manifest.json',
    '/css/public.css',
    '/assets/logo.svg',
    '/icons/apple-touch-icon.png',
    '/icons/icon-192.png',
    '/icons/icon-192x192.png',
    '/icons/icon-512.png',
    '/icons/icon-512x512.png',
    '/utils/themeManager.js',
    '/utils/pwaManager.js',
    '/utils/pushManager.js'
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

// Extensões de assets estáticos elegíveis para Stale-While-Revalidate
const STATIC_EXTENSIONS = /\.(?:css|js|svg|png|jpg|jpeg|webp|ico|woff2?|ttf)$/i;

/**
 * Verifica se a URL pertence a uma rota de API, autenticação ou dado sensível.
 * @param {URL} url
 * @param {Request} request
 * @returns {boolean}
 */
function isSensitiveOrDynamicRequest(url, request) {
    // 1. Apenas requisições GET podem ser avaliadas para cache estático
    if (request.method !== 'GET') {
        return true;
    }

    // 2. Qualquer requisição que carregue credenciais explícitas (JWT Authorization) é Network-Only
    if (request.headers.has('Authorization')) {
        return true;
    }

    // 3. Apenas recursos da mesma origem (ou fontes estáticas seguras)
    if (url.origin !== self.location.origin) {
        return true;
    }

    // 4. O próprio Service Worker nunca deve ser cacheado
    if (url.pathname === '/sw.js') {
        return true;
    }

    // 5. Qualquer rota de backend / API / autenticação / documentos
    for (let i = 0; i < NETWORK_ONLY_PREFIXES.length; i++) {
        const prefix = NETWORK_ONLY_PREFIXES[i];
        // Exceção: /pages/auth/* são arquivos estáticos da tela de login, enquanto /auth é o endpoint POST/GET da API
        if (url.pathname === prefix || (url.pathname.startsWith(prefix + '/') && !url.pathname.startsWith('/pages/'))) {
            return true;
        }
    }

    return false;
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_ASSETS))
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

    // Regra crítica: Network-Only para APIs, autenticação, métodos mutáveis e requests autenticadas
    if (isSensitiveOrDynamicRequest(url, request)) {
        return;
    }

    // Estratégia 1: Navegação HTML (Network-First para garantir código e CSP sempre atualizados)
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.ok && networkResponse.type === 'basic') {
                        const copy = networkResponse.clone();
                        caches.open(STATIC_CACHE_NAME).then((cache) => cache.put(request, copy)).catch(() => {});
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cached = await caches.match(request);
                    if (cached) return cached;
                    throw new Error('Sem conexão de rede.');
                })
        );
        return;
    }

    // Estratégia 2: Assets estáticos de interface (Stale-While-Revalidate)
    if (STATIC_EXTENSIONS.test(url.pathname) || url.pathname === '/manifest.json') {
        event.respondWith(
            caches.open(STATIC_CACHE_NAME).then(async (cache) => {
                const cachedResponse = await cache.match(request);
                const networkPromise = fetch(request)
                    .then((networkResponse) => {
                        if (
                            networkResponse &&
                            networkResponse.status === 200 &&
                            networkResponse.type === 'basic' &&
                            !networkResponse.headers.get('Cache-Control')?.includes('no-store')
                        ) {
                            cache.put(request, networkResponse.clone()).catch(() => {});
                        }
                        return networkResponse;
                    })
                    .catch(() => cachedResponse);

                return cachedResponse || networkPromise;
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
