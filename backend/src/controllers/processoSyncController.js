import fs from 'node:fs/promises';
import path from 'node:path';
import { db } from '../config/db.js';
import { ProcessPersistenceService } from '../services/processPersistenceService.js';
import { dispararProcessamentoFila, enfileirarJobSincronizacao } from '../services/processSyncQueueWorker.js';
import { parseNumeroCNJ } from '../utils/cnjParser.js';

const FONTES_VALIDAS = new Set(['DATAJUD', 'MNI', 'SCRAPER', 'WEBHOOK_EXTERNO']);

/**
 * POST /api/processos/sincronizar
 * Cadastra/atualiza o processo base pelo número CNJ, enfileira o job assíncrono
 * e responde imediatamente com 202 Accepted + job_id.
 */
const sincronizarProcesso = async (req, res) => {
    try {
        const rawNumero = req.body?.numero_cnj ?? req.body?.numeroProcesso ?? req.body?.numeroProc;
        const parsed = parseNumeroCNJ(rawNumero, { exigirDigitoVerificador: true });

        if (!parsed.valido) {
            return res.status(400).json({
                mensagem: parsed.erro || 'Número CNJ inválido.'
            });
        }

        const escritorioId = Number(req.body?.escritorio_id) > 0 ? Number(req.body.escritorio_id) : 1;
        const instancia = req.body?.instancia || null;
        const sistemaProcessual = req.body?.sistema_processual || null;
        const fonteRaw = String(req.body?.fonte || req.body?.fonte_utilizada || 'DATAJUD').trim().toUpperCase();
        const fonteUtilizada = FONTES_VALIDAS.has(fonteRaw) ? fonteRaw : 'DATAJUD';
        const parametrosJson = req.body?.parametros && typeof req.body.parametros === 'object'
            ? req.body.parametros
            : null;

        const { processo, job_id } = await ProcessPersistenceService.criarOuAtualizarProcessoEEnfileirar({
            escritorio_id: escritorioId,
            parsed,
            instancia,
            sistema_processual: sistemaProcessual,
            monitoramento_ativo: req.body?.monitoramento_ativo !== false,
            tipo_job: 'SYNC_PROCESSO',
            fonte_utilizada: fonteUtilizada,
            parametros_json: parametrosJson
        });

        dispararProcessamentoFila();

        return res.status(202).json({
            mensagem: 'Sincronização enfileirada com sucesso.',
            job_id,
            processo_id: processo.id,
            numero_cnj: processo.numero_cnj,
            numero_cnj_formatado: processo.numero_cnj_formatado,
            tribunal_sigla: processo.tribunal_sigla,
            instancia: processo.instancia,
            sistema_processual: processo.sistema_processual,
            status_sincronizacao: processo.status_sincronizacao
        });
    } catch (error) {
        if (error.code === 'INVALID_CNJ') {
            return res.status(400).json({ mensagem: error.message });
        }
        console.error('Erro ao enfileirar sincronização de processo:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao enfileirar sincronização do processo.' });
    }
};

/**
 * GET /api/processos/:id/status-sincronizacao
 * Retorna o status atual da sincronização, último job e últimas movimentações persistidas.
 */
const obterStatusSincronizacao = async (req, res) => {
    try {
        const parsedId = Number(req.params.id);
        if (isNaN(parsedId) || !Number.isInteger(parsedId) || parsedId <= 0) {
            return res.status(400).json({ mensagem: 'ID do processo inválido.' });
        }

        const limiteMov = Number(req.query?.limite) || 20;
        const statusDados = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(parsedId, {
            limiteMovimentacoes: limiteMov
        });

        if (!statusDados) {
            return res.status(404).json({ mensagem: 'Processo não encontrado.' });
        }

        return res.status(200).json(statusDados);
    } catch (error) {
        console.error('Erro ao consultar status de sincronização do processo:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao consultar status de sincronização.' });
    }
};

/**
 * POST /api/processos/:id/documentos/:docId/baixar
 * Enfileira job `DOWNLOAD_DOCUMENTO` via MNI 2.2.2 com Certificado A1 para download sob demanda de peça em PDF.
 */
const solicitarDownloadDocumento = async (req, res) => {
    try {
        const processoId = Number(req.params.id);
        if (isNaN(processoId) || !Number.isInteger(processoId) || processoId <= 0) {
            return res.status(400).json({ mensagem: 'ID do processo inválido.' });
        }

        const docIdParam = String(req.params.docId || '').trim();
        if (!docIdParam) {
            return res.status(400).json({ mensagem: 'ID do documento inválido.' });
        }

        const [[processo]] = await db.query('SELECT * FROM processos WHERE id = ? LIMIT 1', [processoId]);
        if (!processo) {
            return res.status(404).json({ mensagem: 'Processo não encontrado.' });
        }

        const parsedDocNum = Number(docIdParam);
        const queryDoc = (Number.isInteger(parsedDocNum) && parsedDocNum > 0)
            ? 'SELECT * FROM processo_documentos WHERE processo_id = ? AND (id = ? OR id_documento_tribunal = ?) LIMIT 1'
            : 'SELECT * FROM processo_documentos WHERE processo_id = ? AND id_documento_tribunal = ? LIMIT 1';
        const paramsDoc = (Number.isInteger(parsedDocNum) && parsedDocNum > 0)
            ? [processoId, parsedDocNum, docIdParam]
            : [processoId, docIdParam];

        const [[documento]] = await db.query(queryDoc, paramsDoc);
        if (!documento) {
            return res.status(404).json({ mensagem: 'Documento não localizado neste processo.' });
        }

        const instanciaSolicitada = req.body?.instancia || documento.instancia || '1G';
        const job = await enfileirarJobSincronizacao({
            processo_id: processo.id,
            tipo_job: 'DOWNLOAD_DOCUMENTO',
            fonte_utilizada: 'MNI',
            parametros_json: {
                documento_id: documento.id,
                id_documento_tribunal: documento.id_documento_tribunal,
                instancia: instanciaSolicitada
            }
        });

        return res.status(202).json({
            mensagem: 'Download do documento enfileirado via MNI com sucesso.',
            job_id: job.job_id,
            processo_id: processo.id,
            documento_id: documento.id,
            id_documento_tribunal: documento.id_documento_tribunal,
            instancia: instanciaSolicitada,
            status: 'EM_FILA'
        });
    } catch (error) {
        console.error('Erro ao enfileirar download de documento via MNI:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao solicitar download do documento.' });
    }
};

/**
 * GET /api/processos/cnj/:numeroCnj/status-sincronizacao
 * Busca os dados híbridos de monitoramento, movimentações e documentos diretamente pelo número CNJ.
 */
const obterStatusPorNumeroCnj = async (req, res) => {
    try {
        const numeroLimpo = String(req.params.numeroCnj || '').replace(/\D/g, '');
        if (numeroLimpo.length !== 20) {
            return res.status(400).json({ mensagem: 'Número CNJ inválido (informe os 20 dígitos).' });
        }

        const escritorioId = Number(req.query?.escritorio_id) > 0 ? Number(req.query.escritorio_id) : 1;
        const [[procRow]] = await db.query(
            'SELECT id FROM processos WHERE escritorio_id = ? AND numero_cnj = ? LIMIT 1',
            [escritorioId, numeroLimpo]
        );

        if (!procRow) {
            return res.status(200).json({
                processo: null,
                ultimo_job: null,
                total_movimentacoes: 0,
                nao_lidos: 0,
                partes: [],
                movimentacoes: [],
                documentos: []
            });
        }

        const limiteMov = Number(req.query?.limite) || 30;
        const statusDados = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(procRow.id, {
            limiteMovimentacoes: limiteMov
        });

        return res.status(200).json(statusDados);
    } catch (error) {
        console.error('Erro ao consultar status de sincronização por CNJ:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao consultar status do processo.' });
    }
};

/**
 * PATCH /api/processos/:id/movimentacoes/ler
 * Marca todas as movimentações não lidas do processo (ou uma específica) como lidas pelo advogado.
 */
const marcarMovimentacoesComoLidas = async (req, res) => {
    try {
        const processoId = Number(req.params.id);
        if (isNaN(processoId) || !Number.isInteger(processoId) || processoId <= 0) {
            return res.status(400).json({ mensagem: 'ID do processo inválido.' });
        }

        const movId = req.body?.movimentacao_id ? Number(req.body.movimentacao_id) : null;
        let result;

        if (movId && Number.isInteger(movId) && movId > 0) {
            [result] = await db.query(
                'UPDATE processo_movimentacoes SET lido_pelo_advogado = TRUE WHERE processo_id = ? AND id = ? AND lido_pelo_advogado = FALSE',
                [processoId, movId]
            );
        } else {
            [result] = await db.query(
                'UPDATE processo_movimentacoes SET lido_pelo_advogado = TRUE WHERE processo_id = ? AND lido_pelo_advogado = FALSE',
                [processoId]
            );
        }

        const [[restante]] = await db.query(
            'SELECT COUNT(*) AS nao_lidos FROM processo_movimentacoes WHERE processo_id = ? AND lido_pelo_advogado = FALSE',
            [processoId]
        );

        return res.status(200).json({
            mensagem: 'Movimentações marcadas como lidas.',
            atualizadas: Number(result.affectedRows || 0),
            nao_lidos: Number(restante?.nao_lidos || 0)
        });
    } catch (error) {
        console.error('Erro ao marcar movimentações como lidas:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao atualizar movimentações.' });
    }
};

/**
 * GET /api/processos/:id/documentos/:docId/arquivo
 * Entrega o PDF baixado previamente via MNI diretamente do storage seguro.
 */
const servirArquivoDocumentoBaixado = async (req, res) => {
    try {
        const processoId = Number(req.params.id);
        if (isNaN(processoId) || !Number.isInteger(processoId) || processoId <= 0) {
            return res.status(400).json({ mensagem: 'ID do processo inválido.' });
        }

        const docIdParam = String(req.params.docId || '').trim();
        if (!docIdParam) {
            return res.status(400).json({ mensagem: 'ID do documento inválido.' });
        }

        const parsedDocNum = Number(docIdParam);
        const queryDoc = (Number.isInteger(parsedDocNum) && parsedDocNum > 0)
            ? 'SELECT * FROM processo_documentos WHERE processo_id = ? AND (id = ? OR id_documento_tribunal = ?) LIMIT 1'
            : 'SELECT * FROM processo_documentos WHERE processo_id = ? AND id_documento_tribunal = ? LIMIT 1';
        const paramsDoc = (Number.isInteger(parsedDocNum) && parsedDocNum > 0)
            ? [processoId, parsedDocNum, docIdParam]
            : [processoId, docIdParam];

        const [[documento]] = await db.query(queryDoc, paramsDoc);
        if (!documento) {
            return res.status(404).json({ mensagem: 'Documento não encontrado.' });
        }

        if (!documento.baixado || !documento.caminho_storage) {
            return res.status(404).json({ mensagem: 'Este documento ainda não foi baixado para o storage.' });
        }

        const caminhoResolvido = path.resolve(documento.caminho_storage);
        try {
            await fs.access(caminhoResolvido);
        } catch {
            return res.status(404).json({ mensagem: 'Arquivo físico do documento não localizado no storage.' });
        }

        const nomeArquivo = path.basename(caminhoResolvido);
        res.setHeader('Content-Type', documento.mimetype || 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${nomeArquivo}"`);
        return res.sendFile(caminhoResolvido);
    } catch (error) {
        console.error('Erro ao servir arquivo de documento:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao entregar arquivo do documento.' });
    }
};

export const processoSyncController = {
    sincronizarProcesso,
    obterStatusSincronizacao,
    obterStatusPorNumeroCnj,
    solicitarDownloadDocumento,
    marcarMovimentacoesComoLidas,
    servirArquivoDocumentoBaixado
};

export default processoSyncController;
