/**
 * Gerenciador de PWA e Experiência Mobile Nativa (iOS Safari / Android)
 * - Registra o Service Worker (/sw.js) na raiz com atualização automática
 * - Sincroniza <meta name="theme-color"> com o tema claro/escuro ativo
 * - Exibe um banner discreto e inteligente de instalação exclusivamente no iOS (Safari)
 *   quando executado fora do modo standalone (!window.navigator.standalone)
 */

export const IOS_BANNER_DISMISSED_KEY = 'advdocs-ios-pwa-dismissed-v1';

let pwaInitialized = false;

/**
 * Detecta se o dispositivo atual é iOS / iPadOS rodando Safari (WebKit)
 * e NÃO é um navegador de terceiros sem suporte completo ou desktop.
 * @returns {boolean}
 */
export const isIosSafari = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }

    const ua = navigator.userAgent || '';
    const isIOSDevice = /iPad|iPhone|iPod/.test(ua) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

    if (!isIOSDevice) return false;

    // Garante que é WebKit/Safari e exclui wrappers internos ou navegadores não-Safari no iOS
    const isWebKit = /WebKit/i.test(ua);
    const isOtherBrowser = /CriOS|FxiOS|OPiOS|EdgiOS|mercury/i.test(ua);

    return isWebKit && !isOtherBrowser;
};

/**
 * Verifica se o aplicativo já está rodando instalado em modo standalone (Tela de Início).
 * @returns {boolean}
 */
export const isRunningStandalone = () => {
    if (typeof window === 'undefined') return false;
    const iosStandalone = Boolean(window.navigator && window.navigator.standalone === true);
    const displayModeStandalone = Boolean(
        window.matchMedia && window.matchMedia('(display-mode: standalone)').matches
    );
    return iosStandalone || displayModeStandalone;
};

/**
 * Atualiza dinamicamente a meta tag theme-color para refletir o tema ativo na barra de status.
 * @param {'light' | 'dark'} [resolvedTheme]
 */
export const syncThemeColorMeta = (resolvedTheme) => {
    if (typeof document === 'undefined') return;
    const current = resolvedTheme || document.documentElement?.getAttribute('data-theme') || 'dark';
    const color = current === 'light' ? '#f8fafc' : '#0f172a';

    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute('name', 'theme-color');
        document.head?.appendChild(meta);
    }
    meta.setAttribute('content', color);
};

/**
 * Registra o Service Worker (/sw.js) de forma segura.
 */
export const registerServiceWorker = () => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
        return;
    }

    const register = () => {
        navigator.serviceWorker
            .register('/sw.js', { scope: '/' })
            .then((registration) => {
                if (registration.waiting) {
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
                }
            })
            .catch(() => {
                // Silencioso em ambientes de desenvolvimento sem HTTPS
            });
    };

    if (document.readyState === 'complete') {
        register();
    } else {
        window.addEventListener('load', register, { once: true });
    }
};

/**
 * Renderiza o banner inteligente de instalação para iPhone/iPad (Safari fora do modo standalone).
 */
export const initIosInstallBanner = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    // Exibe exclusivamente no iOS (Safari) e fora do modo standalone
    if (!isIosSafari() || isRunningStandalone()) {
        return;
    }

    try {
        if (localStorage.getItem(IOS_BANNER_DISMISSED_KEY) === 'true') {
            return;
        }
    } catch (_) {
        // Prossegue caso o storage esteja bloqueado
    }

    const mountBanner = () => {
        if (document.getElementById('iosPwaInstallBanner')) return;

        const banner = document.createElement('aside');
        banner.id = 'iosPwaInstallBanner';
        banner.className = 'ios-pwa-banner';
        banner.setAttribute('role', 'region');
        banner.setAttribute('aria-label', 'Instalar aplicativo advDocs no iPhone');

        // Ícone nativo de compartilhamento do iOS (quadrado com seta para cima) em SVG inline
        banner.innerHTML = `
            <div class="ios-pwa-banner-inner">
                <img src="/icons/apple-touch-icon.png" alt="advDocs" class="ios-pwa-banner-icon" width="44" height="44">
                <div class="ios-pwa-banner-content">
                    <div class="ios-pwa-banner-title">Instalar <strong>advDocs</strong> no iPhone</div>
                    <div class="ios-pwa-banner-text">
                        Toque em <strong>Compartilhar</strong>
                        <span class="ios-share-badge" aria-hidden="true">
                            <svg width="14" height="16" viewBox="0 0 16 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M8 1V11.5M8 1L4.5 4.5M8 1L11.5 4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                                <path d="M3 7.5H2.5C1.67157 7.5 1 8.17157 1 9V15.5C1 16.3284 1.67157 17 2.5 17H13.5C14.3284 17 15 16.3284 15 15.5V9C15 8.17157 14.3284 7.5 13.5 7.5H13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>
                            </svg>
                        </span>
                        e selecione <strong>"Adicionar à Tela de Início"</strong>.
                    </div>
                </div>
                <button type="button" class="ios-pwa-banner-close" id="iosPwaBannerClose" aria-label="Dispensar aviso de instalação">
                    &times;
                </button>
            </div>
        `;

        document.body.appendChild(banner);

        requestAnimationFrame(() => {
            banner.classList.add('is-visible');
        });

        const closeBtn = banner.querySelector('#iosPwaBannerClose');
        closeBtn?.addEventListener('click', () => {
            banner.classList.remove('is-visible');
            try {
                localStorage.setItem(IOS_BANNER_DISMISSED_KEY, 'true');
            } catch (_) {}
            setTimeout(() => {
                banner.remove();
            }, 260);
        });
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', mountBanner, { once: true });
    } else {
        mountBanner();
    }
};

/**
 * Realiza prefetch leve das rotas HTML internas ao tocar/passar o cursor e em idle,
 * acelerando a transição entre telas no PWA standalone do iOS e desktop.
 */
const prefetchedUrls = new Set();

const prefetchRouteDocument = (rawHref) => {
    if (typeof window === 'undefined' || typeof document === 'undefined' || !rawHref) return;
    let url;
    try {
        url = new URL(rawHref, window.location.href);
    } catch (_) {
        return;
    }

    if (url.origin !== window.location.origin) return;
    if (!url.pathname.startsWith('/pages/') && url.pathname !== '/') return;

    const cleanTarget = `${url.origin}${url.pathname}`;
    if (prefetchedUrls.has(cleanTarget) || url.pathname === window.location.pathname) return;
    prefetchedUrls.add(cleanTarget);

    if (document.head) {
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.as = 'document';
        link.href = cleanTarget;
        document.head.appendChild(link);
    }

    // No WebKit/iOS Safari, `<link rel="prefetch">` tem suporte limitado; um fetch de baixa prioridade aquece o cache do navegador/SW
    if (typeof fetch === 'function') {
        fetch(cleanTarget, {
            method: 'GET',
            credentials: 'same-origin',
            priority: 'low',
            headers: { Accept: 'text/html' }
        }).catch(() => {});
    }
};

export const initNavigationPrefetch = () => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const handleIntent = (event) => {
        const anchor = event.target?.closest?.('a[href]');
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return;
        prefetchRouteDocument(href);
    };

    document.addEventListener('touchstart', handleIntent, { passive: true });
    document.addEventListener('pointerenter', handleIntent, { passive: true, capture: true });

    // Em segundo plano após o carregamento inicial, aquece as rotas principais se autenticado
    const warmUpMainRoutes = () => {
        try {
            if (!localStorage.getItem('token')) return;
        } catch (_) {
            return;
        }

        const routes = ['/pages/main/', '/pages/consult/', '/pages/register/', '/pages/config/'];
        for (const r of routes) {
            prefetchRouteDocument(r);
        }
    };

    if (typeof window.requestIdleCallback === 'function') {
        window.requestIdleCallback(warmUpMainRoutes, { timeout: 2500 });
    } else {
        setTimeout(warmUpMainRoutes, 1500);
    }
};

/**
 * Inicializa todos os recursos de PWA (Service Worker, Meta Theme-Color, Prefetch e Banner iOS).
 */
export const initPwaManager = () => {
    if (typeof window === 'undefined') return;

    syncThemeColorMeta();

    if (pwaInitialized) return;
    pwaInitialized = true;

    window.addEventListener('advdocs:theme-change', (event) => {
        syncThemeColorMeta(event?.detail?.resolved);
    });

    registerServiceWorker();
    initIosInstallBanner();
    initNavigationPrefetch();
};
