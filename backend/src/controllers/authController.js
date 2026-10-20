import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { db } from '../config/db.js';
import { userModel } from '../models/userModel.js';

export const authController = {
    login: async (req, res) => {
        const { user, password } = req.body;

        if (!user || !password) {
            return res.status(400).json({ mensagem: 'Usuário e senha são obrigatórios.' });
        }

        try {
            const usuario = await userModel.findByUsername(user);

            if (!usuario) {
                return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
            }

            // Verifica se o usuário está ativo
            if (!usuario.is_active) {
                return res.status(403).json({ mensagem: 'Usuário desativado.' });
            }

            // Validação de senha com hash bcrypt
            let senhaValida = false;
            try {
                senhaValida = await bcrypt.compare(password, usuario.password);
            } catch (_) {
                senhaValida = false;
            }

            // Migração transparente de senhas legadas que ainda estivessem em texto puro
            if (!senhaValida && password === usuario.password) {
                senhaValida = true;
                const novoHash = await bcrypt.hash(password, 10);
                await db.query("UPDATE login SET password = ? WHERE id = ?", [novoHash, usuario.id]);
            }

            if (!senhaValida) {
                return res.status(401).json({ mensagem: 'Usuário ou senha inválidos.' });
            }

            // Lógica para gerar Token de autenticação JWT
            const token = jwt.sign(
                { id: usuario.id, nome: usuario.user },
                process.env.JWT_SECRET,
                { expiresIn: '8h' }
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
