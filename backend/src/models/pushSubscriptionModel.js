import crypto from 'node:crypto';
import { db } from '../config/db.js';

let ensureTablePromise = null;

const CREATE_PUSH_SUBSCRIPTIONS_SQL = `
    CREATE TABLE IF NOT EXISTS push_subscriptions (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT NOT NULL,
        endpoint TEXT NOT NULL,
        endpoint_hash CHAR(64) NOT NULL COMMENT 'SHA-256 do endpoint para UNIQUE KEY em URLs longas do APNs/FCM',
        p256dh VARCHAR(255) NOT NULL,
        auth VARCHAR(255) NOT NULL,
        user_agent VARCHAR(255) DEFAULT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uk_push_endpoint_hash (endpoint_hash),
        KEY idx_push_user_id (user_id),
        CONSTRAINT fk_push_subscriptions_user FOREIGN KEY (user_id) REFERENCES login (id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

export const hashEndpoint = (endpoint) => {
    return crypto
        .createHash('sha256')
        .update(String(endpoint || '').trim())
        .digest('hex');
};

export const ensurePushSubscriptionsTable = async (connPool = db) => {
    if (connPool === db) {
        if (!ensureTablePromise) {
            ensureTablePromise = connPool.query(CREATE_PUSH_SUBSCRIPTIONS_SQL).catch((err) => {
                ensureTablePromise = null;
                throw err;
            });
        }
        return ensureTablePromise;
    }
    return connPool.query(CREATE_PUSH_SUBSCRIPTIONS_SQL);
};

export const pushSubscriptionModel = {
    hashEndpoint,
    ensureTable: ensurePushSubscriptionsTable,

    upsertSubscription: async ({ userId, endpoint, p256dh, auth, userAgent = null }, connPool = db) => {
        await ensurePushSubscriptionsTable(connPool);

        const uid = Number(userId);
        const ep = String(endpoint || '').trim();
        const epHash = hashEndpoint(ep);
        const keyP256dh = String(p256dh || '').trim().slice(0, 255);
        const keyAuth = String(auth || '').trim().slice(0, 255);
        const ua = userAgent ? String(userAgent).trim().slice(0, 255) : null;

        const [result] = await connPool.query(`
            INSERT INTO push_subscriptions (user_id, endpoint, endpoint_hash, p256dh, auth, user_agent)
            VALUES (?, ?, ?, ?, ?, ?)
            ON DUPLICATE KEY UPDATE
                user_id = VALUES(user_id),
                endpoint = VALUES(endpoint),
                p256dh = VALUES(p256dh),
                auth = VALUES(auth),
                user_agent = VALUES(user_agent),
                updated_at = CURRENT_TIMESTAMP
        `, [uid, ep, epHash, keyP256dh, keyAuth, ua]);

        return {
            id: result.insertId || null,
            user_id: uid,
            endpoint: ep,
            endpoint_hash: epHash
        };
    },

    deleteByEndpoint: async ({ endpoint, userId = null }, connPool = db) => {
        await ensurePushSubscriptionsTable(connPool);

        const epHash = hashEndpoint(endpoint);
        if (userId !== null && userId !== undefined) {
            const [result] = await connPool.query(
                'DELETE FROM push_subscriptions WHERE endpoint_hash = ? AND user_id = ?',
                [epHash, Number(userId)]
            );
            return result;
        }

        const [result] = await connPool.query(
            'DELETE FROM push_subscriptions WHERE endpoint_hash = ?',
            [epHash]
        );
        return result;
    },

    listByUserId: async (userId, connPool = db) => {
        await ensurePushSubscriptionsTable(connPool);

        const [rows] = await connPool.query(`
            SELECT id, user_id, endpoint, endpoint_hash, p256dh, auth, user_agent, created_at, updated_at
            FROM push_subscriptions
            WHERE user_id = ?
            ORDER BY updated_at DESC, id DESC
        `, [Number(userId)]);

        return rows;
    },

    listDistinctSubscribedUserIds: async (connPool = db) => {
        await ensurePushSubscriptionsTable(connPool);

        const [rows] = await connPool.query(`
            SELECT DISTINCT ps.user_id
            FROM push_subscriptions ps
            INNER JOIN login l ON l.id = ps.user_id
            WHERE l.is_active = 1
        `);

        return rows.map(r => Number(r.user_id));
    }
};

export default pushSubscriptionModel;
