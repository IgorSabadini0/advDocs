import { db } from '../config/db.js';

const clienteModel = {
    list: async () => {
        const query = "SELECT * FROM clientes ORDER BY numeroPasta ASC";
        const [dados] = await db.query(query);
        return dados;
    },
    findById: async (id) => {
        const query = "SELECT * FROM clientes WHERE id = ? LIMIT 1";
        const [registro] = await db.query(query, [id]);
        return registro[0] || null;
    },
    getMenorPastaDisponivel: async () => {
        const query = "SELECT numeroPasta FROM clientes WHERE numeroPasta > 0 ORDER BY numeroPasta ASC";
        const [rows] = await db.query(query);
        let menorDisponivel = 1;

        for (const row of rows) {
            const num = Number(row.numeroPasta);
            if (num === menorDisponivel) {
                menorDisponivel++;
            } else if (num > menorDisponivel) {
                break;
            }
        }

        return menorDisponivel;
    },
    findByNumeroProc: async (numeroProc) => {
        const numeroLimpo = String(numeroProc || '').replace(/\D/g, '');
        if (!numeroLimpo) return null;

        const query = `
            SELECT * FROM clientes 
            WHERE numeroProc = ? 
               OR REPLACE(REPLACE(REPLACE(numeroProc, '-', ''), '.', ''), ' ', '') = ?
            LIMIT 1
        `;
        const [registro] = await db.query(query, [numeroProc, numeroLimpo]);
        return registro[0] || null;
    },
    verificarExistencia: async (numeroProc, numeroPasta, idIgnorar = null) => {
        let query = "SELECT id, numeroProc, numeroPasta FROM clientes WHERE ((numeroProc = ? AND numeroProc IS NOT NULL AND numeroProc != '') OR numeroPasta = ?)";
        const params = [numeroProc, Number(numeroPasta)];

        if (idIgnorar) {
            query += " AND id != ?";
            params.push(Number(idIgnorar));
        }

        query += " LIMIT 1";

        const [registro] = await db.query(query, params);
        return registro[0] || null;
    },
    create: async (dados) => {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = dados;
        const query = "INSERT INTO clientes (acao, nome, numeroPasta, tipo, numeroProc, status, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const [resultado] = await db.query(query, [acao, nome, Number(numeroPasta), tipo, numeroProc, status, descricao]);
        return resultado;
    },
    update: async (id, dados) => {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = dados;
        const query = `
            UPDATE clientes 
            SET acao = ?, nome = ?, numeroPasta = ?, tipo = ?, numeroProc = ?, status = ?, descricao = ? 
            WHERE id = ?
        `;
        const [resultado] = await db.query(query, [acao, nome, Number(numeroPasta), tipo, numeroProc, status, descricao, id]);
        return resultado;
    },
    delete: async (id) => {
        const query = "DELETE FROM clientes WHERE id = ?";
        const [resultado] = await db.query(query, [id]);
        return resultado;
    }
};

export { clienteModel };
export default clienteModel;
