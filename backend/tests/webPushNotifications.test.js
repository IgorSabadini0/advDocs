import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    getVapidPublicKey,
    sendPushToUser,
    setWebPushSender,
    setPushSubscriptionModelForTest,
    resetWebPushSender
} from '../src/services/pushNotificationService.js';
import { pushController } from '../src/controllers/pushController.js';
import { urlBase64ToUint8Array, supportsWebPushInCurrentContext } from '../../frontend/src/utils/pushManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const createMockRes = () => {
    const res = {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
    return res;
};

describe('Web Push API (VAPID / RFC 8030) & Compatibilidade iOS', () => {
    afterEach(() => {
        resetWebPushSender();
    });

    it('gera/retorna chave pública VAPID válida (65 bytes P-256) e converte via urlBase64ToUint8Array', () => {
        const publicKey = getVapidPublicKey();
        assert.equal(typeof publicKey, 'string');
        assert.ok(publicKey.length >= 80, 'Chave pública VAPID deve estar em Base64 URL-safe');

        const bytes = urlBase64ToUint8Array(publicKey);
        assert.ok(bytes instanceof Uint8Array);
        assert.equal(bytes.length, 65, 'Chave pública VAPID P-256 descomprimida possui 65 bytes');
        assert.equal(bytes[0], 0x04, 'Primeiro byte deve indicar ponto não-comprimido (0x04)');
    });

    it('envia push para múltiplos dispositivos e limpa automaticamente endpoints HTTP 410 e 404', async () => {
        const deletedEndpoints = [];
        const sentPayloads = [];

        const mockModel = {
            async listByUserId(userId) {
                assert.equal(userId, 42);
                return [
                    {
                        id: 1,
                        user_id: 42,
                        endpoint: 'https://web.push.apple.com/QBh0abc_valid_iphone',
                        p256dh: 'p256dh_iphone',
                        auth: 'auth_iphone'
                    },
                    {
                        id: 2,
                        user_id: 42,
                        endpoint: 'https://web.push.apple.com/QBh0abc_expired_410',
                        p256dh: 'p256dh_old',
                        auth: 'auth_old'
                    },
                    {
                        id: 3,
                        user_id: 42,
                        endpoint: 'https://fcm.googleapis.com/fcm/send/missing_404',
                        p256dh: 'p256dh_chrome',
                        auth: 'auth_chrome'
                    },
                    {
                        id: 4,
                        user_id: 42,
                        endpoint: 'https://fcm.googleapis.com/fcm/send/temp_503',
                        p256dh: 'p256dh_503',
                        auth: 'auth_503'
                    }
                ];
            },
            async deleteByEndpoint({ endpoint }) {
                deletedEndpoints.push(endpoint);
                return { affectedRows: 1 };
            }
        };

        setPushSubscriptionModelForTest(mockModel);
        setWebPushSender(async (sub, payloadStr) => {
            if (sub.endpoint.includes('expired_410')) {
                const err = new Error('Gone');
                err.statusCode = 410;
                throw err;
            }
            if (sub.endpoint.includes('missing_404')) {
                const err = new Error('Not Found');
                err.statusCode = 404;
                throw err;
            }
            if (sub.endpoint.includes('temp_503')) {
                const err = new Error('Service Unavailable');
                err.statusCode = 503;
                throw err;
            }
            sentPayloads.push({ endpoint: sub.endpoint, payload: JSON.parse(payloadStr) });
        });

        const resumo = await sendPushToUser(42, {
            title: 'Nova Intimação TRF3',
            body: 'Despacho publicado na Pasta 102.',
            url: '/pages/main/?openPasta=102',
            tag: 'advdocs-notif-9'
        });

        assert.equal(resumo.total, 4);
        assert.equal(resumo.enviados, 1);
        assert.equal(resumo.removidos, 2);
        assert.equal(resumo.falhas, 1);

        assert.deepEqual(deletedEndpoints.sort(), [
            'https://fcm.googleapis.com/fcm/send/missing_404',
            'https://web.push.apple.com/QBh0abc_expired_410'
        ]);

        assert.equal(sentPayloads.length, 1);
        assert.equal(sentPayloads[0].payload.title, 'Nova Intimação TRF3');
        assert.equal(sentPayloads[0].payload.body, 'Despacho publicado na Pasta 102.');
        assert.equal(sentPayloads[0].payload.icon, '/icons/icon-192x192.png');
        assert.equal(sentPayloads[0].payload.data.url, '/pages/main/?openPasta=102');
    });

    it('valida payloads e rejeita endpoints inseguros ou chaves ausentes no pushController', async () => {
        const resKey = createMockRes();
        pushController.getPublicKey({}, resKey);
        assert.equal(resKey.statusCode, 200);
        assert.ok(typeof resKey.body.publicKey === 'string' && resKey.body.publicKey.length > 50);

        const resHttp = createMockRes();
        await pushController.subscribe(
            {
                usuarioId: 1,
                body: {
                    endpoint: 'http://insecure.example.com/push/123',
                    keys: { p256dh: 'abc', auth: 'def' }
                }
            },
            resHttp
        );
        assert.equal(resHttp.statusCode, 400);

        const resNoKeys = createMockRes();
        await pushController.subscribe(
            {
                usuarioId: 1,
                body: {
                    endpoint: 'https://web.push.apple.com/valid-endpoint',
                    keys: { p256dh: 'abc' }
                }
            },
            resNoKeys
        );
        assert.equal(resNoKeys.statusCode, 400);

        const resBadUnsub = createMockRes();
        await pushController.unsubscribe(
            { usuarioId: 1, body: { endpoint: 'invalid-url' } },
            resBadUnsub
        );
        assert.equal(resBadUnsub.statusCode, 400);
    });

    it('garante proteção de compatibilidade iOS em pushManager.js e evento push obrigatório em sw.js', async () => {
        // Em ambiente Node/sem window ou iOS não-standalone, não deve quebrar nem expor Notification
        assert.equal(supportsWebPushInCurrentContext(), false);

        const swContent = await fs.readFile(path.resolve(__dirname, '../../frontend/src/sw.js'), 'utf8');
        assert.ok(swContent.includes("self.addEventListener('push'"));
        assert.ok(swContent.includes('self.registration.showNotification('));
        assert.ok(swContent.includes("self.addEventListener('notificationclick'"));
        assert.ok(swContent.includes('clients.matchAll('));
        assert.ok(swContent.includes('clients.openWindow('));

        const pmContent = await fs.readFile(path.resolve(__dirname, '../../frontend/src/utils/pushManager.js'), 'utf8');
        assert.ok(pmContent.includes('isIosSafari() && !isRunningStandalone()'));
        assert.ok(pmContent.includes("typeof window.Notification !== 'undefined'"));
        assert.ok(pmContent.includes('userVisibleOnly: true'));
    });
});
