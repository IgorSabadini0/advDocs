import { db } from '../config/db.js';
import { ProcessPersistenceService } from './processPersistenceService.js';
import { DatajudProvider } from './datajudProvider.js';
import { MniTrf3Provider } from './mniTrf3Provider.js';
import { CourtScraperProvider } from './courtScraperProvider.js';
import { sendPushToAllSubscribedUsers } from './pushNotificationService.js';

export const MAX_CONCORRENCIA_POR_TRIBUNAL = 2;

const TRIBUNAIS_MNI_NATIVO = new Set(['TRF3']);
const ERROS_ELEGIVEIS_FALLBACK_MNI = new Set([
    'MISSING_CERTIFICATE_A1',
    'MNI_NOT_SUPPORTED',
    'MNI_SOAP_FAULT',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT'
]);
const RETRYABLE_HTTP_OR_CODES = new Set(['429', '500', '502', '503', '504', 'ETIMEDOUT', 'ECONNABORTED', 'ECONNRESET', 'EAI_AGAIN']);

const concorrenciaPorTribunal = new Map();
const providers = new Map();
const timersRetry = new Set();

let loopEmExecucao = false;
let loopReagendado = false;
let workerEncerrado = false;

const executarScraperComFallback = async (job) => {
    const scraperHandler = providers.get('SCRAPER') || ((j) => CourtScraperProvider.executarJobScraper(j));
    const resultado = await scraperHandler(job);
    return {
        ...resultado,
        fonteEfetivaUsada: 'SCRAPER'
    };
};

const defaultSyncProvider = async (job) => {
    const params = typeof job.parametros_json === 'string'
        ? JSON.parse(job.parametros_json)
        : (job.parametros_json || {});

    if (params?.dto) {
        return {
            dto: {
                ...params.dto,
                numero_cnj: params.dto.numero_cnj || job.numero_cnj,
                tribunal_sigla: params.dto.tribunal_sigla || job.tribunal_sigla,
                fonte_captura: job.fonte_utilizada
            },
            codigo_http_ou_soap: '200'
        };
    }

    const fonteNorm = String(job.fonte_utilizada || 'DATAJUD').trim().toUpperCase();

    if (fonteNorm === 'SCRAPER') {
        return executarScraperComFallback(job);
    }

    if (fonteNorm === 'MNI') {
        const tribunalUpper = String(job.tribunal_sigla || '').trim().toUpperCase();

        if (job.tipo_job !== 'DOWNLOAD_DOCUMENTO' && !TRIBUNAIS_MNI_NATIVO.has(tribunalUpper)) {
            if (params.semFallback !== true) {
                return executarScraperComFallback(job);
            }
            const err = new Error(`Tribunal ${tribunalUpper} não suporta MNI nativo.`);
            err.code = 'MNI_NOT_SUPPORTED';
            throw err;
        }

        try {
            return await MniTrf3Provider.executarJobMni(job);
        } catch (mniErr) {
            const codeUpper = String(mniErr?.code || '').toUpperCase();
            const podeFallback = job.tipo_job !== 'DOWNLOAD_DOCUMENTO'
                && params.semFallback !== true
                && ERROS_ELEGIVEIS_FALLBACK_MNI.has(codeUpper);

            if (podeFallback) {
                return executarScraperComFallback(job);
            }
            throw mniErr;
        }
    }

    if (fonteNorm === 'DATAJUD') {
        return DatajudProvider.executarJobDatajud(job, { maxTentativas: 1 });
    }

    return {
        dto: {
            numero_cnj: job.numero_cnj,
            tribunal_sigla: job.tribunal_sigla,
            instancia: job.instancia || '1G',
            sistema_processual: job.sistema_processual || 'PJE',
            segredo_justica: false,
            capa: {},
            partes: [],
            movimentacoes: []
        },
        codigo_http_ou_soap: '202-QUEUED-BASE'
    };
};

export const registerSyncProvider = (fonte, handlerFn) => {
    const key = String(fonte || '').trim().toUpperCase();
    if (typeof handlerFn !== 'function') {
        throw new Error('Provider handler deve ser uma função.');
    }
    providers.set(key, handlerFn);
};

export const resetSyncProviders = () => {
    providers.clear();
};

export const getConcorrenciaSnapshot = () => {
    return Object.fromEntries(concorrenciaPorTribunal.entries());
};

export const calcularBackoffComJitterMs = (tentativaAtual, baseMs = 5000, jitterMaxMs = 1000) => {
    const exp = Math.max(1, Number(tentativaAtual) || 1);
    const jitter = Math.floor(Math.random() * jitterMaxMs);
    return baseMs * (2 ** exp) + jitter;
};

const erroEhRetryable = (error) => {
    if (!error) return false;
    if (error.retryable === true) return true;
    const statusCode = String(error.statusCode || error.response?.status || error.code || '').toUpperCase();
    const statusNum = Number(statusCode);
    if (Number.isInteger(statusNum) && statusNum >= 500 && statusNum <= 599) {
        return true;
    }
    return RETRYABLE_HTTP_OR_CODES.has(statusCode);
};

const getConcorrenciaTribunal = (tribunalSigla) => {
    return concorrenciaPorTribunal.get(tribunalSigla) || 0;
};

const incrementarConcorrencia = (tribunalSigla) => {
    const atual = getConcorrenciaTribunal(tribunalSigla);
    concorrenciaPorTribunal.set(tribunalSigla, atual + 1);
};

const decrementarConcorrencia = (tribunalSigla) => {
    const atual = getConcorrenciaTribunal(tribunalSigla);
    if (atual <= 1) {
        concorrenciaPorTribunal.delete(tribunalSigla);
    } else {
        concorrenciaPorTribunal.set(tribunalSigla, atual - 1);
    }
};

const executarEmTransacao = async (fn) => {
    const conn = await db.getConnection();
    try {
        await conn.beginTransaction();
        const result = await fn(conn);
        await conn.commit();
        return result;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

const executarJobSincronizacao = async (job) => {
    const inicioMs = Date.now();
    const fonte = String(job.fonte_utilizada || 'DATAJUD').trim().toUpperCase();
    const provider = providers.get(fonte) || defaultSyncProvider;

    try {
        const resultado = await provider(job);
        let novasMovimentacoes = Number(resultado?.novas_movimentacoes_inseridas || 0);
        const statusFinalProcesso = resultado?.status_sincronizacao || 'ATUALIZADO';

        if (resultado?.dto) {
            const persistRes = await ProcessPersistenceService.persistirProcessoDTO(resultado.dto, {
                escritorio_id: job.escritorio_id,
                status_sincronizacao: 'SINCRONIZANDO',
                exigirDigitoVerificador: false
            });
            novasMovimentacoes = persistRes.novas_movimentacoes_inseridas;
        }

        const tempoExecucaoMs = Math.max(1, Date.now() - inicioMs);
        const codigoHttpSoap = resultado?.codigo_http_ou_soap ? String(resultado.codigo_http_ou_soap).slice(0, 50) : '200';
        const fonteFinal = resultado?.fonteEfetivaUsada || fonte;

        await executarEmTransacao(async (conn) => {
            await conn.query(`
                UPDATE jobs_sincronizacao
                SET status = 'SUCESSO',
                    fonte_utilizada = ?,
                    tempo_execucao_ms = ?,
                    novas_movimentacoes_inseridas = ?,
                    codigo_http_ou_soap = ?,
                    mensagem_erro = NULL,
                    finalizado_em = NOW()
                WHERE id = ?
            `, [fonteFinal, tempoExecucaoMs, novasMovimentacoes, codigoHttpSoap, job.id]);

            await conn.query(`
                UPDATE processos
                SET status_sincronizacao = ?,
                    ultima_sincronizacao_em = NOW(),
                    ultimo_erro = NULL
                WHERE id = ?
            `, [statusFinalProcesso, job.processo_id]);
        });

        if (novasMovimentacoes > 0) {
            sendPushToAllSubscribedUsers({
                title: `Nova Movimentação (${job.tribunal_sigla})`,
                body: `${novasMovimentacoes} nova(s) movimentação(ões) detectada(s) no processo ${job.numero_cnj}.`,
                url: `/pages/consult/?proc=${encodeURIComponent(job.numero_cnj)}`,
                tag: `advdocs-proc-${job.processo_id}`
            }).catch(() => {});
        }
    } catch (error) {
        const tempoExecucaoMs = Math.max(1, Date.now() - inicioMs);
        const tentativaAtual = Number(job.tentativa_atual || 1);
        const maxTentativas = Number(job.max_tentativas || 5);
        const retryable = erroEhRetryable(error) && tentativaAtual < maxTentativas;
        const codigoHttpSoap = String(error.statusCode || error.response?.status || error.code || 'ERROR').slice(0, 50);
        const msgErro = String(error.message || 'Erro durante execução do job de sincronização.').slice(0, 2000);

        if (retryable) {
            const backoffMs = Number(error.retryDelayMs) >= 0
                ? Number(error.retryDelayMs)
                : calcularBackoffComJitterMs(tentativaAtual);

            await executarEmTransacao(async (conn) => {
                await conn.query(`
                    UPDATE jobs_sincronizacao
                    SET status = 'FALHA_TEMPORARIA',
                        tentativa_atual = tentativa_atual + 1,
                        proxima_execucao_em = DATE_ADD(NOW(), INTERVAL ? SECOND),
                        tempo_execucao_ms = ?,
                        codigo_http_ou_soap = ?,
                        mensagem_erro = ?
                    WHERE id = ?
                `, [Math.max(1, Math.ceil(backoffMs / 1000)), tempoExecucaoMs, codigoHttpSoap, msgErro, job.id]);

                await conn.query(`
                    UPDATE processos
                    SET status_sincronizacao = 'PENDENTE',
                        ultimo_erro = ?
                    WHERE id = ?
                `, [msgErro, job.processo_id]);
            });

            const timer = setTimeout(() => {
                timersRetry.delete(timer);
                dispararProcessamentoFila();
            }, Math.max(50, backoffMs));
            if (typeof timer.unref === 'function') timer.unref();
            timersRetry.add(timer);
        } else {
            await executarEmTransacao(async (conn) => {
                await conn.query(`
                    UPDATE jobs_sincronizacao
                    SET status = 'FALHA_PERMANENTE',
                        tempo_execucao_ms = ?,
                        codigo_http_ou_soap = ?,
                        mensagem_erro = ?,
                        finalizado_em = NOW()
                    WHERE id = ?
                `, [tempoExecucaoMs, codigoHttpSoap, msgErro, job.id]);

                await conn.query(`
                    UPDATE processos
                    SET status_sincronizacao = 'ERRO',
                        ultimo_erro = ?
                    WHERE id = ?
                `, [msgErro, job.processo_id]);
            });
        }
    } finally {
        decrementarConcorrencia(job.tribunal_sigla);
        if (!workerEncerrado) {
            dispararProcessamentoFila();
        }
    }
};

const reclamarEExecutarJob = async (job) => {
    try {
        if (workerEncerrado) {
            decrementarConcorrencia(job.tribunal_sigla);
            return;
        }

        const reclamado = await executarEmTransacao(async (conn) => {
            const [claimRes] = await conn.query(`
                UPDATE jobs_sincronizacao
                SET status = 'PROCESSANDO'
                WHERE id = ? AND status IN ('EM_FILA', 'FALHA_TEMPORARIA')
            `, [job.id]);

            if (claimRes.affectedRows === 0) {
                return false;
            }

            await conn.query(
                "UPDATE processos SET status_sincronizacao = 'SINCRONIZANDO' WHERE id = ?",
                [job.processo_id]
            );
            return true;
        });

        if (!reclamado) {
            decrementarConcorrencia(job.tribunal_sigla);
            return;
        }

        await executarJobSincronizacao(job);
    } catch (error) {
        decrementarConcorrencia(job.tribunal_sigla);
        if (!workerEncerrado) {
            console.error('[ProcessSyncQueueWorker] Falha ao reclamar/executar job:', error.message);
        }
    }
};

export const processarFilaPendente = async () => {
    if (workerEncerrado) return;
    if (loopEmExecucao) {
        loopReagendado = true;
        return;
    }

    loopEmExecucao = true;
    try {
        const [candidatos] = await db.query(`
            SELECT j.*, p.escritorio_id, p.numero_cnj, p.tribunal_sigla, p.instancia, p.sistema_processual
            FROM jobs_sincronizacao j
            INNER JOIN processos p ON p.id = j.processo_id
            WHERE j.status IN ('EM_FILA', 'FALHA_TEMPORARIA')
              AND j.proxima_execucao_em <= NOW()
            ORDER BY j.proxima_execucao_em ASC, j.id ASC
            LIMIT 25
        `);

        for (const job of candidatos) {
            if (workerEncerrado) break;
            const tribunal = job.tribunal_sigla;
            if (getConcorrenciaTribunal(tribunal) >= MAX_CONCORRENCIA_POR_TRIBUNAL) {
                continue;
            }

            incrementarConcorrencia(tribunal);
            // Dispara reclamação e execução em paralelo até o limite por tribunal
            reclamarEExecutarJob(job);
        }
    } catch (error) {
        if (!workerEncerrado) {
            console.error('[ProcessSyncQueueWorker] Erro ao processar fila:', error.message);
        }
    } finally {
        loopEmExecucao = false;
        if (loopReagendado && !workerEncerrado) {
            loopReagendado = false;
            setImmediate(processarFilaPendente);
        }
    }
};

export const dispararProcessamentoFila = () => {
    if (workerEncerrado) return;
    setImmediate(processarFilaPendente);
};

export const reativarQueueWorker = () => {
    workerEncerrado = false;
};

export const encerrarQueueWorker = () => {
    workerEncerrado = true;
    cancelarTimersRetry();
};

/**
 * Enfileira um job na tabela `jobs_sincronizacao` e dispara o worker assíncrono sem bloquear a resposta HTTP.
 */
export const enfileirarJobSincronizacao = async ({
    processo_id,
    tipo_job = 'SYNC_PROCESSO',
    fonte_utilizada = 'DATAJUD',
    parametros_json = null,
    max_tentativas = 5,
    dispararWorker = true
}) => {
    const fonteNorm = String(fonte_utilizada || 'DATAJUD').trim().toUpperCase();
    const tipoNorm = tipo_job === 'DOWNLOAD_DOCUMENTO' ? 'DOWNLOAD_DOCUMENTO' : 'SYNC_PROCESSO';
    const paramsStr = parametros_json ? JSON.stringify(parametros_json) : null;

    const [resJob] = await db.query(`
        INSERT INTO jobs_sincronizacao (
            processo_id, tipo_job, fonte_utilizada, parametros_json,
            status, tentativa_atual, max_tentativas, proxima_execucao_em
        ) VALUES (?, ?, ?, ?, 'EM_FILA', 1, ?, NOW())
    `, [
        Number(processo_id),
        tipoNorm,
        fonteNorm,
        paramsStr,
        Number(max_tentativas) || 5
    ]);

    if (dispararWorker) {
        dispararProcessamentoFila();
    }

    return {
        job_id: resJob.insertId,
        processo_id: Number(processo_id),
        tipo_job: tipoNorm,
        fonte_utilizada: fonteNorm,
        status: 'EM_FILA'
    };
};

export const cancelarTimersRetry = () => {
    for (const timer of timersRetry) {
        clearTimeout(timer);
    }
    timersRetry.clear();
};

export const ProcessSyncQueueWorker = {
    MAX_CONCORRENCIA_POR_TRIBUNAL,
    enfileirarJobSincronizacao,
    dispararProcessamentoFila,
    processarFilaPendente,
    registerSyncProvider,
    resetSyncProviders,
    getConcorrenciaSnapshot,
    calcularBackoffComJitterMs,
    cancelarTimersRetry,
    reativarQueueWorker,
    encerrarQueueWorker
};

export default ProcessSyncQueueWorker;
