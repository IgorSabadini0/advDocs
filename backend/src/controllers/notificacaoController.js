import { notificacaoModel } from '../models/notificacaoModel.js';

const listarNotificacoes = async (req, res) => {
    try {
        const limit = Number(req.query.limit) || 30;
        const dados = await notificacaoModel.listByUsuario(req.usuarioId, limit);
        return res.status(200).json(dados);
    } catch (error) {
        console.error('Erro ao listar notificações:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao buscar notificações.' });
    }
};

const marcarLida = async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: 'ID de notificação inválido.' });
        }

        const result = await notificacaoModel.marcarComoLida(parsedId, req.usuarioId);
        if (result.affectedRows === 0) {
            return res.status(404).json({ mensagem: 'Notificação não encontrada.' });
        }

        return res.status(200).json({ mensagem: 'Notificação marcada como lida.' });
    } catch (error) {
        console.error('Erro ao marcar notificação como lida:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao atualizar notificação.' });
    }
};

const marcarTodasLidas = async (req, res) => {
    try {
        await notificacaoModel.marcarTodasComoLidas(req.usuarioId);
        return res.status(200).json({ mensagem: 'Todas as notificações foram marcadas como lidas.' });
    } catch (error) {
        console.error('Erro ao marcar todas as notificações como lidas:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao atualizar notificações.' });
    }
};

export const notificacaoController = {
    listarNotificacoes,
    marcarLida,
    marcarTodasLidas
};
