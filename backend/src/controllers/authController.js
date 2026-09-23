import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
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

            // Hashing de senha com suporte a legacy
            const senhaValida = (await bcrypt.compare(password, usuario.password)) || password === usuario.password;

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
