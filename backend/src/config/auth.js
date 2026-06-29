import jwt from 'jsonwebtoken';
import { config } from "dotenv";
import db from './db.js';

export const verifyToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ mensagem: 'Acesso negado. Nenhum token fornecido' });
    }

    // Suporta formato "Bearer <token>" ou token direto
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Verifica se o usuário existe e está ativo no banco de dados
        const [rows] = await db.query("SELECT is_active FROM login WHERE id = ? LIMIT 1", [decoded.id]);
        if (rows.length === 0) {
            return res.status(403).json({ mensagem: 'Usuário não encontrado' });
        }
        if (!rows[0].is_active) {
            return res.status(403).json({ mensagem: 'Usuário desativado' });
        }

        req.usuarioId = decoded.id;
        next();
    } catch (error) {
        console.error('Erro na verificação do token:', error.message);
        return res.status(403).json({ mensagem: 'Token inválido ou expirado' });
    }
};