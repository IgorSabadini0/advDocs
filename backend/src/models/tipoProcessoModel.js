import { db } from '../config/db.js';

export const ICONE_PADRAO_TIPO = 'fa-solid fa-folder';

const PREFIXOS_EXCLUSIVOS = new Set(['fa-solid', 'fa-regular', 'fa-brands']);

/**
 * Valida e normaliza a classe FontAwesome informada para um Tipo de Processo.
 * Bloqueia qualquer tentativa de injeção de HTML/scripts ou classes inválidas.
 */
export const validarENormalizarIconeTipo = (icone) => {
    if (icone === undefined || icone === null || String(icone).trim() === '') {
        return { valido: true, icone: ICONE_PADRAO_TIPO };
    }

    if (typeof icone !== 'string') {
        return { valido: false, icone: null };
    }

    const limpo = icone.trim().replace(/\s+/g, ' ');
    if (limpo.length > 100) {
        return { valido: false, icone: null };
    }

    // Normaliza formato curto (ex: "fa-gavel" -> "fa-solid fa-gavel")
    if (/^fa-[a-z0-9-]+$/.test(limpo) && !PREFIXOS_EXCLUSIVOS.has(limpo)) {
        return { valido: true, icone: `fa-solid ${limpo}` };
    }

    if (!/^fa-(?:solid|regular|brands)\s+fa-[a-z0-9-]+$/.test(limpo)) {
        return { valido: false, icone: null };
    }

    const segundaParte = limpo.split(' ')[1];
    if (!segundaParte || PREFIXOS_EXCLUSIVOS.has(segundaParte)) {
        return { valido: false, icone: null };
    }

    return { valido: true, icone: limpo };
};

const tipoProcessoModel = {
    list: async () => {
        const query = `
            SELECT id, nome, COALESCE(NULLIF(TRIM(icone), ''), ?) AS icone, created_at
            FROM tipos_processo
            ORDER BY nome ASC
        `;
        const [dados] = await db.query(query, [ICONE_PADRAO_TIPO]);
        return dados;
    },

    findById: async (id) => {
        const query = `
            SELECT id, nome, COALESCE(NULLIF(TRIM(icone), ''), ?) AS icone, created_at
            FROM tipos_processo
            WHERE id = ?
            LIMIT 1
        `;
        const [rows] = await db.query(query, [ICONE_PADRAO_TIPO, id]);
        return rows[0] || null;
    },

    findByName: async (nome) => {
        const query = `
            SELECT id, nome, COALESCE(NULLIF(TRIM(icone), ''), ?) AS icone
            FROM tipos_processo
            WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?))
            LIMIT 1
        `;
        const [rows] = await db.query(query, [ICONE_PADRAO_TIPO, nome]);
        return rows[0] || null;
    },

    contarUsoEmClientes: async (nome) => {
        const query = "SELECT COUNT(*) as total FROM clientes WHERE LOWER(TRIM(tipo)) = LOWER(TRIM(?))";
        const [rows] = await db.query(query, [nome]);
        return rows[0]?.total || 0;
    },

    create: async (nome, icone = ICONE_PADRAO_TIPO) => {
        const { valido, icone: iconeSeguro } = validarENormalizarIconeTipo(icone);
        const classeFinal = valido ? iconeSeguro : ICONE_PADRAO_TIPO;
        const query = "INSERT INTO tipos_processo (nome, icone) VALUES (?, ?)";
        const [resultado] = await db.query(query, [nome.trim(), classeFinal]);
        return resultado;
    },

    update: async (id, { nome, icone }) => {
        const { valido, icone: iconeSeguro } = validarENormalizarIconeTipo(icone);
        const classeFinal = valido ? iconeSeguro : ICONE_PADRAO_TIPO;
        const nomeLimpo = String(nome || '').trim();

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [resultado] = await conn.query(
                "UPDATE tipos_processo SET nome = ?, icone = ? WHERE id = ?",
                [nomeLimpo, classeFinal, id]
            );

            // Mantém o campo textual `clientes.tipo` sincronizado para pastas vinculadas
            await conn.query(
                "UPDATE clientes SET tipo = ? WHERE tipo_processo_id = ?",
                [nomeLimpo, id]
            );

            await conn.commit();
            return resultado;
        } catch (error) {
            await conn.rollback();
            throw error;
        } finally {
            conn.release();
        }
    },

    delete: async (id) => {
        const query = "DELETE FROM tipos_processo WHERE id = ?";
        const [resultado] = await db.query(query, [id]);
        return resultado;
    }
};

export { tipoProcessoModel };
export default tipoProcessoModel;
