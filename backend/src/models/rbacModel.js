import { db } from '../config/db.js';

const vincularPoliticasEmLote = async (conn, grupoId, politicaIds = []) => {
    const idsUnicos = [...new Set(
        (Array.isArray(politicaIds) ? politicaIds : [])
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0)
    )];

    if (idsUnicos.length === 0) return;

    const [politicasValidas] = await conn.query(
        "SELECT id FROM politicas WHERE id IN (?)",
        [idsUnicos]
    );

    if (politicasValidas.length === 0) return;

    const valores = politicasValidas.map(pol => [Number(grupoId), pol.id]);
    await conn.query(
        "INSERT IGNORE INTO grupo_politicas (grupo_id, politica_id) VALUES ?",
        [valores]
    );
};

export const rbacModel = {
    // --- POLÍTICAS ---
    listPoliticas: async () => {
        const query = `
            SELECT p.id, p.chave, p.nome, p.descricao, p.created_at,
                   COUNT(DISTINCT gp.grupo_id) AS total_grupos
            FROM politicas p
            LEFT JOIN grupo_politicas gp ON gp.politica_id = p.id
            GROUP BY p.id
            ORDER BY p.nome ASC
        `;
        const [rows] = await db.query(query);
        return rows.map(r => ({
            ...r,
            total_grupos: Number(r.total_grupos || 0)
        }));
    },

    findPoliticaById: async (id) => {
        const query = "SELECT id, chave, nome, descricao, created_at FROM politicas WHERE id = ? LIMIT 1";
        const [rows] = await db.query(query, [id]);
        return rows[0] || null;
    },

    findPoliticaByChave: async (chave) => {
        const query = "SELECT id, chave, nome, descricao FROM politicas WHERE LOWER(TRIM(chave)) = LOWER(TRIM(?)) LIMIT 1";
        const [rows] = await db.query(query, [chave]);
        return rows[0] || null;
    },

    createPolitica: async ({ chave, nome, descricao = null }) => {
        const chaveFormatada = String(chave).trim().toLowerCase();
        const nomeFormatado = String(nome).trim();
        const descFormatada = descricao && String(descricao).trim() !== '' ? String(descricao).trim() : null;

        const query = "INSERT INTO politicas (chave, nome, descricao) VALUES (?, ?, ?)";
        const [result] = await db.query(query, [chaveFormatada, nomeFormatado, descFormatada]);
        return {
            insertId: result.insertId,
            chave: chaveFormatada,
            nome: nomeFormatado,
            descricao: descFormatada
        };
    },

    updatePolitica: async (id, { chave, nome, descricao = null }) => {
        const chaveFormatada = String(chave).trim().toLowerCase();
        const nomeFormatado = String(nome).trim();
        const descFormatada = descricao && String(descricao).trim() !== '' ? String(descricao).trim() : null;

        const query = "UPDATE politicas SET chave = ?, nome = ?, descricao = ? WHERE id = ?";
        const [result] = await db.query(query, [chaveFormatada, nomeFormatado, descFormatada, id]);
        return result;
    },

    deletePolitica: async (id) => {
        const query = "DELETE FROM politicas WHERE id = ?";
        const [result] = await db.query(query, [id]);
        return result;
    },

    // --- GRUPOS ---
    listGrupos: async () => {
        const [gruposRows] = await db.query(`
            SELECT g.id, g.nome, g.descricao, g.created_at, g.updated_at,
                   COUNT(DISTINCT l.id) AS total_usuarios
            FROM grupos g
            LEFT JOIN login l ON l.grupo_id = g.id
            GROUP BY g.id
            ORDER BY CASE WHEN LOWER(g.nome) = 'administrador' THEN 0 ELSE 1 END, g.nome ASC
        `);

        const [vinculosRows] = await db.query(`
            SELECT gp.grupo_id, p.id, p.chave, p.nome, p.descricao
            FROM grupo_politicas gp
            INNER JOIN politicas p ON p.id = gp.politica_id
            ORDER BY p.nome ASC
        `);

        const mapaPoliticas = new Map();
        for (const v of vinculosRows) {
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

        return gruposRows.map(g => {
            const politicas = mapaPoliticas.get(g.id) || [];
            const isAdminGroup = String(g.nome || '').trim().toLowerCase() === 'administrador'
                || politicas.some(p => p.chave === 'manage_acl');

            return {
                id: g.id,
                nome: g.nome,
                descricao: g.descricao,
                total_usuarios: Number(g.total_usuarios || 0),
                is_admin_group: isAdminGroup,
                politicas,
                created_at: g.created_at,
                updated_at: g.updated_at
            };
        });
    },

    findGrupoById: async (id) => {
        const [gruposRows] = await db.query(
            "SELECT id, nome, descricao, created_at, updated_at FROM grupos WHERE id = ? LIMIT 1",
            [id]
        );
        if (gruposRows.length === 0) return null;

        const g = gruposRows[0];
        const [politicas] = await db.query(`
            SELECT p.id, p.chave, p.nome, p.descricao
            FROM grupo_politicas gp
            INNER JOIN politicas p ON p.id = gp.politica_id
            WHERE gp.grupo_id = ?
            ORDER BY p.nome ASC
        `, [id]);

        const [[contagem]] = await db.query(
            "SELECT COUNT(*) AS total FROM login WHERE grupo_id = ?",
            [id]
        );

        const isAdminGroup = String(g.nome || '').trim().toLowerCase() === 'administrador'
            || politicas.some(p => p.chave === 'manage_acl');

        return {
            id: g.id,
            nome: g.nome,
            descricao: g.descricao,
            total_usuarios: Number(contagem?.total || 0),
            is_admin_group: isAdminGroup,
            politicas,
            created_at: g.created_at,
            updated_at: g.updated_at
        };
    },

    findGrupoByNome: async (nome) => {
        const query = "SELECT id, nome, descricao FROM grupos WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)) LIMIT 1";
        const [rows] = await db.query(query, [nome]);
        return rows[0] || null;
    },

    createGrupo: async ({ nome, descricao = null, politicaIds = [] }) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const nomeFormatado = String(nome).trim();
            const descFormatada = descricao && String(descricao).trim() !== '' ? String(descricao).trim() : null;

            const [result] = await conn.query(
                "INSERT INTO grupos (nome, descricao) VALUES (?, ?)",
                [nomeFormatado, descFormatada]
            );
            const grupoId = result.insertId;

            await vincularPoliticasEmLote(conn, grupoId, politicaIds);

            await conn.commit();
            return rbacModel.findGrupoById(grupoId);
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    updateGrupo: async (id, { nome, descricao = null, politicaIds = null }) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const nomeFormatado = String(nome).trim();
            const descFormatada = descricao && String(descricao).trim() !== '' ? String(descricao).trim() : null;

            await conn.query(
                "UPDATE grupos SET nome = ?, descricao = ? WHERE id = ?",
                [nomeFormatado, descFormatada, id]
            );

            if (Array.isArray(politicaIds)) {
                await conn.query("DELETE FROM grupo_politicas WHERE grupo_id = ?", [id]);
                await vincularPoliticasEmLote(conn, id, politicaIds);
            }

            await conn.commit();
            return rbacModel.findGrupoById(id);
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    setGrupoPoliticas: async (grupoId, politicaIds = []) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            await conn.query("DELETE FROM grupo_politicas WHERE grupo_id = ?", [grupoId]);
            await vincularPoliticasEmLote(conn, grupoId, politicaIds);

            await conn.commit();
            return rbacModel.findGrupoById(grupoId);
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    countUsuariosByGrupo: async (grupoId) => {
        const [[row]] = await db.query(
            "SELECT COUNT(*) AS total FROM login WHERE grupo_id = ?",
            [grupoId]
        );
        return Number(row?.total || 0);
    },

    deleteGrupo: async (id) => {
        const [result] = await db.query("DELETE FROM grupos WHERE id = ?", [id]);
        return result;
    }
};

export default rbacModel;
