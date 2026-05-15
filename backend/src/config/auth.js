import jwt from 'jsonwebtoken';
import { config } from "dotenv";

export const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).json({ mensagem: 'Acesso negado. Nenhum token fornecido' });
    }

    // Suporta formato "Bearer <token>" ou token direto
    const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuarioId = decoded.id;
        next();
    } catch (error) {
        console.error('Erro na verificação do token:', error.message);
        return res.status(403).json({ mensagem: 'Token inválido ou expirado' });
    }
};