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

const esperarSwAtivo = async (registration, timeoutMs = 4000) => {
    if (!registration) return null;

    if (registration.waiting) {
        try {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        } catch (_) {}
    }

    const activeWorker = registration.active;
    if (activeWorker && activeWorker.state === 'activated') {
        return registration;
    }

    const candidato = registration.installing || registration.waiting || registration.active;
    if (!candidato) {
        return registration;
    }

    await new Promise((resolve) => {
        if (candidato.state === 'activated') {
            resolve();
            return;
        }
        let finished = false;
        const done = () => {
            if (finished) return;
            finished = true;
            candidato.removeEventListener('statechange', onStateChange);
            clearTimeout(timer);
            resolve();
        };
        const onStateChange = () => {
            if (candidato.state === 'activated' || candidato.state === 'redundant') {
                done();
            }
        };
        const timer = setTimeout(done, timeoutMs);
        candidato.addEventListener('statechange', onStateChange);
    });

    return registration;
};

const obterRegistrationAtivo = async () => {
    if (!('serviceWorker' in navigator)) {
        throw new Error('Service Worker não suportado neste navegador.');
    }

    let reg = await navigator.serviceWorker.getRegistration('/');
    if (!reg) {
        reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    }

    const readyReg = await navigator.serviceWorker.ready;
    return esperarSwAtivo(readyReg || reg);
};

const keysMatch = (existingKeyBuffer, expectedUint8) => {
    if (!existingKeyBuffer || !(expectedUint8 instanceof Uint8Array)) return false;
    try {
        const current = new Uint8Array(existingKeyBuffer);
        if (current.length !== expectedUint8.length) return false;
        for (let i = 0; i < current.length; i++) {
            if (current[i] !== expectedUint8[i]) return false;
        }
        return true;
    } catch (_) {
        return false;
    }
};

const detectarBrave = async () => {
    try {
        if (navigator.brave && typeof navigator.brave.isBrave === 'function') {
            return await navigator.brave.isBrave();
        }
    } catch (_) {}
    return false;
};

const reportarErroPushAoServidor = (payload) => {
    try {
        apiFetch('/api/push/client-error', {
            method: 'POST',
            timeoutMs: 5000,
            body: JSON.stringify(payload)
        }).catch(() => {});
    } catch (_) {}
};

const traduzirErroPush = (err, { isBrave = false } = {}) => {
    const name = String(err?.name || '');
    const msg = String(err?.message || '');
    const lower = msg.toLowerCase();

    if (name === 'NotAllowedError' || lower.includes('permission') || lower.includes('denied')) {
        return 'Permissão de notificação bloqueada pelo navegador ou modo anônimo. Libere nas configurações do site e tente novamente.';
    }

    if (name === 'AbortError' || lower.includes('push service error') || lower.includes('registration failed')) {
        if (isBrave) {
            return 'No navegador Brave, ative "Usar serviços do Google para mensagens push" em brave://settings/privacy para habilitar notificações.';
        }
        return 'O navegador não conseguiu registrar o dispositivo no serviço de Push (FCM/WNS). Verifique se não está em guia anônima ou se há firewall/VPN bloqueando o serviço de Push do navegador.';
    }

    if (name === 'InvalidStateError') {
        return 'O Service Worker ainda estava atualizando. Aguarde 2 segundos ou recarregue a página (F5) e tente ativar novamente.';
    }

    return msg ? `Falha ao ativar Push (${name || 'Erro'}): ${msg}` : 'Não foi possível concluir a inscrição de notificações.';
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

    // 3. Registra ou recupera inscrição no PushManager com auto-recuperação
    const applicationServerKey = urlBase64ToUint8Array(publicKey);
    let registration = await obterRegistrationAtivo();
    let subscription = await registration.pushManager.getSubscription();

    // Se existir inscrição prévia gerada com chave VAPID antiga/diferente, limpa antes de renovar
    if (subscription && subscription.options?.applicationServerKey && !keysMatch(subscription.options.applicationServerKey, applicationServerKey)) {
        try {
            await subscription.unsubscribe();
        } catch (_) {}
        subscription = null;
    }

    if (!subscription) {
        try {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey
            });
        } catch (firstErr) {
            // Tentativa de recuperação: remove inscrição órfã, garante SW ativo e tenta 1x novamente
            try {
                const lingering = await registration.pushManager.getSubscription();
                if (lingering) {
                    await lingering.unsubscribe();
                }
                registration = await obterRegistrationAtivo();
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey
                });
            } catch (retryErr) {
                const finalErr = retryErr || firstErr;
                const isBrave = await detectarBrave();
                reportarErroPushAoServidor({
                    name: finalErr?.name || 'Error',
                    message: finalErr?.message || String(finalErr),
                    swState: registration?.active?.state || registration?.installing?.state || registration?.waiting?.state || 'none',
                    isBrave
                });
                const amigavel = new Error(traduzirErroPush(finalErr, { isBrave }));
                amigavel.originalError = finalErr;
                throw amigavel;
            }
        }
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
