import bcrypt from 'bcrypt';
import { userModel } from '../models/userModel.js';

export const userController = {
    getMe: async (req, res) => {
        try {
            const usuario = await userModel.findById(req.usuarioId);
            if (!usuario) {
                return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
            }

            return res.status(200).json({
                id: usuario.id,
                user: usuario.user,
                name: usuario.name,
                role: req.usuarioRole || 'user',
                is_active: Boolean(usuario.is_active),
                created_at: usuario.created_at,
                updated_at: usuario.updated_at
            });
        } catch (error) {
            console.error(`Erro ao carregar perfil do usuário: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    updateMyProfile: async (req, res) => {
        try {
            const { name } = req.body;
            if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 64) {
                return res.status(400).json({ mensagem: 'Nome inválido (deve ter entre 2 e 64 caracteres).' });
            }

            await userModel.updateName(req.usuarioId, name);
            return res.status(200).json({ mensagem: 'Perfil atualizado com sucesso!', name: name.trim() });
        } catch (error) {
            console.error(`Erro ao atualizar nome do perfil: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    updateMyPassword: async (req, res) => {
        try {
            const { senhaAtual, novaSenha } = req.body;

            if (!senhaAtual || !novaSenha || typeof senhaAtual !== 'string' || typeof novaSenha !== 'string') {
                return res.status(400).json({ mensagem: 'Senha atual e nova senha são obrigatórias.' });
            }

            if (novaSenha.length < 8 || novaSenha.length > 72 || senhaAtual.length > 72) {
                return res.status(400).json({ mensagem: 'A nova senha deve ter entre 8 e 72 caracteres.' });
            }

            const usuario = await userModel.findById(req.usuarioId);
            if (!usuario) {
                return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
            }

            // Valida senha atual
            const senhaCorreta = await bcrypt.compare(senhaAtual, usuario.password);
            if (!senhaCorreta) {
                return res.status(400).json({ mensagem: 'A senha atual informada está incorreta.' });
            }

            const novoHash = await bcrypt.hash(novaSenha, 10);
            await userModel.updatePassword(req.usuarioId, novoHash);

            return res.status(200).json({ mensagem: 'Senha alterada com sucesso!' });
        } catch (error) {
            console.error(`Erro ao alterar senha: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    listUsers: async (req, res) => {
        try {
            const users = await userModel.listUsers();
            const formatados = users.map(u => ({
                id: u.id,
                user: u.user,
                name: u.name,
                is_active: Boolean(u.is_active),
                created_at: u.created_at,
                is_current: u.id === req.usuarioId
            }));

            return res.status(200).json(formatados);
        } catch (error) {
            console.error(`Erro ao listar usuários: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    createUser: async (req, res) => {
        try {
            const { user, name, password, is_active } = req.body;

            if (!user || typeof user !== 'string' || user.trim().length < 3 || user.trim().length > 64) {
                return res.status(400).json({ mensagem: 'Usuário inválido (entre 3 e 64 caracteres).' });
            }

            if (!name || typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 64) {
                return res.status(400).json({ mensagem: 'Nome inválido (entre 2 e 64 caracteres).' });
            }

            if (!password || typeof password !== 'string' || password.length < 8 || password.length > 72) {
                return res.status(400).json({ mensagem: 'A senha deve conter entre 8 e 72 caracteres.' });
            }

            const userLimpo = user.trim().toLowerCase();
            const usuarioExistente = await userModel.findByUsername(userLimpo);
            if (usuarioExistente) {
                return res.status(409).json({ mensagem: 'Já existe um usuário cadastrado com este nome de acesso.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const resultado = await userModel.create({
                user: userLimpo,
                name: name.trim(),
                password: hashedPassword,
                is_active: is_active !== false
            });

            return res.status(201).json({
                mensagem: 'Novo usuário cadastrado com sucesso!',
                id: resultado.insertId,
                user: userLimpo,
                name: name.trim()
            });
        } catch (error) {
            console.error(`Erro ao cadastrar novo usuário: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    toggleUserStatus: async (req, res) => {
        try {
            const { id } = req.params;
            const { is_active } = req.body;
            const parsedId = Number(id);

            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID de usuário inválido.' });
            }

            if (typeof is_active !== 'boolean') {
                return res.status(400).json({ mensagem: 'O campo is_active deve ser um valor booleano (true ou false).' });
            }

            if (parsedId === req.usuarioId && !is_active) {
                return res.status(400).json({ mensagem: 'Você não pode desativar seu próprio usuário logado.' });
            }

            const usuario = await userModel.findById(parsedId);
            if (!usuario) {
                return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
            }

            await userModel.toggleActive(parsedId, is_active);
            return res.status(200).json({
                mensagem: `Usuário ${is_active ? 'ativado' : 'desativado'} com sucesso!`,
                is_active
            });
        } catch (error) {
            console.error(`Erro ao alterar status do usuário: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    deleteUser: async (req, res) => {
        try {
            const { id } = req.params;
            const parsedId = Number(id);

            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID de usuário inválido.' });
            }

            if (parsedId === req.usuarioId) {
                return res.status(400).json({ mensagem: 'Você não pode excluir sua própria conta enquanto estiver logado.' });
            }

            const usuario = await userModel.findById(parsedId);
            if (!usuario) {
                return res.status(404).json({ mensagem: 'Usuário não encontrado.' });
            }

            await userModel.delete(parsedId);
            return res.status(200).json({ mensagem: 'Usuário excluído com sucesso!' });
        } catch (error) {
            console.error(`Erro ao excluir usuário: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    }
};

export default userController;
