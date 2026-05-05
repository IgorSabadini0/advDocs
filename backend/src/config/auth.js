import jwt from 'jsonwebtoken';
import { config } from "dotenv";

export const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(401).json({ mensagem: 'Acesso negado. Nenhum token fornecido' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.usuarioId = decodedId;
        next();
    } catch (error) {
        return res.status(403).json({ mensagem: 'Token inválido ou expirado' });
    }
};