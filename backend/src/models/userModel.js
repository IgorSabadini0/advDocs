import { db } from '../config/db.js';

const enriquecerComPoliticas = async (usuarios) => {
    if (!usuarios || usuarios.length === 0) return [];

    const grupoIds = [...new Set(usuarios.map(u => u.grupo_id).filter(Boolean))];
    const mapaPoliticas = new Map();

    if (grupoIds.length > 0) {
        const [vinculos] = await db.query(`
            SELECT gp.grupo_id, p.id, p.chave, p.nome, p.descricao
            FROM grupo_politicas gp
            INNER JOIN politicas p ON p.id = gp.politica_id
            WHERE gp.grupo_id IN (?)
            ORDER BY p.nome ASC
        `, [grupoIds]);

        for (const v of vinculos) {
            if (!mapaPoliticas.has(v.grupo_id)) {
                mapaPoliticas.set(v.grupo_id, []);
            }
            mapaPoliticas.get(v.grupo_id).push({
                id: v.id,
                chave: v.chave,
                nome: v.nome,
                descricao: v.descricao
            });
        }
    }

    return usuarios.map(u => {
        const politicas = mapaPoliticas.get(u.grupo_id) || [];
        const politicasChaves = politicas.map(p => p.chave);
        const grupoNome = u.grupo_nome || null;
        const isAdmin = (grupoNome && String(grupoNome).trim().toLowerCase() === 'administrador')
            || politicasChaves.includes('manage_acl');

        return {
            ...u,
            grupo_nome: grupoNome,
            politicas,
            politicas_chaves: politicasChaves,
            is_admin: Boolean(isAdmin),
            role: isAdmin ? 'admin' : 'user'
        };
    });
};

export const userModel = {
    findByUsername: async (user) => {
        const query = `
            SELECT l.id, l.user, l.name, l.password, l.grupo_id, g.nome AS grupo_nome, l.is_active
            FROM login l
            LEFT JOIN grupos g ON g.id = l.grupo_id
            WHERE LOWER(l.user) = LOWER(?)
            LIMIT 1
        `;
        const [rows] = await db.query(query, [user]);
        if (rows.length === 0) return null;
        const [enriquecido] = await enriquecerComPoliticas(rows);
        return enriquecido;
    },

    findById: async (id) => {
        const query = `
            SELECT l.id, l.user, l.name, l.password, l.grupo_id, g.nome AS grupo_nome,
                   l.is_active, l.created_at, l.updated_at
            FROM login l
            LEFT JOIN grupos g ON g.id = l.grupo_id
            WHERE l.id = ?
            LIMIT 1
        `;
        const [rows] = await db.query(query, [id]);
        if (rows.length === 0) return null;
        const [enriquecido] = await enriquecerComPoliticas(rows);
        return enriquecido;
    },

    findAuthStatusById: async (id) => {
        const usuario = await userModel.findById(id);
        if (!usuario) return null;

        return {
            id: usuario.id,
            user: usuario.user,
            is_active: Boolean(usuario.is_active),
            grupo_id: usuario.grupo_id,
            grupo_nome: usuario.grupo_nome,
            politicas: usuario.politicas,
            politicas_chaves: usuario.politicas_chaves,
            is_admin: Boolean(usuario.is_admin),
            role: usuario.is_admin ? 'admin' : 'user'
        };
    },

    listUsers: async () => {
        const query = `
            SELECT l.id, l.user, l.name, l.grupo_id, g.nome AS grupo_nome,
                   l.is_active, l.created_at, l.updated_at
            FROM login l
            LEFT JOIN grupos g ON g.id = l.grupo_id
            ORDER BY l.name ASC
        `;
        const [rows] = await db.query(query);
        return enriquecerComPoliticas(rows);
    },

    updatePassword: async (id, hashedPassword) => {
        const query = "UPDATE login SET password = ? WHERE id = ?";
        const [result] = await db.query(query, [hashedPassword, id]);
        return result;
    },

    updateName: async (id, name) => {
        const query = "UPDATE login SET name = ? WHERE id = ?";
        const [result] = await db.query(query, [name.trim(), id]);
        return result;
    },

    updateGrupo: async (id, grupo_id) => {
        const query = "UPDATE login SET grupo_id = ? WHERE id = ?";
        const [result] = await db.query(query, [Number(grupo_id), Number(id)]);
        return result;
    },

    create: async ({ user, name, password, grupo_id, is_active = true }) => {
        const query = "INSERT INTO login (user, name, password, grupo_id, is_active) VALUES (?, ?, ?, ?, ?)";
        const [result] = await db.query(query, [
            user.trim().toLowerCase(),
            name.trim(),
            password,
            Number(grupo_id),
            is_active ? 1 : 0
        ]);
        return result;
    },

    toggleActive: async (id, is_active) => {
        const query = "UPDATE login SET is_active = ? WHERE id = ?";
        const [result] = await db.query(query, [is_active ? 1 : 0, id]);
        return result;
    },

    delete: async (id) => {
        const query = "DELETE FROM login WHERE id = ?";
        const [result] = await db.query(query, [id]);
        return result;
    }
};

export default userModel;
