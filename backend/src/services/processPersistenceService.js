import { db } from '../config/db.js';
import { parseNumeroCNJ } from '../utils/cnjParser.js';
import {
    gerarHashMovimentacao,
    gerarHashParte,
    gerarHashCapa
} from '../utils/processHashGenerator.js';

const INSTANCIAS_PROCESSO = new Set(['1G', '2G', 'AMBAS', 'SUPERIOR']);
const INSTANCIAS_ITEM = new Set(['1G', '2G', 'SUPERIOR']);
const SISTEMAS_VALIDOS = new Set(['PJE', 'ESAJ', 'EPROC', 'PROJUDI', 'DESCONHECIDO']);
const POLOS_VALIDOS = new Set(['ATIVO', 'PASSIVO', 'TERCEIRO', 'OUTRO']);
const FONTES_VALIDAS = new Set(['DATAJUD', 'MNI', 'SCRAPER', 'WEBHOOK_EXTERNO']);
const STATUS_SYNC_VALIDOS = new Set(['PENDENTE', 'SINCRONIZANDO', 'ATUALIZADO', 'ERRO', 'AGUARDANDO_CREDENCIAL']);

const limparTexto = (valor, maxLen = 255) => {
    if (valor === undefined || valor === null) return null;
    const texto = String(valor).trim();
    return texto !== '' ? texto.slice(0, maxLen) : null;
};

const normalizarInstanciaItem = (instancia, fallback = '1G') => {
    const val = String(instancia || '').trim().toUpperCase();
    if (INSTANCIAS_ITEM.has(val)) return val;
    const fb = String(fallback || '1G').trim().toUpperCase();
    return INSTANCIAS_ITEM.has(fb) ? fb : '1G';
};

const toMySqlDatetime = (valor) => {
    if (!valor) return null;

    if (valor instanceof Date) {
        return isNaN(valor.getTime()) ? null : valor.toISOString().slice(0, 19).replace('T', ' ');
    }

    const str = String(valor).trim();
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(str)) {
        return `${str.slice(0, 10)} ${str.slice(11, 19)}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        return `${str} 00:00:00`;
    }
    if (/^\d{14}$/.test(str)) {
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)} ${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}`;
    }
    if (/^\d{8}$/.test(str)) {
        return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)} 00:00:00`;
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 19).replace('T', ' ');
};

const normalizarValorCausa = (valor) => {
    if (valor === undefined || valor === null || valor === '') return null;
    const num = Number(valor);
    return Number.isFinite(num) ? Number(num.toFixed(2)) : null;
};

/**
 * Garante o cadastro inicial do processo na tabela `processos` sem duplicar pelo par (escritorio_id, numero_cnj).
 */
export const garantirProcessoBase = async ({
    escritorio_id = 1,
    numero_cnj,
    instancia = null,
    sistema_processual = null,
    monitoramento_ativo = true,
    exigirDigitoVerificador = true
}) => {
    const parsed = parseNumeroCNJ(numero_cnj, { exigirDigitoVerificador });
    if (!parsed.valido) {
        const erro = new Error(parsed.erro || 'Número do processo CNJ inválido.');
        erro.code = 'INVALID_CNJ';
        throw erro;
    }

    const instanciaReq = instancia ? String(instancia).trim().toUpperCase() : null;
    const instanciaFinal = INSTANCIAS_PROCESSO.has(instanciaReq) ? instanciaReq : parsed.instancia_sugerida;

    const sistemaReq = sistema_processual ? String(sistema_processual).trim().toUpperCase() : null;
    const sistemaFinal = SISTEMAS_VALIDOS.has(sistemaReq) ? sistemaReq : parsed.sistema_processual;

    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;

    const [resInsert] = await db.query(`
        INSERT INTO processos (
            escritorio_id, numero_cnj, numero_cnj_formatado,
            justica_codigo, tribunal_codigo, tribunal_sigla,
            instancia, sistema_processual, monitoramento_ativo, status_sincronizacao
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')
        ON DUPLICATE KEY UPDATE
            id = LAST_INSERT_ID(id),
            atualizado_em = CURRENT_TIMESTAMP
    `, [
        escId,
        parsed.numero_cnj,
        parsed.numero_cnj_formatado,
        parsed.justica_codigo,
        parsed.tribunal_codigo,
        parsed.tribunal_sigla.slice(0, 15),
        instanciaFinal,
        sistemaFinal,
        Boolean(monitoramento_ativo)
    ]);

    let processoId = resInsert.insertId;
    if (!processoId) {
        const [[existing]] = await db.query(
            'SELECT id FROM processos WHERE escritorio_id = ? AND numero_cnj = ? LIMIT 1',
            [escId, parsed.numero_cnj]
        );
        processoId = existing?.id;
    }

    const [[processo]] = await db.query('SELECT * FROM processos WHERE id = ? LIMIT 1', [processoId]);
    return { processo, parsed };
};

export const criarOuAtualizarProcessoEEnfileirar = async ({
    escritorio_id = 1,
    parsed,
    instancia = null,
    sistema_processual = null,
    monitoramento_ativo = true,
    tipo_job = 'SYNC_PROCESSO',
    fonte_utilizada = 'DATAJUD',
    parametros_json = null,
    max_tentativas = 5
}) => {
    const instanciaReq = instancia ? String(instancia).trim().toUpperCase() : null;
    const instanciaFinal = INSTANCIAS_PROCESSO.has(instanciaReq) ? instanciaReq : parsed.instancia_sugerida;
    const sistemaReq = sistema_processual ? String(sistema_processual).trim().toUpperCase() : null;
    const sistemaFinal = SISTEMAS_VALIDOS.has(sistemaReq) ? sistemaReq : parsed.sistema_processual;
    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const tribunalSigla = parsed.tribunal_sigla.slice(0, 15);
    const tipoNorm = tipo_job === 'DOWNLOAD_DOCUMENTO' ? 'DOWNLOAD_DOCUMENTO' : 'SYNC_PROCESSO';
    const fonteNorm = String(fonte_utilizada || 'DATAJUD').trim().toUpperCase();
    const paramsStr = parametros_json ? JSON.stringify(parametros_json) : null;

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [resProc] = await conn.query(`
            INSERT INTO processos (
                escritorio_id, numero_cnj, numero_cnj_formatado,
                justica_codigo, tribunal_codigo, tribunal_sigla,
                instancia, sistema_processual, monitoramento_ativo, status_sincronizacao
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDENTE')
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                status_sincronizacao = 'PENDENTE',
                atualizado_em = CURRENT_TIMESTAMP
        `, [
            escId,
            parsed.numero_cnj,
            parsed.numero_cnj_formatado,
            parsed.justica_codigo,
            parsed.tribunal_codigo,
            tribunalSigla,
            instanciaFinal,
            sistemaFinal,
            Boolean(monitoramento_ativo)
        ]);

        let processoId = resProc.insertId;
        if (!processoId) {
            const [[existing]] = await conn.query(
                'SELECT id FROM processos WHERE escritorio_id = ? AND numero_cnj = ? LIMIT 1',
                [escId, parsed.numero_cnj]
            );
            processoId = existing?.id;
        }

        const [resJob] = await conn.query(`
            INSERT INTO jobs_sincronizacao (
                processo_id, tipo_job, fonte_utilizada, parametros_json,
                status, tentativa_atual, max_tentativas, proxima_execucao_em
            ) VALUES (?, ?, ?, ?, 'EM_FILA', 1, ?, NOW())
        `, [
            processoId,
            tipoNorm,
            fonteNorm,
            paramsStr,
            Number(max_tentativas) || 5
        ]);

        await conn.commit();

        return {
            job_id: resJob.insertId,
            processo: {
                id: processoId,
                escritorio_id: escId,
                numero_cnj: parsed.numero_cnj,
                numero_cnj_formatado: parsed.numero_cnj_formatado,
                tribunal_sigla: tribunalSigla,
                instancia: instanciaFinal,
                sistema_processual: sistemaFinal,
                status_sincronizacao: 'PENDENTE'
            }
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

/**
 * Persiste um DTO padronizado (Seção 5) em transação única com idempotência garantida por SHA-256.
 */
export const persistirProcessoDTO = async (dto, {
    escritorio_id = 1,
    status_sincronizacao = 'ATUALIZADO',
    exigirDigitoVerificador = true
} = {}) => {
    if (!dto || typeof dto !== 'object') {
        throw new Error('DTO do processo inválido.');
    }

    const parsed = parseNumeroCNJ(dto.numero_cnj, { exigirDigitoVerificador });
    if (!parsed.valido) {
        const erro = new Error(parsed.erro || 'Número CNJ do DTO é inválido.');
        erro.code = 'INVALID_CNJ';
        throw erro;
    }

    const escId = Number(escritorio_id) > 0 ? Number(escritorio_id) : 1;
    const tribunalSigla = (limparTexto(dto.tribunal_sigla, 15) || parsed.tribunal_sigla).toUpperCase();
    const instanciaDto = String(dto.instancia || '').trim().toUpperCase();
    const instanciaProcesso = INSTANCIAS_PROCESSO.has(instanciaDto) ? instanciaDto : parsed.instancia_sugerida;
    const sistemaDto = String(dto.sistema_processual || '').trim().toUpperCase();
    const sistemaFinal = SISTEMAS_VALIDOS.has(sistemaDto) ? sistemaDto : parsed.sistema_processual;
    const statusFinal = STATUS_SYNC_VALIDOS.has(status_sincronizacao) ? status_sincronizacao : 'ATUALIZADO';

    const capa = dto.capa && typeof dto.capa === 'object' ? dto.capa : {};
    const hashCapa = gerarHashCapa(capa, { segredo_justica: dto.segredo_justica });

    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();

        const [resProc] = await conn.query(`
            INSERT INTO processos (
                escritorio_id, numero_cnj, numero_cnj_formatado,
                justica_codigo, tribunal_codigo, tribunal_sigla,
                instancia, sistema_processual,
                classe_processual, assunto_principal, orgao_julgador,
                valor_causa, segredo_justica, data_distribuicao,
                monitoramento_ativo, status_sincronizacao, ultima_sincronizacao_em,
                ultimo_erro, hash_capa
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, NOW(), NULL, ?)
            ON DUPLICATE KEY UPDATE
                id = LAST_INSERT_ID(id),
                tribunal_sigla = VALUES(tribunal_sigla),
                instancia = IF(instancia = 'AMBAS' OR VALUES(instancia) = 'AMBAS', 'AMBAS', VALUES(instancia)),
                sistema_processual = VALUES(sistema_processual),
                classe_processual = COALESCE(VALUES(classe_processual), classe_processual),
                assunto_principal = COALESCE(VALUES(assunto_principal), assunto_principal),
                orgao_julgador = COALESCE(VALUES(orgao_julgador), orgao_julgador),
                valor_causa = COALESCE(VALUES(valor_causa), valor_causa),
                segredo_justica = VALUES(segredo_justica),
                data_distribuicao = COALESCE(VALUES(data_distribuicao), data_distribuicao),
                status_sincronizacao = VALUES(status_sincronizacao),
                ultima_sincronizacao_em = NOW(),
                ultimo_erro = NULL,
                hash_capa = VALUES(hash_capa)
        `, [
            escId,
            parsed.numero_cnj,
            parsed.numero_cnj_formatado,
            parsed.justica_codigo,
            parsed.tribunal_codigo,
            tribunalSigla,
            instanciaProcesso,
            sistemaFinal,
            limparTexto(capa.classe_processual, 255),
            limparTexto(capa.assunto_principal, 255),
            limparTexto(capa.orgao_julgador, 255),
            normalizarValorCausa(capa.valor_causa),
            Boolean(dto.segredo_justica),
            toMySqlDatetime(capa.data_distribuicao),
            statusFinal,
            hashCapa
        ]);

        let processoId = resProc.insertId;
        if (!processoId) {
            const [[row]] = await conn.query(
                'SELECT id FROM processos WHERE escritorio_id = ? AND numero_cnj = ? LIMIT 1',
                [escId, parsed.numero_cnj]
            );
            processoId = row?.id;
        }

        const partes = Array.isArray(dto.partes) ? dto.partes : [];
        for (const parte of partes) {
            if (!parte || !parte.nome) continue;
            const poloNorm = String(parte.polo || 'OUTRO').trim().toUpperCase();
            const polo = POLOS_VALIDOS.has(poloNorm) ? poloNorm : 'OUTRO';
            const tipoParticipacao = limparTexto(parte.tipo_participacao, 100);
            const nomeParte = limparTexto(parte.nome, 255);
            const docParte = limparTexto(parte.documento_cpf_cnpj, 20);
            const advogados = Array.isArray(parte.advogados) ? parte.advogados : [];
            const hashParte = gerarHashParte({
                polo,
                tipo_participacao: tipoParticipacao || '',
                nome: nomeParte,
                documento_cpf_cnpj: docParte || ''
            });

            await conn.query(`
                INSERT INTO processo_partes (
                    processo_id, polo, tipo_participacao, nome,
                    documento_cpf_cnpj, advogados_json, hash_parte
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    tipo_participacao = COALESCE(VALUES(tipo_participacao), tipo_participacao),
                    documento_cpf_cnpj = COALESCE(VALUES(documento_cpf_cnpj), documento_cpf_cnpj),
                    advogados_json = COALESCE(VALUES(advogados_json), advogados_json)
            `, [
                processoId,
                polo,
                tipoParticipacao,
                nomeParte,
                docParte,
                JSON.stringify(advogados),
                hashParte
            ]);
        }

        const movimentacoes = Array.isArray(dto.movimentacoes) ? dto.movimentacoes : [];
        let novasMovimentacoesInseridas = 0;
        let totalDocumentos = 0;

        for (const mov of movimentacoes) {
            if (!mov || !mov.titulo) continue;

            const instanciaMov = normalizarInstanciaItem(mov.instancia, instanciaProcesso);
            const fonteCand = String(mov.fonte_captura || dto.fonte_captura || 'DATAJUD').trim().toUpperCase();
            const fonteMov = FONTES_VALIDAS.has(fonteCand) ? fonteCand : 'DATAJUD';
            const dataMov = toMySqlDatetime(mov.data_movimentacao) || toMySqlDatetime(new Date());
            const codigoCnj = (mov.codigo_cnj !== undefined && mov.codigo_cnj !== null && !isNaN(Number(mov.codigo_cnj)))
                ? Number(mov.codigo_cnj)
                : null;
            const tituloMov = limparTexto(mov.titulo, 500);
            const teorCompleto = (mov.teor_completo !== undefined && mov.teor_completo !== null && String(mov.teor_completo).trim() !== '')
                ? String(mov.teor_completo)
                : null;
            const docsVinculados = Array.isArray(mov.documentos_vinculados) ? mov.documentos_vinculados : [];
            const possuiAnexo = Boolean(mov.possui_anexo || docsVinculados.length > 0);

            const hashUnico = gerarHashMovimentacao({
                processo_id: processoId,
                instancia: instanciaMov,
                data_movimentacao: mov.data_movimentacao || dataMov,
                codigo_cnj: codigoCnj ?? 0,
                titulo: tituloMov
            });

            const [[movExistente]] = await conn.query(
                'SELECT id FROM processo_movimentacoes WHERE processo_id = ? AND hash_unico = ? LIMIT 1',
                [processoId, hashUnico]
            );
            const ehNovaMovimentacao = !movExistente;

            const [resMov] = await conn.query(`
                INSERT INTO processo_movimentacoes (
                    processo_id, instancia, data_movimentacao, codigo_cnj,
                    titulo, teor_completo, fonte_captura, possui_anexo, hash_unico
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    id = LAST_INSERT_ID(id),
                    teor_completo = COALESCE(VALUES(teor_completo), teor_completo),
                    possui_anexo = GREATEST(possui_anexo, VALUES(possui_anexo)),
                    fonte_captura = IF(VALUES(teor_completo) IS NOT NULL, VALUES(fonte_captura), fonte_captura)
            `, [
                processoId,
                instanciaMov,
                dataMov,
                codigoCnj,
                tituloMov,
                teorCompleto,
                fonteMov,
                possuiAnexo,
                hashUnico
            ]);

            if (ehNovaMovimentacao) {
                novasMovimentacoesInseridas++;
            }

            let movimentacaoId = movExistente?.id || resMov.insertId;
            if (!movimentacaoId) {
                const [[movRow]] = await conn.query(
                    'SELECT id FROM processo_movimentacoes WHERE processo_id = ? AND hash_unico = ? LIMIT 1',
                    [processoId, hashUnico]
                );
                movimentacaoId = movRow?.id || null;
            }

            for (const doc of docsVinculados) {
                if (!doc || !doc.id_documento_tribunal) continue;
                const docInst = normalizarInstanciaItem(doc.instancia, instanciaMov);
                await conn.query(`
                    INSERT INTO processo_documentos (
                        processo_id, movimentacao_id, instancia, id_documento_tribunal,
                        tipo_documento, descricao, data_juntada, mimetype, hash_documento_tribunal
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        movimentacao_id = COALESCE(VALUES(movimentacao_id), movimentacao_id),
                        tipo_documento = COALESCE(VALUES(tipo_documento), tipo_documento),
                        descricao = COALESCE(VALUES(descricao), descricao),
                        data_juntada = COALESCE(VALUES(data_juntada), data_juntada),
                        mimetype = COALESCE(VALUES(mimetype), mimetype),
                        hash_documento_tribunal = COALESCE(VALUES(hash_documento_tribunal), hash_documento_tribunal)
                `, [
                    processoId,
                    movimentacaoId,
                    docInst,
                    limparTexto(doc.id_documento_tribunal, 100),
                    limparTexto(doc.tipo_documento, 150),
                    limparTexto(doc.descricao, 255),
                    toMySqlDatetime(doc.data_juntada),
                    limparTexto(doc.mimetype, 100) || 'application/pdf',
                    limparTexto(doc.hash_documento_tribunal, 128)
                ]);
                totalDocumentos++;
            }
        }

        const docsAvulsos = Array.isArray(dto.documentos) ? dto.documentos : [];
        for (const doc of docsAvulsos) {
            if (!doc || !doc.id_documento_tribunal) continue;
            const docInst = normalizarInstanciaItem(doc.instancia, instanciaProcesso);
            await conn.query(`
                INSERT INTO processo_documentos (
                    processo_id, movimentacao_id, instancia, id_documento_tribunal,
                    tipo_documento, descricao, data_juntada, mimetype, hash_documento_tribunal
                ) VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    tipo_documento = COALESCE(VALUES(tipo_documento), tipo_documento),
                    descricao = COALESCE(VALUES(descricao), descricao),
                    data_juntada = COALESCE(VALUES(data_juntada), data_juntada),
                    mimetype = COALESCE(VALUES(mimetype), mimetype),
                    hash_documento_tribunal = COALESCE(VALUES(hash_documento_tribunal), hash_documento_tribunal)
            `, [
                processoId,
                docInst,
                limparTexto(doc.id_documento_tribunal, 100),
                limparTexto(doc.tipo_documento, 150),
                limparTexto(doc.descricao, 255),
                toMySqlDatetime(doc.data_juntada),
                limparTexto(doc.mimetype, 100) || 'application/pdf',
                limparTexto(doc.hash_documento_tribunal, 128)
            ]);
            totalDocumentos++;
        }

        await conn.commit();

        return {
            processo_id: processoId,
            numero_cnj: parsed.numero_cnj,
            tribunal_sigla: tribunalSigla,
            hash_capa: hashCapa,
            novas_movimentacoes_inseridas: novasMovimentacoesInseridas,
            total_partes: partes.length,
            total_movimentacoes: movimentacoes.length,
            total_documentos: totalDocumentos
        };
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

/**
 * Consulta o status de sincronização, último job e últimas movimentações de um processo.
 */
export const obterStatusSincronizacaoProcesso = async (processoId, { limiteMovimentacoes = 20 } = {}) => {
    const idNum = Number(processoId);
    if (!Number.isInteger(idNum) || idNum <= 0) {
        return null;
    }

    const [[processo]] = await db.query('SELECT * FROM processos WHERE id = ? LIMIT 1', [idNum]);
    if (!processo) {
        return null;
    }

    const [[ultimoJob]] = await db.query(
        'SELECT * FROM jobs_sincronizacao WHERE processo_id = ? ORDER BY id DESC LIMIT 1',
        [idNum]
    );

    const [[contagens]] = await db.query(`
        SELECT
            COUNT(*) AS total_movimentacoes,
            SUM(CASE WHEN lido_pelo_advogado = FALSE THEN 1 ELSE 0 END) AS nao_lidos
        FROM processo_movimentacoes
        WHERE processo_id = ?
    `, [idNum]);

    const lim = Math.min(Math.max(Number(limiteMovimentacoes) || 20, 1), 100);
    const [movimentacoes] = await db.query(`
        SELECT id, processo_id, instancia, data_movimentacao, codigo_cnj,
               titulo, teor_completo, fonte_captura, possui_anexo,
               lido_pelo_advogado, hash_unico, criado_em
        FROM processo_movimentacoes
        WHERE processo_id = ?
        ORDER BY data_movimentacao DESC, id DESC
        LIMIT ?
    `, [idNum, lim]);

    const [partes] = await db.query(`
        SELECT id, polo, tipo_participacao, nome, documento_cpf_cnpj, advogados_json, hash_parte
        FROM processo_partes
        WHERE processo_id = ?
        ORDER BY id ASC
    `, [idNum]);

    const [documentos] = await db.query(`
        SELECT id, movimentacao_id, instancia, id_documento_tribunal, tipo_documento,
               descricao, data_juntada, mimetype, hash_documento_tribunal, baixado, caminho_storage
        FROM processo_documentos
        WHERE processo_id = ?
        ORDER BY id DESC
    `, [idNum]);

    return {
        processo,
        ultimo_job: ultimoJob || null,
        total_movimentacoes: Number(contagens?.total_movimentacoes || 0),
        nao_lidos: Number(contagens?.nao_lidos || 0),
        partes,
        movimentacoes,
        documentos
    };
};

export const ProcessPersistenceService = {
    garantirProcessoBase,
    criarOuAtualizarProcessoEEnfileirar,
    persistirProcessoDTO,
    obterStatusSincronizacaoProcesso
};

export default ProcessPersistenceService;
