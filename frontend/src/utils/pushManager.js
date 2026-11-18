/**
 * Gerenciador de Notificações Web Push (RFC 8030 / VAPID) para advDocs
 * Compatibilidade iOS 16.4+ Safari Standalone & Desktop/Android:
 * 1. Nunca lê `Notification` ou `PushManager` quando estiver no iOS fora do modo standalone.
 * 2. Nunca invoca `Notification.requestPermission()` automaticamente em `onload` — apenas em clique explícito.
 */

import { apiFetch } from './utils.js';
import { isIosSafari, isRunningStandalone } from './pwaManager.js';

/**
 * Converte chave VAPID pública em Base64 URL-safe para Uint8Array (formato exigido pelo PushManager).
 * @param {string} base64String
 * @returns {Uint8Array}
 */
export const urlBase64ToUint8Array = (base64String) => {
    const clean = String(base64String || '').trim();
    const padding = '='.repeat((4 - (clean.length % 4)) % 4);
    const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');

    let rawData;
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
        rawData = window.atob(base64);
    } else if (typeof Buffer !== 'undefined') {
        rawData = Buffer.from(base64, 'base64').toString('binary');
    } else {
        throw new Error('Decodificador Base64 indisponível neste ambiente.');
    }

    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; i++) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
};

/**
 * Verifica com segurança se a Web Push API está disponível na janela atual.
 * No iOS Safari comum (fora da Tela de Início), retorna false sem disparar erros.
 */
export const supportsWebPushInCurrentContext = () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return false;
    }

    if (isIosSafari() && !isRunningStandalone()) {
        return false;
    }

    return (
        'serviceWorker' in navigator &&
        'PushManager' in window &&
        'Notification' in window &&
        typeof window.Notification !== 'undefined'
    );
};

const emitPushStateChange = (state) => {
    if (typeof window !== 'undefined' && typeof CustomEvent === 'function') {
        window.dispatchEvent(new CustomEvent('advdocs:push-state-change', {
            detail: state
        }));
    }
};

const obterRegistrationAtivo = async () => {
    if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker não suportado neste navegador.');
    }

    const existing = await navigator.serviceWorker.getRegistration('/');
    if (!existing) {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }
    return navigator.serviceWorker.ready;
};

/**
 * Retorna o estado atual das notificações Push neste aparelho:
 * - 'ios-requires-install': iPhone/iPad fora do modo Tela de Início
 * - 'unsupported': navegador sem suporte ou contexto inseguro (HTTP não-localhost)
 * - 'denied': usuário bloqueou notificações nas configurações do navegador/SO
 * - 'subscribed': dispositivo possui PushSubscription ativa
 * - 'prompt': pronto para solicitar permissão mediante clique do usuário
 *
 * @returns {Promise<{ state: string, endpoint: string | null }>}
 */
export const getPushPermissionState = async () => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return { state: 'unsupported', endpoint: null };
    }

    if (isIosSafari() && !isRunningStandalone()) {
        return { state: 'ios-requires-install', endpoint: null };
    }

    if (!supportsWebPushInCurrentContext()) {
        return { state: 'unsupported', endpoint: null };
    }

    const permission = window.Notification.permission;
    if (permission === 'denied') {
        return { state: 'denied', endpoint: null };
    }

    try {
        const reg = await navigator.serviceWorker.getRegistration('/');
        const subscription = reg?.pushManager ? await reg.pushManager.getSubscription() : null;
        if (subscription) {
            return { state: 'subscribed', endpoint: subscription.endpoint || null };
        }
    } catch (_) {
        // Ignora erro transitório de registro ainda inicializando
    }

    return { state: 'prompt', endpoint: null };
};

/**
 * Solicita permissão ao usuário e inscreve o dispositivo na Web Push API.
 * IMPORTANTE: DEVE ser chamada exclusivamente dentro de um handler de clique do usuário (iOS requirement).
 */
export const subscribeUserToPush = async () => {
    if (isIosSafari() && !isRunningStandalone()) {
        const res = {
            ok: false,
            state: 'ios-requires-install',
            mensagem: 'No iPhone, adicione o advDocs à Tela de Início pelo Safari antes de ativar as notificações.'
        };
        emitPushStateChange(res);
        return res;
    }

    if (!supportsWebPushInCurrentContext()) {
        const res = {
            ok: false,
            state: 'unsupported',
            mensagem: 'Seu navegador atual não suporta notificações Push (ou a página não está em HTTPS).'
        };
        emitPushStateChange(res);
        return res;
    }

    // 1. Solicita permissão dentro do gesto de clique do usuário
    const permission = await window.Notification.requestPermission();
    if (permission !== 'granted') {
        const state = permission === 'denied' ? 'denied' : 'prompt';
        const res = {
            ok: false,
            state,
            mensagem: state === 'denied'
                ? 'As notificações estão bloqueadas nas preferências do navegador/iPhone.'
                : 'Permissão de notificação não concedida.'
        };
        emitPushStateChange(res);
        return res;
    }

    // 2. Obtém chave pública VAPID no backend autenticado
    const { publicKey } = await apiFetch('/api/push/vapid-public-key');
    if (!publicKey) {
        throw new Error('Chave pública VAPID não retornada pelo servidor.');
    }

    // 3. Registra ou recupera inscrição no PushManager
    const registration = await obterRegistrationAtivo();
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey)
        });
    }

    const subJson = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
    if (!subJson?.endpoint || !subJson?.keys?.p256dh || !subJson?.keys?.auth) {
        throw new Error('Assinatura Push retornada pelo navegador está incompleta.');
    }

    // 4. Persiste (UPSERT) no MySQL vinculada ao usuário logado
    await apiFetch('/api/push/subscribe', {
        method: 'POST',
        body: JSON.stringify({
            endpoint: subJson.endpoint,
            keys: {
                p256dh: subJson.keys.p256dh,
                auth: subJson.keys.auth
            }
        })
    });

    const result = {
        ok: true,
        state: 'subscribed',
        endpoint: subJson.endpoint,
        mensagem: 'Notificações Push ativadas neste dispositivo!'
    };
    emitPushStateChange(result);
    return result;
};

/**
 * Cancela a assinatura Push deste dispositivo no backend e no navegador.
 */
export const unsubscribeUserFromPush = async () => {
    if (!supportsWebPushInCurrentContext()) {
        return { ok: false, state: 'unsupported' };
    }

    const reg = await navigator.serviceWorker.getRegistration('/');
    const subscription = reg?.pushManager ? await reg.pushManager.getSubscription() : null;

    if (subscription) {
        const endpoint = subscription.endpoint;
        try {
            await apiFetch('/api/push/unsubscribe', {
                method: 'DELETE',
                body: JSON.stringify({ endpoint })
            });
        } catch (err) {
            console.warn('[PushManager] Falha ao remover endpoint no backend:', err?.message);
        }

        try {
            await subscription.unsubscribe();
        } catch (_) {}
    }

    const res = {
        ok: true,
        state: 'prompt',
        endpoint: null,
        mensagem: 'Notificações Push desativadas neste dispositivo.'
    };
    emitPushStateChange(res);
    return res;
};

/**
 * Dispara uma notificação de teste imediata pelo backend para os aparelhos inscritos.
 */
export const sendTestPushNotification = async () => {
    return apiFetch('/api/push/test', { method: 'POST' });
};
