import { rbacModel } from '../models/rbacModel.js';

const hasAdminAccess = (req) => req.isAdmin === true || req.usuarioRole === 'admin';

export const rbacController = {
    // --- GRUPOS ---
    listGrupos: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem gerenciar grupos de permissões.' });
            }
            const grupos = await rbacModel.listGrupos();
            return res.status(200).json(grupos);
        } catch (error) {
            console.error(`Erro ao listar grupos RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    createGrupo: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem criar grupos de permissões.' });
            }

            const { nome, descricao, politicaIds } = req.body;

            if (!nome || typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 64) {
                return res.status(400).json({ mensagem: 'Nome do grupo inválido (deve ter entre 2 e 64 caracteres).' });
            }

            if (descricao !== undefined && descricao !== null && (typeof descricao !== 'string' || descricao.trim().length > 255)) {
                return res.status(400).json({ mensagem: 'Descrição inválida (máximo 255 caracteres).' });
            }

            const existente = await rbacModel.findGrupoByNome(nome.trim());
            if (existente) {
                return res.status(409).json({ mensagem: 'Já existe um grupo cadastrado com este nome.' });
            }

            const novoGrupo = await rbacModel.createGrupo({
                nome: nome.trim(),
                descricao: descricao ? descricao.trim() : null,
                politicaIds: Array.isArray(politicaIds) ? politicaIds : []
            });

            return res.status(201).json({
                mensagem: 'Grupo de permissões criado com sucesso!',
                grupo: novoGrupo
            });
        } catch (error) {
            console.error(`Erro ao criar grupo RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    updateGrupo: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem editar grupos de permissões.' });
            }

            const { id } = req.params;
            const parsedId = Number(id);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID do grupo inválido.' });
            }

            const grupoAtual = await rbacModel.findGrupoById(parsedId);
            if (!grupoAtual) {
                return res.status(404).json({ mensagem: 'Grupo de permissões não encontrado.' });
            }

            const { nome, descricao, politicaIds } = req.body;
            const nomeFinal = nome !== undefined ? String(nome).trim() : grupoAtual.nome;

            if (!nomeFinal || nomeFinal.length < 2 || nomeFinal.length > 64) {
                return res.status(400).json({ mensagem: 'Nome do grupo inválido (deve ter entre 2 e 64 caracteres).' });
            }

            if (descricao !== undefined && descricao !== null && (typeof descricao !== 'string' || descricao.trim().length > 255)) {
                return res.status(400).json({ mensagem: 'Descrição inválida (máximo 255 caracteres).' });
            }

            const isGrupoPadraoAdmin = String(grupoAtual.nome).trim().toLowerCase() === 'administrador';
            if (isGrupoPadraoAdmin && nomeFinal.toLowerCase() !== 'administrador') {
                return res.status(400).json({ mensagem: 'O nome do grupo padrão "Administrador" não pode ser alterado.' });
            }

            const conflitoNome = await rbacModel.findGrupoByNome(nomeFinal);
            if (conflitoNome && conflitoNome.id !== parsedId) {
                return res.status(409).json({ mensagem: 'Já existe outro grupo cadastrado com este nome.' });
            }

            let idsPoliticasFinal = Array.isArray(politicaIds) ? [...politicaIds] : null;
            if (isGrupoPadraoAdmin && Array.isArray(idsPoliticasFinal)) {
                const polManageAcl = await rbacModel.findPoliticaByChave('manage_acl');
                if (polManageAcl && !idsPoliticasFinal.map(Number).includes(polManageAcl.id)) {
                    idsPoliticasFinal.push(polManageAcl.id);
                }
            }

            const grupoAtualizado = await rbacModel.updateGrupo(parsedId, {
                nome: isGrupoPadraoAdmin ? 'Administrador' : nomeFinal,
                descricao: descricao !== undefined ? (descricao ? descricao.trim() : null) : grupoAtual.descricao,
                politicaIds: idsPoliticasFinal
            });

            return res.status(200).json({
                mensagem: 'Grupo de permissões atualizado com sucesso!',
                grupo: grupoAtualizado
            });
        } catch (error) {
            console.error(`Erro ao atualizar grupo RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    updateGrupoPoliticas: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem vincular políticas aos grupos.' });
            }

            const { id } = req.params;
            const parsedId = Number(id);
            const { politicaIds } = req.body;

            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID do grupo inválido.' });
            }

            if (!Array.isArray(politicaIds)) {
                return res.status(400).json({ mensagem: 'Informe uma lista válida de IDs de políticas.' });
            }

            const grupoAtual = await rbacModel.findGrupoById(parsedId);
            if (!grupoAtual) {
                return res.status(404).json({ mensagem: 'Grupo de permissões não encontrado.' });
            }

            const idsPoliticasFinal = [...politicaIds];
            if (String(grupoAtual.nome).trim().toLowerCase() === 'administrador') {
                const polManageAcl = await rbacModel.findPoliticaByChave('manage_acl');
                if (polManageAcl && !idsPoliticasFinal.map(Number).includes(polManageAcl.id)) {
                    idsPoliticasFinal.push(polManageAcl.id);
                }
            }

            const grupoAtualizado = await rbacModel.setGrupoPoliticas(parsedId, idsPoliticasFinal);
            return res.status(200).json({
                mensagem: 'Políticas do grupo atualizadas com sucesso!',
                grupo: grupoAtualizado
            });
        } catch (error) {
            console.error(`Erro ao vincular políticas ao grupo: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    deleteGrupo: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem excluir grupos de permissões.' });
            }

            const { id } = req.params;
            const parsedId = Number(id);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID do grupo inválido.' });
            }

            const grupo = await rbacModel.findGrupoById(parsedId);
            if (!grupo) {
                return res.status(404).json({ mensagem: 'Grupo de permissões não encontrado.' });
            }

            if (String(grupo.nome).trim().toLowerCase() === 'administrador') {
                return res.status(400).json({ mensagem: 'O grupo padrão "Administrador" não pode ser excluído.' });
            }

            const totalUsuarios = await rbacModel.countUsuariosByGrupo(parsedId);
            if (totalUsuarios > 0) {
                return res.status(400).json({
                    mensagem: `Não é possível excluir o grupo "${grupo.nome}" pois há ${totalUsuarios} usuário(s) vinculado(s) a ele.`
                });
            }

            await rbacModel.deleteGrupo(parsedId);
            return res.status(200).json({ mensagem: 'Grupo de permissões excluído com sucesso!' });
        } catch (error) {
            console.error(`Erro ao excluir grupo RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    // --- POLÍTICAS ---
    listPoliticas: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem listar políticas de acesso.' });
            }
            const politicas = await rbacModel.listPoliticas();
            return res.status(200).json(politicas);
        } catch (error) {
            console.error(`Erro ao listar políticas RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    createPolitica: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem criar políticas de acesso.' });
            }

            const { chave, nome, descricao } = req.body;

            if (!chave || typeof chave !== 'string' || !/^[a-zA-Z0-9_.-]{2,64}$/.test(chave.trim())) {
                return res.status(400).json({
                    mensagem: 'Chave da política inválida (use de 2 a 64 caracteres: letras, números, "_", "." ou "-").'
                });
            }

            if (!nome || typeof nome !== 'string' || nome.trim().length < 2 || nome.trim().length > 64) {
                return res.status(400).json({ mensagem: 'Nome da política inválido (entre 2 e 64 caracteres).' });
            }

            if (descricao !== undefined && descricao !== null && (typeof descricao !== 'string' || descricao.trim().length > 255)) {
                return res.status(400).json({ mensagem: 'Descrição inválida (máximo 255 caracteres).' });
            }

            const chaveNormalizada = chave.trim().toLowerCase();
            const existente = await rbacModel.findPoliticaByChave(chaveNormalizada);
            if (existente) {
                return res.status(409).json({ mensagem: 'Já existe uma política cadastrada com esta chave.' });
            }

            const novaPolitica = await rbacModel.createPolitica({
                chave: chaveNormalizada,
                nome: nome.trim(),
                descricao: descricao ? descricao.trim() : null
            });

            return res.status(201).json({
                mensagem: 'Política de acesso criada com sucesso!',
                politica: {
                    id: novaPolitica.insertId,
                    chave: novaPolitica.chave,
                    nome: novaPolitica.nome,
                    descricao: novaPolitica.descricao
                }
            });
        } catch (error) {
            console.error(`Erro ao criar política RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    updatePolitica: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem editar políticas de acesso.' });
            }

            const { id } = req.params;
            const parsedId = Number(id);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID da política inválido.' });
            }

            const politicaAtual = await rbacModel.findPoliticaById(parsedId);
            if (!politicaAtual) {
                return res.status(404).json({ mensagem: 'Política de acesso não encontrada.' });
            }

            const { chave, nome, descricao } = req.body;
            const chaveFinal = chave !== undefined ? String(chave).trim().toLowerCase() : politicaAtual.chave;
            const nomeFinal = nome !== undefined ? String(nome).trim() : politicaAtual.nome;

            if (politicaAtual.chave === 'manage_acl' && chaveFinal !== 'manage_acl') {
                return res.status(400).json({ mensagem: 'A chave da política "manage_acl" não pode ser alterada.' });
            }

            if (!/^[a-zA-Z0-9_.-]{2,64}$/.test(chaveFinal)) {
                return res.status(400).json({
                    mensagem: 'Chave da política inválida (use de 2 a 64 caracteres: letras, números, "_", "." ou "-").'
                });
            }

            if (!nomeFinal || nomeFinal.length < 2 || nomeFinal.length > 64) {
                return res.status(400).json({ mensagem: 'Nome da política inválido (entre 2 e 64 caracteres).' });
            }

            const conflito = await rbacModel.findPoliticaByChave(chaveFinal);
            if (conflito && conflito.id !== parsedId) {
                return res.status(409).json({ mensagem: 'Já existe outra política cadastrada com esta chave.' });
            }

            await rbacModel.updatePolitica(parsedId, {
                chave: chaveFinal,
                nome: nomeFinal,
                descricao: descricao !== undefined ? (descricao ? String(descricao).trim() : null) : politicaAtual.descricao
            });

            return res.status(200).json({
                mensagem: 'Política de acesso atualizada com sucesso!',
                politica: await rbacModel.findPoliticaById(parsedId)
            });
        } catch (error) {
            console.error(`Erro ao atualizar política RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    },

    deletePolitica: async (req, res) => {
        try {
            if (!hasAdminAccess(req)) {
                return res.status(403).json({ mensagem: 'Apenas administradores podem excluir políticas de acesso.' });
            }

            const { id } = req.params;
            const parsedId = Number(id);
            if (!Number.isInteger(parsedId) || parsedId <= 0) {
                return res.status(400).json({ mensagem: 'ID da política inválido.' });
            }

            const politica = await rbacModel.findPoliticaById(parsedId);
            if (!politica) {
                return res.status(404).json({ mensagem: 'Política de acesso não encontrada.' });
            }

            if (politica.chave === 'manage_acl') {
                return res.status(400).json({
                    mensagem: 'A política essencial "manage_acl" não pode ser excluída do sistema.'
                });
            }

            await rbacModel.deletePolitica(parsedId);
            return res.status(200).json({ mensagem: 'Política de acesso excluída com sucesso!' });
        } catch (error) {
            console.error(`Erro ao excluir política RBAC: ${error}`);
            return res.status(500).json({ mensagem: 'Erro interno no servidor.' });
        }
    }
};

export default rbacController;
