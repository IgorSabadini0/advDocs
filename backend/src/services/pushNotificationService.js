import { createRequire } from 'node:module';
import { pushSubscriptionModel } from '../models/pushSubscriptionModel.js';

const require = createRequire(import.meta.url);
const webpush = require('web-push');

let vapidConfigured = false;
let ephemeralKeys = null;
let customSenderFn = null;
let modelOverride = null;

const getModel = () => modelOverride || pushSubscriptionModel;

const resolveVapidConfig = () => {
    const publicKey = (process.env.VAPID_PUBLIC_KEY || '').trim();
    const privateKey = (process.env.VAPID_PRIVATE_KEY || '').trim();
    const subject = (process.env.VAPID_SUBJECT || 'mailto:contato@palharesferreiraadvocacia.com.br').trim();

    if (publicKey && privateKey) {
        return { publicKey, privateKey, subject };
    }

    if (!ephemeralKeys) {
        ephemeralKeys = webpush.generateVAPIDKeys();
        if (process.env.NODE_ENV !== 'test') {
            console.warn(
                '[WebPush] VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY não configuradas no .env; usando chaves efêmeras em memória.'
            );
        }
    }

    return {
        publicKey: ephemeralKeys.publicKey,
        privateKey: ephemeralKeys.privateKey,
        subject
    };
};

const ensureVapidConfigured = () => {
    const cfg = resolveVapidConfig();
    if (!vapidConfigured || process.env.VAPID_PUBLIC_KEY) {
        webpush.setVapidDetails(cfg.subject, cfg.publicKey, cfg.privateKey);
        vapidConfigured = true;
    }
    return cfg;
};

export const getVapidPublicKey = () => {
    const cfg = ensureVapidConfigured();
    return cfg.publicKey;
};

export const setWebPushSender = (senderFn) => {
    customSenderFn = typeof senderFn === 'function' ? senderFn : null;
};

export const setPushSubscriptionModelForTest = (mockModel) => {
    modelOverride = mockModel || null;
};

export const resetWebPushSender = () => {
    customSenderFn = null;
    modelOverride = null;
};

const executarEnvioDispositivo = (subscriptionObj, payloadStr) => {
    if (customSenderFn) {
        return customSenderFn(subscriptionObj, payloadStr);
    }
    ensureVapidConfigured();
    return webpush.sendNotification(subscriptionObj, payloadStr, {
        TTL: 60 * 60 * 12 // 12 horas de retenção no APNs/FCM
    });
};

/**
 * Envia notificação Web Push para todos os dispositivos inscritos de um usuário.
 * Remove automaticamente endpoints inválidos quando APNs/FCM retornarem HTTP 410 ou 404.
 *
 * @param {number} userId
 * @param {{ title?: string, body?: string, url?: string, tag?: string, icon?: string, badge?: string, data?: object }} payloadOpts
 */
export const sendPushToUser = async (userId, {
    title = 'advDocs — Alerta Jurídico',
    body = 'Você possui uma nova atualização no sistema.',
    url = '/pages/main/',
    tag = 'advdocs-alert',
    icon = '/icons/icon-192x192.png',
    badge = '/icons/apple-touch-icon.png',
    data = {}
} = {}) => {
    const uid = Number(userId);
    if (!Number.isInteger(uid) || uid <= 0) {
        return { total: 0, enviados: 0, removidos: 0, falhas: 0 };
    }

    const model = getModel();
    const subscriptions = await model.listByUserId(uid);

    if (!Array.isArray(subscriptions) || subscriptions.length === 0) {
        return { total: 0, enviados: 0, removidos: 0, falhas: 0 };
    }

    const payloadJson = JSON.stringify({
        title: String(title || 'advDocs — Alerta Jurídico').slice(0, 140),
        body: String(body || 'Você possui uma nova atualização no sistema.').slice(0, 500),
        icon,
        badge,
        tag: String(tag || 'advdocs-alert').slice(0, 80),
        url,
        timestamp: Date.now(),
        data: {
            url,
            ...data
        }
    });

    let enviados = 0;
    let removidos = 0;
    let falhas = 0;

    const results = await Promise.allSettled(
        subscriptions.map(async (sub) => {
            const pushSubscription = {
                endpoint: sub.endpoint,
                keys: {
                    p256dh: sub.p256dh,
                    auth: sub.auth
                }
            };

            try {
                await executarEnvioDispositivo(pushSubscription, payloadJson);
                return { status: 'sent', endpoint: sub.endpoint };
            } catch (err) {
                const statusCode = Number(err?.statusCode || err?.status || 0);
                if (statusCode === 410 || statusCode === 404) {
                    try {
                        await model.deleteByEndpoint({ endpoint: sub.endpoint });
                    } catch (_) {
                        // Evita interromper o lote caso falhe a remoção
                    }
                    return { status: 'removed', endpoint: sub.endpoint, statusCode };
                }
                throw err;
            }
        })
    );

    for (const res of results) {
        if (res.status === 'fulfilled') {
            if (res.value?.status === 'removed') {
                removidos++;
            } else {
                enviados++;
            }
        } else {
            falhas++;
        }
    }

    return {
        total: subscriptions.length,
        enviados,
        removidos,
        falhas
    };
};

/**
 * Dispara alerta push para todos os usuários ativos que possuem dispositivos inscritos.
 */
export const sendPushToAllSubscribedUsers = async (notificationPayload) => {
    const model = getModel();
    const userIds = await model.listDistinctSubscribedUserIds();
    if (!Array.isArray(userIds) || userIds.length === 0) {
        return { usuarios: 0, enviados: 0, removidos: 0, falhas: 0 };
    }

    let enviados = 0;
    let removidos = 0;
    let falhas = 0;

    const lote = await Promise.allSettled(
        userIds.map((uid) => sendPushToUser(uid, notificationPayload))
    );

    for (const item of lote) {
        if (item.status === 'fulfilled' && item.value) {
            enviados += item.value.enviados || 0;
            removidos += item.value.removidos || 0;
            falhas += item.value.falhas || 0;
        } else {
            falhas++;
        }
    }

    return {
        usuarios: userIds.length,
        enviados,
        removidos,
        falhas
    };
};

export const PushNotificationService = {
    getVapidPublicKey,
    sendPushToUser,
    sendPushToAllSubscribedUsers,
    setWebPushSender,
    setPushSubscriptionModelForTest,
    resetWebPushSender
};

export default PushNotificationService;
