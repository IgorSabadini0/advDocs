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
        const query = `
            SELECT CASE
                WHEN NOT EXISTS (SELECT 1 FROM clientes WHERE numeroPasta = 1) THEN 1
                ELSE (
                    SELECT MIN(t1.numeroPasta) + 1
                    FROM clientes t1
                    LEFT JOIN clientes t2 ON t2.numeroPasta = t1.numeroPasta + 1
                    WHERE t1.numeroPasta > 0 AND t2.numeroPasta IS NULL
                )
            END AS menorDisponivel
        `;
        const [rows] = await db.query(query);
        return Number(rows[0]?.menorDisponivel) || 1;
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

    verificarExistencia: async (numeroProc, numeroPasta, idIgnorar = null, conn = db, lockForUpdate = false) => {
        const procLimpo = String(numeroProc || '').replace(/\D/g, '');
        let query = `
            SELECT id, numeroProc, numeroPasta
            FROM clientes
            WHERE (
                (? != '' AND REPLACE(REPLACE(REPLACE(numeroProc, '-', ''), '.', ''), ' ', '') = ?)
                OR numeroPasta = ?
            )
        `;
        const params = [procLimpo, procLimpo, Number(numeroPasta)];

        if (idIgnorar) {
            query += " AND id != ?";
            params.push(Number(idIgnorar));
        }

        query += lockForUpdate ? " LIMIT 1 FOR UPDATE" : " LIMIT 1";

        const [registro] = await conn.query(query, params);
        return registro[0] || null;
    },

    create: async (dados, conn = db) => {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = dados;
        const acaoLimpa = String(acao || '').trim();
        const nomeLimpo = String(nome || '').trim();
        const tipoLimpo = String(tipo || '').trim();
        const procLimpo = (numeroProc && String(numeroProc).trim() !== '') ? String(numeroProc).trim() : null;
        const statusLimpo = status === 'Parado' ? 'Parado' : 'Ativo';
        const descLimpa = (descricao && String(descricao).trim() !== '') ? String(descricao).trim() : null;

        const query = "INSERT INTO clientes (acao, nome, numeroPasta, tipo, numeroProc, status, descricao) VALUES (?, ?, ?, ?, ?, ?, ?)";
        const [resultado] = await conn.query(query, [acaoLimpa, nomeLimpo, Number(numeroPasta), tipoLimpo, procLimpo, statusLimpo, descLimpa]);
        return resultado;
    },

    createWithCheck: async (dados) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const conflito = await clienteModel.verificarExistencia(dados.numeroProc, dados.numeroPasta, null, conn, true);
            if (conflito) {
                await conn.rollback();
                const procLimpoReq = String(dados.numeroProc || '').replace(/\D/g, '');
                const procLimpoDb = String(conflito.numeroProc || '').replace(/\D/g, '');
                const campoConflito = (procLimpoReq && procLimpoDb === procLimpoReq) ? 'numeroProc' : 'numeroPasta';
                return { conflito: true, campoConflito };
            }

            const resultado = await clienteModel.create(dados, conn);
            await conn.commit();
            return { conflito: false, insertId: resultado.insertId };
        } catch (error) {
            await conn.rollback();
            if (error.code === 'ER_DUP_ENTRY') {
                return { conflito: true, campoConflito: 'duplicado' };
            }
            throw error;
        } finally {
            conn.release();
        }
    },

    update: async (id, dados, conn = db) => {
        const { acao, nome, numeroPasta, tipo, numeroProc, status, descricao } = dados;
        const acaoLimpa = String(acao || '').trim();
        const nomeLimpo = String(nome || '').trim();
        const tipoLimpo = String(tipo || '').trim();
        const procLimpo = (numeroProc && String(numeroProc).trim() !== '') ? String(numeroProc).trim() : null;
        const statusLimpo = status === 'Parado' ? 'Parado' : 'Ativo';
        const descLimpa = (descricao && String(descricao).trim() !== '') ? String(descricao).trim() : null;

        const query = `
            UPDATE clientes 
            SET acao = ?, nome = ?, numeroPasta = ?, tipo = ?, numeroProc = ?, status = ?, descricao = ? 
            WHERE id = ?
        `;
        const [resultado] = await conn.query(query, [acaoLimpa, nomeLimpo, Number(numeroPasta), tipoLimpo, procLimpo, statusLimpo, descLimpa, Number(id)]);
        return resultado;
    },

    updateWithCheck: async (id, dados) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [rows] = await conn.query("SELECT id FROM clientes WHERE id = ? LIMIT 1 FOR UPDATE", [id]);
            if (rows.length === 0) {
                await conn.rollback();
                return { naoEncontrado: true };
            }

            const conflito = await clienteModel.verificarExistencia(dados.numeroProc, dados.numeroPasta, id, conn, true);
            if (conflito) {
                await conn.rollback();
                const procLimpoReq = String(dados.numeroProc || '').replace(/\D/g, '');
                const procLimpoDb = String(conflito.numeroProc || '').replace(/\D/g, '');
                const campoConflito = (procLimpoReq && procLimpoDb === procLimpoReq) ? 'numeroProc' : 'numeroPasta';
                return { conflito: true, campoConflito };
            }

            await clienteModel.update(id, dados, conn);
            await conn.commit();
            return { conflito: false, naoEncontrado: false };
        } catch (error) {
            await conn.rollback();
            if (error.code === 'ER_DUP_ENTRY') {
                return { conflito: true, campoConflito: 'duplicado' };
            }
            throw error;
        } finally {
            conn.release();
        }
    },

    delete: async (id) => {
        const query = "DELETE FROM clientes WHERE id = ?";
        const [resultado] = await db.query(query, [id]);
        return resultado;
    }
};

export { clienteModel };
export default clienteModel;
