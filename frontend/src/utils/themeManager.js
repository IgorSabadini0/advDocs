/**
 * Gerenciador Global de Temas do advDocs
 * Suporta: 'light' (Modo Claro), 'dark' (Modo Escuro) e 'system' (Conforme o Sistema)
 */

import { initPwaManager } from './pwaManager.js';

export const THEME_STORAGE_KEY = 'advdocs-theme';
const VALID_PREFERENCES = ['light', 'dark', 'system'];

let initialized = false;
let mediaQueryList = null;

/**
 * Lê a preferência salva no localStorage. Assume 'system' como padrão.
 * @returns {'light' | 'dark' | 'system'}
 */
export const getSavedTheme = () => {
    try {
        const saved = localStorage.getItem(THEME_STORAGE_KEY);
        if (saved && VALID_PREFERENCES.includes(saved)) {
            return saved;
        }
    } catch (_) {
        // Fallback em ambientes com armazenamento restrito
    }
    return 'system';
};

/**
 * Detecta a preferência atual do sistema operacional via matchMedia.
 * @returns {'light' | 'dark'}
 */
export const getSystemTheme = () => {
    if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
};

/**
 * Resolve uma preferência ('light' | 'dark' | 'system') para o tema efetivo ('light' | 'dark').
 * @param {'light' | 'dark' | 'system'} [preference]
 * @returns {'light' | 'dark'}
 */
export const resolveTheme = (preference = getSavedTheme()) => {
    if (preference === 'dark') return 'dark';
    if (preference === 'light') return 'light';
    return getSystemTheme();
};

/**
 * Aplica o tema ao elemento raiz <html> e opcionalmente persiste no localStorage.
 * @param {'light' | 'dark' | 'system'} [preference]
 * @param {{ persist?: boolean }} [options]
 * @returns {{ preference: 'light' | 'dark' | 'system', resolved: 'light' | 'dark' }}
 */
export const applyTheme = (preference = getSavedTheme(), { persist = true } = {}) => {
    const normalized = VALID_PREFERENCES.includes(preference) ? preference : 'system';

    if (persist) {
        try {
            localStorage.setItem(THEME_STORAGE_KEY, normalized);
        } catch (_) {
            // Ignora falha de escrita em modo privado restrito
        }
    }

    const resolved = resolveTheme(normalized);
    const root = document.documentElement;
    if (root) {
        root.setAttribute('data-theme', resolved);
        root.setAttribute('data-theme-preference', normalized);
    }

    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('advdocs:theme-change', {
            detail: { preference: normalized, resolved }
        }));
    }

    return { preference: normalized, resolved };
};

/**
 * Inicializa o gerenciador de temas: aplica o tema inicial, observa mudanças do SO
 * (quando em modo 'system'), sincroniza múltiplas abas e ativa transições após o boot.
 */
export const initThemeManager = () => {
    const state = applyTheme(getSavedTheme(), { persist: false });

    if (!initialized && typeof window !== 'undefined') {
        initialized = true;

        if (window.matchMedia) {
            mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
            const onSystemChange = () => {
                if (getSavedTheme() === 'system') {
                    applyTheme('system', { persist: false });
                }
            };

            if (typeof mediaQueryList.addEventListener === 'function') {
                mediaQueryList.addEventListener('change', onSystemChange);
            } else if (typeof mediaQueryList.addListener === 'function') {
                mediaQueryList.addListener(onSystemChange);
            }
        }

        window.addEventListener('storage', (event) => {
            if (event.key === THEME_STORAGE_KEY) {
                applyTheme(getSavedTheme(), { persist: false });
            }
        });

        const enableTransitions = () => {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    document.documentElement?.classList.add('theme-transitions-ready');
                });
            });
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', enableTransitions, { once: true });
        } else {
            enableTransitions();
        }
    }

    initPwaManager();

    return state;
};
