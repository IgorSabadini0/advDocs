import axios from 'axios';
import {
    parseNumeroCNJ,
    resolverEndpointDatajud
} from '../utils/cnjParser.js';

export const TIMEOUT_DATAJUD_MS = 15000;
export const MAX_TENTATIVAS_DATAJUD = 5;
export const BACKOFF_BASE_DATAJUD_MS = 5000;

export const CAMPOS_SOURCE_DATAJUD = [
    'numeroProcesso',
    'grau',
    'classe.nome',
    'sistema.nome',
    'orgaoJulgador.nome',
    'dataAjuizamento',
    'assuntos.nome',
    'movimentos.codigo',
    'movimentos.nome',
    'movimentos.dataHora',
    'movimentos.complementosTabelados'
];

const RETRYABLE_HTTP_STATUS = new Set([429, 502, 503, 504]);
const RETRYABLE_NET_CODES = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN']);

/**
 * Constrói a query Elasticsearch otimizada conforme Seção 6.1 (bool.filter.term + _source enxuto).
 */
export const construirQueryDatajud = (numeroCnjLimpo, size = 5) => ({
    size,
    _source: CAMPOS_SOURCE_DATAJUD,
    query: {
        bool: {
            filter: [
                { term: { numeroProcesso: String(numeroCnjLimpo || '').replace(/\D/g, '') } }
            ]
        }
    }
});

const normalizarGrauParaInstancia = (grauRaw, fallback = '1G') => {
    const g = String(grauRaw || '').trim().toUpperCase();
    if (g === 'G1' || g === '1G' || g === 'JE') return '1G';
    if (g === 'G2' || g === '2G' || g === 'TR') return '2G';
    if (g === 'SUP' || g === 'SUPERIOR') return 'SUPERIOR';
    return (fallback === '2G' || fallback === 'SUPERIOR') ? fallback : '1G';
};

const normalizarSistemaProcessual = (sistemaNome, fallback = 'PJE') => {
    const raw = String(sistemaNome || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (raw.includes('PJE')) return 'PJE';
    if (raw.includes('ESAJ')) return 'ESAJ';
    if (raw.includes('EPROC')) return 'EPROC';
    if (raw.includes('PROJUDI')) return 'PROJUDI';
    return fallback || 'DESCONHECIDO';
};

const extrairTimestampHit = (source = {}) => {
    const candidatos = [];
    if (source.dataHoraUltimaAtualizacao) {
        candidatos.push(new Date(source.dataHoraUltimaAtualizacao).getTime());
    }
    if (Array.isArray(source.movimentos)) {
        for (const m of source.movimentos) {
            if (m?.dataHora) candidatos.push(new Date(m.dataHora).getTime());
        }
    }
    if (source.dataAjuizamento) {
        candidatos.push(new Date(source.dataAjuizamento).getTime());
    }
    const validos = candidatos.filter(Number.isFinite);
    return validos.length > 0 ? Math.max(...validos) : 0;
};

const formatarTituloMovimentacao = (mov = {}) => {
    const base = String(mov.nome || 'Movimentação sem descrição').trim();
    const complRaw = Array.isArray(mov.complementosTabelados) ? mov.complementosTabelados : [];
    const extras = complRaw
        .map(c => {
            const nome = String(c?.nome || '').trim();
            const desc = String(c?.descricao || '').trim();
            if (nome && desc && nome.toLowerCase() !== desc.toLowerCase()) return `${nome}: ${desc}`;
            return desc || nome;
        })
        .filter(Boolean);

    if (extras.length === 0) return base.slice(0, 500);
    return `${base} — ${extras.join(' | ')}`.slice(0, 500);
};

/**
 * Converte a lista de `_source` hits retornados pelo Elasticsearch do DataJud
 * (incluindo múltiplos graus como G1 e G2 do TRF3) para o DTO padronizado da Seção 5.
 */
export const normalizarHitsDatajudParaDTO = (hits = [], numeroCnj = '', tribunalSiglaHint = null) => {
    if (!Array.isArray(hits) || hits.length === 0) {
        return null;
    }

    const parsed = parseNumeroCNJ(numeroCnj || hits[0]?._source?.numeroProcesso, {
        exigirDigitoVerificador: false
    });
    const numeroLimpo = parsed.numero_cnj || String(numeroCnj || hits[0]?._source?.numeroProcesso || '').replace(/\D/g, '');
    const tribunalSigla = (tribunalSiglaHint || parsed.tribunal_sigla || 'TRF3').toUpperCase().slice(0, 15);

    const hitsOrdenados = [...hits]
        .filter(h => h && (h._source || h.grau || h.classe || h.movimentos))
        .sort((a, b) => extrairTimestampHit(b._source || b) - extrairTimestampHit(a._source || a));

    if (hitsOrdenados.length === 0) {
        return null;
    }

    const principal = hitsOrdenados[0]._source || hitsOrdenados[0];
    const instanciasEncontradas = new Set();
    const movimentacoes = [];

    for (const hit of hitsOrdenados) {
        const src = hit._source || hit;
        const instanciaHit = normalizarGrauParaInstancia(src.grau, parsed.instancia_sugerida || '1G');
        instanciasEncontradas.add(instanciaHit);

        const movs = Array.isArray(src.movimentos) ? src.movimentos : [];
        for (const mov of movs) {
            if (!mov) continue;
            movimentacoes.push({
                instancia: instanciaHit,
                data_movimentacao: mov.dataHora || src.dataAjuizamento || new Date().toISOString(),
                codigo_cnj: (mov.codigo !== undefined && mov.codigo !== null && !isNaN(Number(mov.codigo)))
                    ? Number(mov.codigo)
                    : null,
                titulo: formatarTituloMovimentacao(mov),
                teor_completo: null,
                fonte_captura: 'DATAJUD',
                possui_anexo: false,
                documentos_vinculados: []
            });
        }
    }

    movimentacoes.sort((a, b) => new Date(b.data_movimentacao).getTime() - new Date(a.data_movimentacao).getTime());

    let instanciaProcesso = parsed.instancia_sugerida || '1G';
    if (instanciasEncontradas.has('1G') && instanciasEncontradas.has('2G')) {
        instanciaProcesso = 'AMBAS';
    } else if (instanciasEncontradas.size > 0) {
        instanciaProcesso = [...instanciasEncontradas][0];
    }

    const assuntosRaw = Array.isArray(principal.assuntos) ? principal.assuntos.flat() : [];
    const assuntosUnicos = [...new Set(assuntosRaw.map(a => a?.nome && String(a.nome).trim()).filter(Boolean))];

    return {
        numero_cnj: numeroLimpo,
        tribunal_sigla: tribunalSigla,
        instancia: instanciaProcesso,
        sistema_processual: normalizarSistemaProcessual(principal.sistema?.nome, parsed.sistema_processual || 'PJE'),
        segredo_justica: Boolean(principal.nivelSigilo && Number(principal.nivelSigilo) > 0),
        fonte_captura: 'DATAJUD',
        capa: {
            classe_processual: principal.classe?.nome ? String(principal.classe.nome).trim().slice(0, 255) : null,
            assunto_principal: assuntosUnicos.length > 0 ? assuntosUnicos.join(', ').slice(0, 255) : null,
            orgao_julgador: principal.orgaoJulgador?.nome ? String(principal.orgaoJulgador.nome).trim().slice(0, 255) : null,
            valor_causa: null,
            data_distribuicao: principal.dataAjuizamento || null
        },
        partes: [],
        movimentacoes
    };
};

export const calcularDelayBackoffDatajudMs = (
    tentativaAtual,
    baseMs = BACKOFF_BASE_DATAJUD_MS,
    jitterMaxMs = 1000
) => {
    const exp = Math.max(1, Number(tentativaAtual) || 1);
    const jitter = jitterMaxMs > 0 ? Math.floor(Math.random() * jitterMaxMs) : 0;
    return baseMs * (2 ** exp) + jitter;
};

const classificarErroDatajud = (error, endpoint) => {
    const status = Number(error?.response?.status || error?.statusCode || 0);
    const code = String(error?.code || '').toUpperCase();
    const retryable = RETRYABLE_HTTP_STATUS.has(status) || RETRYABLE_NET_CODES.has(code);

    const err = new Error(error?.message || 'Erro ao consultar API pública do DataJud.');
    err.code = status ? `HTTP_${status}` : (code || 'DATAJUD_API_ERROR');
    err.statusCode = status ? String(status) : (code || 'DATAJUD_ERROR');
    err.retryable = retryable;
    err.endpoint = endpoint;
    err.cause = error;
    return err;
};

/**
 * Consulta a API Pública do DataJud (CNJ) usando filtro exato (`term`) e `_source` restrito,
 * tratando múltiplos graus e aplicando retry com backoff exponencial para erros 429 e 5xx.
 */
export const consultarProcessoDatajud = async (numeroProcesso, options = {}) => {
    const {
        tribunalOverride = null,
        exigirDigitoVerificador = false,
        timeoutMs = TIMEOUT_DATAJUD_MS,
        maxTentativas = MAX_TENTATIVAS_DATAJUD,
        backoffBaseMs = BACKOFF_BASE_DATAJUD_MS,
        jitterMaxMs = 1000,
        httpClient = axios,
        apiKey = process.env.DATAJUD_API_KEY || process.env.APIKEY
    } = options;

    const numeroLimpo = String(numeroProcesso || '').replace(/\D/g, '');
    const parsed = parseNumeroCNJ(numeroLimpo, { exigirDigitoVerificador });
    if (numeroLimpo.length !== 20 || (!tribunalOverride && !parsed.tribunal_legivel) || (exigirDigitoVerificador && !parsed.valido)) {
        const err = new Error(parsed.erro || 'Número do processo CNJ inválido para consulta no DataJud.');
        err.code = 'INVALID_CNJ';
        err.statusCode = '400';
        err.retryable = false;
        throw err;
    }

    const endpoint = resolverEndpointDatajud(numeroLimpo, tribunalOverride);
    if (!endpoint) {
        const err = new Error('Tribunal não possui endpoint público compatível na API do DataJud.');
        err.code = 'INVALID_COURT';
        err.statusCode = '400';
        err.retryable = false;
        throw err;
    }

    if (!apiKey) {
        const err = new Error('Chave DATAJUD_API_KEY não configurada no ambiente.');
        err.code = 'MISSING_API_KEY';
        err.statusCode = '401';
        err.retryable = false;
        throw err;
    }

    const queryPayload = construirQueryDatajud(numeroLimpo, 5);
    const totalTentativas = Math.max(1, Number(maxTentativas) || 1);
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= totalTentativas; tentativa++) {
        try {
            const response = await httpClient.post(
                endpoint,
                queryPayload,
                {
                    headers: {
                        'Authorization': apiKey,
                        'Content-Type': 'application/json'
                    },
                    timeout: timeoutMs
                }
            );

            const hits = response?.data?.hits?.hits || [];
            if (hits.length === 0) {
                return null;
            }

            return normalizarHitsDatajudParaDTO(hits, numeroLimpo, parsed.tribunal_sigla);
        } catch (rawError) {
            const erroClassificado = classificarErroDatajud(rawError, endpoint);
            ultimoErro = erroClassificado;

            if (erroClassificado.retryable && tentativa < totalTentativas) {
                const esperaMs = calcularDelayBackoffDatajudMs(tentativa, backoffBaseMs, jitterMaxMs);
                await new Promise(resolve => setTimeout(resolve, esperaMs));
                continue;
            }
            break;
        }
    }

    throw ultimoErro;
};

/**
 * Handler padrão para execução de jobs `DATAJUD` pelo ProcessSyncQueueWorker.
 */
export const executarJobDatajud = async (job, options = {}) => {
    const params = typeof job.parametros_json === 'string'
        ? JSON.parse(job.parametros_json)
        : (job.parametros_json || {});

    if (params?.dto) {
        return {
            dto: {
                ...params.dto,
                numero_cnj: params.dto.numero_cnj || job.numero_cnj,
                tribunal_sigla: params.dto.tribunal_sigla || job.tribunal_sigla,
                fonte_captura: 'DATAJUD'
            },
            status_sincronizacao: 'ATUALIZADO',
            codigo_http_ou_soap: '200'
        };
    }

    const dto = await consultarProcessoDatajud(job.numero_cnj, {
        maxTentativas: options.maxTentativas ?? 1,
        ...options
    });

    if (!dto) {
        return {
            dto: null,
            status_sincronizacao: 'ATUALIZADO',
            novas_movimentacoes_inseridas: 0,
            codigo_http_ou_soap: '200-NO-HITS'
        };
    }

    return {
        dto,
        status_sincronizacao: 'ATUALIZADO',
        codigo_http_ou_soap: '200'
    };
};

export const DatajudProvider = {
    TIMEOUT_DATAJUD_MS,
    MAX_TENTATIVAS_DATAJUD,
    BACKOFF_BASE_DATAJUD_MS,
    CAMPOS_SOURCE_DATAJUD,
    construirQueryDatajud,
    normalizarHitsDatajudParaDTO,
    calcularDelayBackoffDatajudMs,
    consultarProcessoDatajud,
    executarJobDatajud
};

export default DatajudProvider;
