import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import {
    DICIONARIO_ENDPOINTS_DATAJUD,
    calcularDigitoVerificadorCNJ,
    resolverEndpointDatajud
} from '../src/utils/cnjParser.js';
import {
    DatajudProvider,
    TIMEOUT_DATAJUD_MS,
    CAMPOS_SOURCE_DATAJUD,
    construirQueryDatajud,
    normalizarHitsDatajudParaDTO,
    consultarProcessoDatajud,
    calcularDelayBackoffDatajudMs
} from '../src/services/datajudProvider.js';
import { ProcessPersistenceService } from '../src/services/processPersistenceService.js';
import {
    enfileirarJobSincronizacao,
    dispararProcessamentoFila,
    registerSyncProvider,
    resetSyncProviders,
    encerrarQueueWorker,
    reativarQueueWorker
} from '../src/services/processSyncQueueWorker.js';

const ESCRITORIO_TESTE_F3 = 999003;

const gerarCnjValido = (seq, ano, j, tr, orig) => {
    const dd = calcularDigitoVerificadorCNJ(seq, ano, j, tr, orig);
    return `${String(seq).padStart(7, '0')}${dd}${ano}${j}${tr}${orig}`;
};

describe('FASE 3 — Roteamento J.TR, Query Otimizada, Múltiplos Graus TRF3 e Retry Exponencial', () => {
    before(async () => {
        reativarQueueWorker();
        await runMigrations(db);
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F3]);
    });

    after(async () => {
        encerrarQueueWorker();
        resetSyncProviders();
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F3]);
        await db.end();
    });

    it('mapeia corretamente o dicionário J.TR para endpoints DataJud (TRF3, TJSP, TRF1, TRT15)', () => {
        assert.equal(
            DICIONARIO_ENDPOINTS_DATAJUD['4.03'],
            'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search'
        );
        assert.equal(
            DICIONARIO_ENDPOINTS_DATAJUD['8.26'],
            'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search'
        );
        assert.equal(
            DICIONARIO_ENDPOINTS_DATAJUD['4.01'],
            'https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search'
        );
        assert.equal(
            DICIONARIO_ENDPOINTS_DATAJUD['5.15'],
            'https://api-publica.datajud.cnj.jus.br/api_publica_trt15/_search'
        );

        const cnjTrf3 = gerarCnjValido('5001234', '2025', '4', '03', '6100');
        assert.equal(
            resolverEndpointDatajud(cnjTrf3),
            'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search'
        );
        assert.equal(
            resolverEndpointDatajud(cnjTrf3, 'TRF-1'),
            'https://api-publica.datajud.cnj.jus.br/api_publica_trf1/_search'
        );
    });

    it('constrói query Elasticsearch bool.filter.term com _source enxuto e timeout de 15s', async () => {
        const cnjTrf3 = gerarCnjValido('5003333', '2025', '4', '03', '6100');
        const query = construirQueryDatajud(cnjTrf3);

        assert.equal(query.size, 5);
        assert.deepEqual(query._source, CAMPOS_SOURCE_DATAJUD);
        assert.deepEqual(query.query, {
            bool: {
                filter: [{ term: { numeroProcesso: cnjTrf3 } }]
            }
        });

        let capturedRequest = null;
        const mockHttp = {
            post: async (url, payload, config) => {
                capturedRequest = { url, payload, config };
                return { data: { hits: { hits: [] } } };
            }
        };

        const dto = await consultarProcessoDatajud(cnjTrf3, {
            httpClient: mockHttp,
            apiKey: 'APIKey TEST_KEY'
        });

        assert.equal(dto, null);
        assert.equal(capturedRequest.url, 'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search');
        assert.equal(capturedRequest.config.timeout, TIMEOUT_DATAJUD_MS);
        assert.equal(TIMEOUT_DATAJUD_MS, 15000);
        assert.equal(capturedRequest.config.headers.Authorization, 'APIKey TEST_KEY');
        assert.deepEqual(capturedRequest.payload.query.bool.filter, [{ term: { numeroProcesso: cnjTrf3 } }]);
    });

    it('normaliza hits G1 e G2 do TRF3 para DTO, grava no MySQL e garante zero duplicatas na 2ª sincronização', async () => {
        const cnjTrf3 = gerarCnjValido('5004444', '2025', '4', '03', '6100');

        const respostaDatajudTrf3 = {
            hits: {
                hits: [
                    {
                        _source: {
                            numeroProcesso: cnjTrf3,
                            grau: 'G1',
                            classe: { nome: 'PROCEDIMENTO COMUM CÍVEL' },
                            sistema: { nome: 'PJe' },
                            orgaoJulgador: { nome: '1ª Vara Federal Previdenciária de São Paulo' },
                            dataAjuizamento: '2025-02-10T11:15:00Z',
                            assuntos: [{ nome: 'Concessão de Benefício Previdenciário' }],
                            movimentos: [
                                {
                                    codigo: 26,
                                    nome: 'Distribuição',
                                    dataHora: '2025-02-10T11:16:00Z'
                                },
                                {
                                    codigo: 12200,
                                    nome: 'Intimação eletrônica expedida/certificada',
                                    dataHora: '2026-10-05T14:20:00Z',
                                    complementosTabelados: [{ nome: 'Prazo', descricao: '15 dias' }]
                                }
                            ]
                        }
                    },
                    {
                        _source: {
                            numeroProcesso: cnjTrf3,
                            grau: 'G2',
                            classe: { nome: 'APELAÇÃO CÍVEL' },
                            sistema: { nome: 'PJe' },
                            orgaoJulgador: { nome: '7ª Turma - TRF3' },
                            dataAjuizamento: '2026-11-01T10:00:00Z',
                            assuntos: [{ nome: 'Concessão de Benefício Previdenciário' }],
                            movimentos: [
                                {
                                    codigo: 51,
                                    nome: 'Conclusos para julgamento',
                                    dataHora: '2026-11-12T16:30:00Z'
                                }
                            ]
                        }
                    }
                ]
            }
        };

        let chamadasWorker = 0;
        const mockHttp = {
            post: async () => {
                chamadasWorker++;
                return { data: respostaDatajudTrf3 };
            }
        };

        // Sanity check direto no normalizador multi-grau
        const dtoDireto = normalizarHitsDatajudParaDTO(respostaDatajudTrf3.hits.hits, cnjTrf3);
        assert.equal(dtoDireto.tribunal_sigla, 'TRF3');
        assert.equal(dtoDireto.instancia, 'AMBAS');
        assert.equal(dtoDireto.sistema_processual, 'PJE');
        assert.equal(dtoDireto.movimentacoes.length, 3);
        assert.equal(dtoDireto.movimentacoes[0].instancia, '2G');
        assert.equal(dtoDireto.movimentacoes[1].instancia, '1G');
        assert.match(dtoDireto.movimentacoes[1].titulo, /15 dias/);

        registerSyncProvider('DATAJUD', (job) =>
            DatajudProvider.executarJobDatajud(job, { httpClient: mockHttp, apiKey: 'APIKey MOCK_TRF3' })
        );

        const { processo } = await ProcessPersistenceService.garantirProcessoBase({
            escritorio_id: ESCRITORIO_TESTE_F3,
            numero_cnj: cnjTrf3
        });

        // 1ª Sincronização via Worker DatajudProvider
        const job1 = await enfileirarJobSincronizacao({
            processo_id: processo.id,
            fonte_utilizada: 'DATAJUD',
            dispararWorker: false
        });
        dispararProcessamentoFila();

        let status1 = null;
        for (let i = 0; i < 60; i++) {
            status1 = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(processo.id);
            if (status1?.ultimo_job?.id === job1.job_id && status1.ultimo_job.status === 'SUCESSO') break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(chamadasWorker, 1);
        assert.equal(status1.processo.instancia, 'AMBAS');
        assert.equal(status1.processo.status_sincronizacao, 'ATUALIZADO');
        assert.equal(status1.ultimo_job.novas_movimentacoes_inseridas, 3);
        assert.equal(status1.total_movimentacoes, 3);

        // 2ª Sincronização idêntica: deve gravar ZERO duplicatas
        const job2 = await enfileirarJobSincronizacao({
            processo_id: processo.id,
            fonte_utilizada: 'DATAJUD',
            dispararWorker: false
        });
        dispararProcessamentoFila();

        let status2 = null;
        for (let i = 0; i < 60; i++) {
            status2 = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(processo.id);
            if (status2?.ultimo_job?.id === job2.job_id && status2.ultimo_job.status === 'SUCESSO') break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(chamadasWorker, 2);
        assert.equal(status2.ultimo_job.novas_movimentacoes_inseridas, 0);
        assert.equal(status2.total_movimentacoes, 3);
    });

    it('aplica política de retry com backoff exponencial + jitter para HTTP 429 e 5xx', async () => {
        // Verifica fórmula t = 5000 * 2^n + jitter(0..1000)
        const d1 = calcularDelayBackoffDatajudMs(1, 5000, 1000);
        const d2 = calcularDelayBackoffDatajudMs(2, 5000, 1000);
        assert.ok(d1 >= 10000 && d1 < 11000, `Backoff n=1 fora do intervalo: ${d1}`);
        assert.ok(d2 >= 20000 && d2 < 21000, `Backoff n=2 fora do intervalo: ${d2}`);

        const cnjTrf3 = gerarCnjValido('5005555', '2025', '4', '03', '6100');
        let tentativas = 0;

        const mockHttpFlaky = {
            post: async () => {
                tentativas++;
                if (tentativas === 1) {
                    const err = new Error('Too Many Requests');
                    err.response = { status: 429 };
                    throw err;
                }
                if (tentativas === 2) {
                    const err = new Error('Service Unavailable');
                    err.response = { status: 503 };
                    throw err;
                }
                return {
                    data: {
                        hits: {
                            hits: [
                                {
                                    _source: {
                                        numeroProcesso: cnjTrf3,
                                        grau: 'G1',
                                        classe: { nome: 'MANDADO DE SEGURANÇA' },
                                        sistema: { nome: 'PJe' },
                                        orgaoJulgador: { nome: '2ª Vara Federal Cível de São Paulo' },
                                        dataAjuizamento: '2025-05-01T10:00:00Z',
                                        assuntos: [{ nome: 'Tributário' }],
                                        movimentos: []
                                    }
                                }
                            ]
                        }
                    }
                };
            }
        };

        const dto = await consultarProcessoDatajud(cnjTrf3, {
            httpClient: mockHttpFlaky,
            apiKey: 'APIKey TEST_RETRY',
            maxTentativas: 4,
            backoffBaseMs: 5,
            jitterMaxMs: 5
        });

        assert.equal(tentativas, 3);
        assert.equal(dto.tribunal_sigla, 'TRF3');
        assert.equal(dto.capa.classe_processual, 'MANDADO DE SEGURANÇA');

        // Confirma erro retryable propagado quando todas as tentativas falham com 429
        const mockHttpAlways429 = {
            post: async () => {
                const err = new Error('Still 429');
                err.response = { status: 429 };
                throw err;
            }
        };

        await assert.rejects(
            () => consultarProcessoDatajud(cnjTrf3, {
                httpClient: mockHttpAlways429,
                apiKey: 'APIKey TEST_RETRY',
                maxTentativas: 2,
                backoffBaseMs: 5,
                jitterMaxMs: 0
            }),
            (err) => err.retryable === true && err.statusCode === '429'
        );
    });
});
