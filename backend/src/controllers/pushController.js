import { pushSubscriptionModel } from '../models/pushSubscriptionModel.js';
import { getVapidPublicKey, sendPushToUser } from '../services/pushNotificationService.js';

const isValidPushEndpoint = (endpoint) => {
    if (typeof endpoint !== 'string') return false;
    const trimmed = endpoint.trim();
    if (!trimmed || trimmed.length > 2048) return false;

    try {
        const parsed = new URL(trimmed);
        if (parsed.protocol === 'https:') return true;
        if (
            parsed.protocol === 'http:' &&
            (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
        ) {
            return true;
        }
        return false;
    } catch (_) {
        return false;
    }
};

export const getPublicKey = (req, res) => {
    try {
        const publicKey = getVapidPublicKey();
        return res.status(200).json({ publicKey });
    } catch (error) {
        console.error('[PushController] Erro ao obter chave VAPID pública:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao obter chave pública VAPID.' });
    }
};

export const subscribe = async (req, res) => {
    try {
        const subscription = req.body?.subscription || req.body || {};
        const endpoint = subscription.endpoint;
        const p256dh = subscription.keys?.p256dh;
        const auth = subscription.keys?.auth;

        if (!isValidPushEndpoint(endpoint)) {
            return res.status(400).json({ mensagem: 'Endpoint de inscrição Push inválido.' });
        }

        if (
            typeof p256dh !== 'string' || !p256dh.trim() ||
            typeof auth !== 'string' || !auth.trim()
        ) {
            return res.status(400).json({ mensagem: 'Chaves de criptografia Web Push (p256dh/auth) obrigatórias.' });
        }

        const userAgent = req.headers?.['user-agent']
            ? String(req.headers['user-agent']).slice(0, 255)
            : null;

        const saved = await pushSubscriptionModel.upsertSubscription({
            userId: req.usuarioId,
            endpoint: endpoint.trim(),
            p256dh: p256dh.trim(),
            auth: auth.trim(),
            userAgent
        });

        return res.status(201).json({
            mensagem: 'Dispositivo inscrito com sucesso nas notificações Push.',
            subscription: {
                id: saved.id,
                endpoint_hash: saved.endpoint_hash
            }
        });
    } catch (error) {
        console.error('[PushController] Erro ao salvar inscrição Push:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao registrar inscrição de notificação.' });
    }
};

export const unsubscribe = async (req, res) => {
    try {
        const endpoint = req.body?.endpoint;
        if (!isValidPushEndpoint(endpoint)) {
            return res.status(400).json({ mensagem: 'Endpoint inválido para remoção.' });
        }

        const result = await pushSubscriptionModel.deleteByEndpoint({
            endpoint: endpoint.trim(),
            userId: req.usuarioId
        });

        return res.status(200).json({
            mensagem: 'Inscrição Push removida com sucesso.',
            removidos: Number(result?.affectedRows || 0)
        });
    } catch (error) {
        console.error('[PushController] Erro ao remover inscrição Push:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao remover inscrição de notificação.' });
    }
};

export const sendTest = async (req, res) => {
    try {
        const resultado = await sendPushToUser(req.usuarioId, {
            title: 'Alerta Jurídico — advDocs',
            body: 'As notificações Push nativas estão ativas neste dispositivo!',
            url: '/pages/config/#perfil',
            tag: 'advdocs-test-push'
        });

        if (resultado.total === 0) {
            return res.status(404).json({
                mensagem: 'Nenhum dispositivo inscrito encontrado para a sua conta. Ative as notificações primeiro.',
                resultado
            });
        }

        return res.status(200).json({
            mensagem: `Notificação de teste processada (${resultado.enviados} enviada(s)).`,
            resultado
        });
    } catch (error) {
        console.error('[PushController] Erro ao disparar notificação Push de teste:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao enviar notificação de teste.' });
    }
};

export const reportClientError = (req, res) => {
    const { name, message, swState, isBrave } = req.body || {};
    const ua = String(req.headers?.['user-agent'] || '').slice(0, 180);
    console.warn(
        `[PushClientError] user=${req.usuarioId} name=${String(name || 'Unknown').slice(0, 60)} ` +
        `message=${String(message || '').slice(0, 300)} swState=${String(swState || '')} ` +
        `isBrave=${Boolean(isBrave)} ua="${ua}"`
    );
    return res.status(200).json({ ok: true });
};

export const pushController = {
    getPublicKey,
    subscribe,
    unsubscribe,
    sendTest,
    reportClientError
};

export default pushController;
