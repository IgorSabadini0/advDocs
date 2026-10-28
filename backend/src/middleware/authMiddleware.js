import jwt from 'jsonwebtoken';
import { userModel } from '../models/userModel.js';

export const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ mensagem: 'Acesso negado. Nenhum token fornecido' });
    }

    // Suporta formato "Bearer <token>" ou token direto
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : authHeader.trim();

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });

        // Verifica se o usuário existe e está ativo no banco de dados via Model
        const statusUsuario = await userModel.findAuthStatusById(decoded.id);
        if (!statusUsuario) {
            return res.status(401).json({ mensagem: 'Usuário não encontrado' });
        }
        if (!statusUsuario.is_active) {
            return res.status(401).json({ mensagem: 'Usuário desativado' });
        }

        req.usuarioId = statusUsuario.id;
        req.usuarioRole = statusUsuario.role;
        next();
    } catch (error) {
        console.error('Erro na verificação do token:', error.message);
        return res.status(401).json({ mensagem: 'Token inválido ou expirado' });
    }
};

export const requireAdmin = (req, res, next) => {
    if (req.usuarioRole !== 'admin') {
        return res.status(403).json({ mensagem: 'Permissão insuficiente. Requer perfil de administrador.' });
    }
    next();
};
