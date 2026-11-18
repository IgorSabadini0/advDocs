import { db } from '../config/db.js';
import { sendPushToUser } from '../services/pushNotificationService.js';

const TIPOS_VALIDOS = new Set(['sucesso', 'erro', 'info']);

export const notificacaoModel = {
    create: async ({ usuario_id, cliente_id = null, titulo, mensagem, tipo = 'info' }) => {
        const tipoLimpo = TIPOS_VALIDOS.has(tipo) ? tipo : 'info';
        const tituloLimpo = String(titulo || 'Notificação').trim().slice(0, 140);
        const mensagemLimpa = String(mensagem || '').trim();
        const clienteIdVal = (cliente_id && Number(cliente_id) > 0) ? Number(cliente_id) : null;

        const query = `
            INSERT INTO notificacoes (usuario_id, cliente_id, titulo, mensagem, tipo)
            VALUES (?, ?, ?, ?, ?)
        `;
        const [result] = await db.query(query, [
            Number(usuario_id),
            clienteIdVal,
            tituloLimpo,
            mensagemLimpa,
            tipoLimpo
        ]);

        // Dispara notificação Web Push em segundo plano sem bloquear o retorno HTTP/worker
        sendPushToUser(Number(usuario_id), {
            title: tituloLimpo,
            body: mensagemLimpa,
            url: clienteIdVal ? `/pages/main/?openPasta=${clienteIdVal}` : '/pages/main/',
            tag: `advdocs-notif-${result.insertId}`
        }).catch(() => {});

        return {
            id: result.insertId,
            usuario_id: Number(usuario_id),
            cliente_id: clienteIdVal,
            titulo: tituloLimpo,
            mensagem: mensagemLimpa,
            tipo: tipoLimpo,
            lida: false
        };
    },

    listByUsuario: async (usuarioId, limit = 30) => {
        const lim = Math.min(Math.max(Number(limit) || 30, 1), 100);

        // Expira consultas presas em 'pendente' (ex.: queda ou reinício do servidor) após 3 minutos
        await db.query(`
            UPDATE clientes
            SET datajud_status = 'erro',
                datajud_mensagem = 'Tempo limite da sincronização em segundo plano excedido. Tente sincronizar novamente.'
            WHERE datajud_status = 'pendente'
              AND (datajud_atualizado_em IS NULL OR datajud_atualizado_em < (NOW() - INTERVAL 3 MINUTE))
        `);

        const [rows] = await db.query(`
            SELECT n.id, n.usuario_id, n.cliente_id, n.titulo, n.mensagem, n.tipo,
                   n.lida, n.criada_em,
                   c.numeroPasta AS pasta_numero,
                   c.nome AS cliente_nome,
                   c.numeroProc AS numero_processo,
                   c.datajud_status
            FROM notificacoes n
            LEFT JOIN clientes c ON c.id = n.cliente_id
            WHERE n.usuario_id = ?
            ORDER BY n.criada_em DESC, n.id DESC
            LIMIT ?
        `, [Number(usuarioId), lim]);

        const [[unreadRow]] = await db.query(
            "SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id = ? AND lida = 0",
            [Number(usuarioId)]
        );

        const [[pendingRow]] = await db.query(
            "SELECT COUNT(*) AS total FROM clientes WHERE datajud_status = 'pendente'"
        );

        return {
            notificacoes: rows.map(r => ({
                ...r,
                lida: Boolean(r.lida)
            })),
            naoLidas: Number(unreadRow?.total || 0),
            consultasPendentes: Number(pendingRow?.total || 0)
        };
    },

    marcarComoLida: async (id, usuarioId) => {
        const [result] = await db.query(
            "UPDATE notificacoes SET lida = TRUE WHERE id = ? AND usuario_id = ?",
            [Number(id), Number(usuarioId)]
        );
        return result;
    },

    marcarTodasComoLidas: async (usuarioId) => {
        const [result] = await db.query(
            "UPDATE notificacoes SET lida = TRUE WHERE usuario_id = ? AND lida = FALSE",
            [Number(usuarioId)]
        );
        return result;
    },

    excluirPorId: async (id, usuarioId) => {
        const [result] = await db.query(
            "DELETE FROM notificacoes WHERE id = ? AND usuario_id = ?",
            [Number(id), Number(usuarioId)]
        );
        return result;
    },

    excluirTodasPorUsuario: async (usuarioId) => {
        const [result] = await db.query(
            "DELETE FROM notificacoes WHERE usuario_id = ?",
            [Number(usuarioId)]
        );
        return result;
    }
};

export default notificacaoModel;
