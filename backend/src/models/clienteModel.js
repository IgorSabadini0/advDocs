import { db } from '../config/db.js';
import { detectarTribunalCNJ } from '../utils/cnjParser.js';

const STATUS_VALIDOS = new Set(['Ativo', 'Aguardando Documentos', 'Suspenso', 'Arquivado', 'Parado']);

const limparTextoOpcional = (valor) => {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    return texto !== '' ? texto : null;
};

const formatarProcessoCNJ = (digitos) => {
    const d = String(digitos || '').replace(/\D/g, '');
    if (d.length !== 20) return null;
    return `${d.slice(0, 7)}-${d.slice(7, 9)}.${d.slice(9, 13)}.${d.slice(13, 14)}.${d.slice(14, 16)}.${d.slice(16, 20)}`;
};

const normalizarRegistroSaida = (row) => {
    if (!row) return null;
    return {
        ...row,
        numero_processo: row.numeroProc || null,
        status_pasta: row.status || 'Ativo',
        observacoes: row.descricao || null,
        movimentacoes_nao_lidas: Number(row.movimentacoes_nao_lidas || 0)
    };
};

const resolverDadosCliente = async (dados, conn = db) => {
    const acaoLimpa = String(dados.acao || '').trim();
    const nomeLimpo = String(dados.nome || '').trim();
    const cpfCnpjLimpo = limparTextoOpcional(dados.cpf_cnpj);
    const telefoneLimpo = limparTextoOpcional(dados.telefone);
    const emailRaw = limparTextoOpcional(dados.email);
    const emailLimpo = emailRaw ? emailRaw.toLowerCase() : null;

    let tipoLimpo = limparTextoOpcional(dados.tipo) || '';
    let tipoProcessoId = (dados.tipo_processo_id !== undefined && dados.tipo_processo_id !== null && String(dados.tipo_processo_id).trim() !== '')
        ? Number(dados.tipo_processo_id)
        : null;

    if (tipoProcessoId && Number.isInteger(tipoProcessoId) && tipoProcessoId > 0) {
        const [rows] = await conn.query("SELECT id, nome FROM tipos_processo WHERE id = ? LIMIT 1", [tipoProcessoId]);
        if (rows[0]) {
            if (!tipoLimpo) tipoLimpo = rows[0].nome;
        } else {
            tipoProcessoId = null;
        }
    } else if (tipoLimpo) {
        const [rows] = await conn.query("SELECT id, nome FROM tipos_processo WHERE LOWER(TRIM(nome)) = LOWER(TRIM(?)) LIMIT 1", [tipoLimpo]);
        if (rows[0]) {
            tipoProcessoId = rows[0].id;
        }
    }

    const procLimpo = limparTextoOpcional(dados.numero_processo ?? dados.numeroProc);
    let tribunalLimpo = limparTextoOpcional(dados.tribunal);
    if (tribunalLimpo) {
        tribunalLimpo = tribunalLimpo.toUpperCase();
    } else if (procLimpo) {
        tribunalLimpo = detectarTribunalCNJ(procLimpo);
    }

    const comarcaVaraLimpa = limparTextoOpcional(dados.comarca_vara);
    const parteContrariaLimpa = limparTextoOpcional(dados.parte_contraria);
    const statusCandidate = String(dados.status_pasta ?? dados.status ?? 'Ativo').trim();
    const statusLimpo = STATUS_VALIDOS.has(statusCandidate) ? statusCandidate : 'Ativo';
    const descLimpa = limparTextoOpcional(dados.observacoes ?? dados.descricao);
    const datajudStatusLimpo = limparTextoOpcional(dados.datajud_status);
    const datajudMensagemLimpa = limparTextoOpcional(dados.datajud_mensagem);

    return {
        acaoLimpa,
        nomeLimpo,
        cpfCnpjLimpo,
        telefoneLimpo,
        emailLimpo,
        numeroPasta: Number(dados.numeroPasta),
        tipoLimpo,
        tipoProcessoId,
        procLimpo,
        tribunalLimpo,
        comarcaVaraLimpa,
        parteContrariaLimpa,
        statusLimpo,
        descLimpa,
        datajudStatusLimpo,
        datajudMensagemLimpa
    };
};

const clienteModel = {
    list: async () => {
        const query = `
            SELECT c.id, c.acao, c.nome, c.cpf_cnpj, c.telefone, c.email,
                   c.numeroPasta, c.tipo, c.tipo_processo_id, tp.nome AS tipo_processo_nome,
                   c.numeroProc, c.tribunal, c.comarca_vara, c.parte_contraria,
                   c.status, c.descricao,
                   c.datajud_status, c.datajud_mensagem, c.classe_processual,
                   c.assunto_principal, c.orgao_julgador, c.data_ajuizamento,
                   c.datajud_atualizado_em,
                   p.id AS processo_sync_id,
                   p.status_sincronizacao,
                   p.ultima_sincronizacao_em,
                   COALESCE((
                       SELECT COUNT(*)
                       FROM processo_movimentacoes pm
                       WHERE pm.processo_id = p.id AND pm.lido_pelo_advogado = FALSE
                   ), 0) AS movimentacoes_nao_lidas
            FROM clientes c
            LEFT JOIN tipos_processo tp ON tp.id = c.tipo_processo_id
            LEFT JOIN processos p ON p.escritorio_id = 1
                AND (p.numero_cnj_formatado = c.numeroProc OR p.numero_cnj = c.numeroProc)
            ORDER BY c.numeroPasta ASC
        `;
        const [dados] = await db.query(query);
        return dados.map(normalizarRegistroSaida);
    },

    findById: async (id) => {
        const query = `
            SELECT c.*, tp.nome AS tipo_processo_nome,
                   p.id AS processo_sync_id,
                   p.status_sincronizacao,
                   p.ultima_sincronizacao_em,
                   COALESCE((
                       SELECT COUNT(*)
                       FROM processo_movimentacoes pm
                       WHERE pm.processo_id = p.id AND pm.lido_pelo_advogado = FALSE
                   ), 0) AS movimentacoes_nao_lidas
            FROM clientes c
            LEFT JOIN tipos_processo tp ON tp.id = c.tipo_processo_id
            LEFT JOIN processos p ON p.escritorio_id = 1
                AND (p.numero_cnj_formatado = c.numeroProc OR p.numero_cnj = c.numeroProc)
            WHERE c.id = ?
            LIMIT 1
        `;
        const [registro] = await db.query(query, [id]);
        return normalizarRegistroSaida(registro[0] || null);
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

        const candidatos = [...new Set([
            String(numeroProc || '').trim(),
            formatarProcessoCNJ(numeroLimpo),
            numeroLimpo
        ].filter(Boolean))];

        const query = `
            SELECT c.*, tp.nome AS tipo_processo_nome
            FROM clientes c
            LEFT JOIN tipos_processo tp ON tp.id = c.tipo_processo_id
            WHERE c.numeroProc IN (?)
            LIMIT 1
        `;
        const [registro] = await db.query(query, [candidatos]);
        return normalizarRegistroSaida(registro[0] || null);
    },

    verificarExistencia: async (numeroProc, numeroPasta, idIgnorar = null, conn = db, lockForUpdate = false) => {
        const procLimpo = String(numeroProc || '').replace(/\D/g, '');
        const candidatos = procLimpo
            ? [...new Set([
                String(numeroProc || '').trim(),
                formatarProcessoCNJ(procLimpo),
                procLimpo
            ].filter(Boolean))]
            : [];

        const condicoes = ['numeroPasta = ?'];
        const params = [Number(numeroPasta)];

        if (candidatos.length > 0) {
            condicoes.unshift('numeroProc IN (?)');
            params.unshift(candidatos);
        }

        let query = `
            SELECT id, numeroProc, numeroPasta
            FROM clientes
            WHERE (${condicoes.join(' OR ')})
        `;

        if (idIgnorar) {
            query += " AND id != ?";
            params.push(Number(idIgnorar));
        }

        query += lockForUpdate ? " LIMIT 1 FOR UPDATE" : " LIMIT 1";

        const [registro] = await conn.query(query, params);
        return registro[0] || null;
    },

    create: async (dados, conn = db) => {
        const parsed = await resolverDadosCliente(dados, conn);

        const query = `
            INSERT INTO clientes (
                acao, nome, cpf_cnpj, telefone, email,
                numeroPasta, tipo, tipo_processo_id,
                numeroProc, tribunal, comarca_vara, parte_contraria,
                status, descricao, datajud_status, datajud_mensagem, datajud_atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'pendente' THEN NOW() ELSE NULL END)
        `;
        const [resultado] = await conn.query(query, [
            parsed.acaoLimpa,
            parsed.nomeLimpo,
            parsed.cpfCnpjLimpo,
            parsed.telefoneLimpo,
            parsed.emailLimpo,
            parsed.numeroPasta,
            parsed.tipoLimpo,
            parsed.tipoProcessoId,
            parsed.procLimpo,
            parsed.tribunalLimpo,
            parsed.comarcaVaraLimpa,
            parsed.parteContrariaLimpa,
            parsed.statusLimpo,
            parsed.descLimpa,
            parsed.datajudStatusLimpo,
            parsed.datajudMensagemLimpa,
            parsed.datajudStatusLimpo
        ]);
        return resultado;
    },

    createWithCheck: async (dados) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const numeroProc = dados.numero_processo ?? dados.numeroProc;
            const conflito = await clienteModel.verificarExistencia(numeroProc, dados.numeroPasta, null, conn, true);
            if (conflito) {
                await conn.rollback();
                const procLimpoReq = String(numeroProc || '').replace(/\D/g, '');
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
        const parsed = await resolverDadosCliente(dados, conn);

        const query = `
            UPDATE clientes 
            SET acao = ?, nome = ?, cpf_cnpj = ?, telefone = ?, email = ?,
                numeroPasta = ?, tipo = ?, tipo_processo_id = ?,
                numeroProc = ?, tribunal = ?, comarca_vara = ?, parte_contraria = ?,
                status = ?, descricao = ?,
                datajud_status = ?, datajud_mensagem = ?,
                datajud_atualizado_em = CASE WHEN ? = 'pendente' THEN NOW() ELSE datajud_atualizado_em END
            WHERE id = ?
        `;
        const [resultado] = await conn.query(query, [
            parsed.acaoLimpa,
            parsed.nomeLimpo,
            parsed.cpfCnpjLimpo,
            parsed.telefoneLimpo,
            parsed.emailLimpo,
            parsed.numeroPasta,
            parsed.tipoLimpo,
            parsed.tipoProcessoId,
            parsed.procLimpo,
            parsed.tribunalLimpo,
            parsed.comarcaVaraLimpa,
            parsed.parteContrariaLimpa,
            parsed.statusLimpo,
            parsed.descLimpa,
            parsed.datajudStatusLimpo,
            parsed.datajudMensagemLimpa,
            parsed.datajudStatusLimpo,
            Number(id)
        ]);
        return resultado;
    },

    updateWithCheck: async (id, dados) => {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const [rows] = await conn.query("SELECT * FROM clientes WHERE id = ? LIMIT 1 FOR UPDATE", [id]);
            if (rows.length === 0) {
                await conn.rollback();
                return { naoEncontrado: true };
            }

            const registroAtual = rows[0];
            const numeroProc = dados.numero_processo ?? dados.numeroProc;
            const conflito = await clienteModel.verificarExistencia(numeroProc, dados.numeroPasta, id, conn, true);
            if (conflito) {
                await conn.rollback();
                const procLimpoReq = String(numeroProc || '').replace(/\D/g, '');
                const procLimpoDb = String(conflito.numeroProc || '').replace(/\D/g, '');
                const campoConflito = (procLimpoReq && procLimpoDb === procLimpoReq) ? 'numeroProc' : 'numeroPasta';
                return { conflito: true, campoConflito };
            }

            const procMudou = String(numeroProc || '').replace(/\D/g, '') !== String(registroAtual.numeroProc || '').replace(/\D/g, '');
            const dadosMesclados = {
                ...dados,
                cpf_cnpj: dados.cpf_cnpj !== undefined ? dados.cpf_cnpj : registroAtual.cpf_cnpj,
                telefone: dados.telefone !== undefined ? dados.telefone : registroAtual.telefone,
                email: dados.email !== undefined ? dados.email : registroAtual.email,
                tribunal: dados.tribunal !== undefined ? dados.tribunal : (procMudou ? null : registroAtual.tribunal),
                comarca_vara: dados.comarca_vara !== undefined ? dados.comarca_vara : registroAtual.comarca_vara,
                parte_contraria: dados.parte_contraria !== undefined ? dados.parte_contraria : registroAtual.parte_contraria,
                datajud_status: dados.datajud_status !== undefined ? dados.datajud_status : registroAtual.datajud_status,
                datajud_mensagem: dados.datajud_mensagem !== undefined ? dados.datajud_mensagem : registroAtual.datajud_mensagem
            };

            await clienteModel.update(id, dadosMesclados, conn);
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

    atualizarStatusDatajud: async (id, { status, mensagem = null, dadosProcesso = null }) => {
        const [rows] = await db.query("SELECT * FROM clientes WHERE id = ? LIMIT 1", [Number(id)]);
        const atual = rows[0];
        if (!atual) return null;

        if (dadosProcesso && status === 'concluido') {
            const classe = limparTextoOpcional(dadosProcesso.classe)?.slice(0, 128) || null;
            const assuntoPrincipal = Array.isArray(dadosProcesso.assuntos) && dadosProcesso.assuntos.length > 0
                ? dadosProcesso.assuntos.join(', ').slice(0, 255)
                : null;
            const orgaoJulgador = limparTextoOpcional(dadosProcesso.orgaoJulgador)?.slice(0, 128) || null;
            const dataAjuizamento = limparTextoOpcional(dadosProcesso.dataAjuizamento)?.slice(0, 32) || null;

            const novoTribunal = (!atual.tribunal && dadosProcesso.tribunal)
                ? String(dadosProcesso.tribunal).trim().toUpperCase().slice(0, 20)
                : atual.tribunal;

            const novaComarca = (!atual.comarca_vara && orgaoJulgador && orgaoJulgador !== 'Não informado')
                ? orgaoJulgador.slice(0, 100)
                : atual.comarca_vara;

            let novaDescricao = atual.descricao;
            if (!novaDescricao || String(novaDescricao).trim() === '') {
                const ultimoMov = dadosProcesso.ultimaMovimentacao
                    ? ` | Última mov.: ${dadosProcesso.ultimaMovimentacao.nome}`
                    : '';
                novaDescricao = `[DataJud ${dadosProcesso.tribunal}] Classe: ${dadosProcesso.classe} | Órgão: ${dadosProcesso.orgaoJulgador}${ultimoMov}`;
            }

            await db.query(`
                UPDATE clientes
                SET datajud_status = ?,
                    datajud_mensagem = ?,
                    classe_processual = ?,
                    assunto_principal = ?,
                    orgao_julgador = ?,
                    data_ajuizamento = ?,
                    datajud_payload = ?,
                    datajud_atualizado_em = NOW(),
                    tribunal = ?,
                    comarca_vara = ?,
                    descricao = ?
                WHERE id = ?
            `, [
                status,
                limparTextoOpcional(mensagem)?.slice(0, 255) || null,
                classe,
                assuntoPrincipal,
                orgaoJulgador,
                dataAjuizamento,
                JSON.stringify(dadosProcesso),
                novoTribunal,
                novaComarca,
                novaDescricao,
                Number(id)
            ]);
        } else {
            await db.query(`
                UPDATE clientes
                SET datajud_status = ?,
                    datajud_mensagem = ?,
                    datajud_atualizado_em = NOW()
                WHERE id = ?
            `, [
                status,
                limparTextoOpcional(mensagem)?.slice(0, 255) || null,
                Number(id)
            ]);
        }

        return clienteModel.findById(id);
    },

    delete: async (id) => {
        const query = "DELETE FROM clientes WHERE id = ?";
        const [resultado] = await db.query(query, [id]);
        return resultado;
    }
};

export { clienteModel };
export default clienteModel;
