import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { userModel } from '../models/userModel.js';

// Hash dummy pré-computado (custo 10) para mitigar enumeração de usuários por timing attack
const DUMMY_BCRYPT_HASH = '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

export const authController = {
    login: async (req, res) => {
        const { user, password } = req.body;

        if (typeof user !== 'string' || typeof password !== 'string' || !user.trim() || !password || password.length > 72) {
            return res.status(400).json({ mensagem: 'Usuário e senha válidos são obrigatórios.' });
        }

        try {
            const usuario = await userModel.findByUsername(user.trim());
            const hashAlvo = usuario?.password?.startsWith('$2') ? usuario.password : DUMMY_BCRYPT_HASH;

            let senhaValida = false;
            try {
                senhaValida = await bcrypt.compare(password, hashAlvo);
            } catch (_) {
                senhaValida = false;
            }

            if (!usuario || !senhaValida) {
                return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
            }

            // Verifica se o usuário está ativo somente após validar as credenciais
            if (!usuario.is_active) {
                return res.status(403).json({ mensagem: 'Usuário desativado.' });
            }

            // Lógica para gerar Token de autenticação JWT
            const token = jwt.sign(
                { id: usuario.id, nome: usuario.user },
                process.env.JWT_SECRET,
                { algorithm: 'HS256', expiresIn: '8h' }
            );

            return res.status(200).json({
                mensagem: 'Login efetuado com sucesso',
                redirectUrl: '/pages/main',
                token: token,
                usuario: {
                    id: usuario.id,
                    nome: usuario.user
                }
            });
        } catch (error) {
            console.error(`Erro na autenticação: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    }
};

export default authController;
