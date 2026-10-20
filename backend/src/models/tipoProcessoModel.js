import { db } from '../config/db.js';

const tipoProcessoModel = {
    list: async () => {
        const query = "SELECT id, nome, created_at FROM tipos_processo ORDER BY nome ASC";
        const [dados] = await db.query(query);
        return dados;
    },

    findById: async (id) => {
        const query = "SELECT id, nome FROM tipos_processo WHERE id = ? LIMIT 1";
        const [rows] = await db.query(query, [id]);
        return rows[0] || null;
    },

    findByName: async (nome) => {
        const query = "SELECT id, nome FROM tipos_processo WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)) LIMIT 1";
        const [rows] = await db.query(query, [nome]);
        return rows[0] || null;
    },

    contarUsoEmClientes: async (nome) => {
        const query = "SELECT COUNT(*) as total FROM clientes WHERE LOWER(TRIM(tipo)) = LOWER(TRIM(?))";
        const [rows] = await db.query(query, [nome]);
        return rows[0]?.total || 0;
    },

    create: async (nome) => {
        const query = "INSERT INTO tipos_processo (nome) VALUES (?)";
        const [resultado] = await db.query(query, [nome.trim()]);
        return resultado;
    },

    delete: async (id) => {
        const query = "DELETE FROM tipos_processo WHERE id = ?";
        const [resultado] = await db.query(query, [id]);
        return resultado;
    }
};

export { tipoProcessoModel };
export default tipoProcessoModel;
