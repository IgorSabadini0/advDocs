import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import express from 'express';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import {
    CNJParser,
    ENDPOINTS_TRF3,
    calcularDigitoVerificadorCNJ,
    validarDigitoVerificadorCNJ,
    parseNumeroCNJ
} from '../src/utils/cnjParser.js';
import { CredentialVaultService } from '../src/services/credentialVaultService.js';
import {
    ProcessHashGenerator,
    gerarHashMovimentacao,
    gerarHashParte,
    gerarHashCapa
} from '../src/utils/processHashGenerator.js';
import { ProcessPersistenceService } from '../src/services/processPersistenceService.js';
import {
    ProcessSyncQueueWorker,
    enfileirarJobSincronizacao,
    dispararProcessamentoFila,
    registerSyncProvider,
    resetSyncProviders,
    encerrarQueueWorker,
    reativarQueueWorker
} from '../src/services/processSyncQueueWorker.js';
import processosRouter from '../src/routes/processos.js';

const ESCRITORIO_TESTE_ID = 999001;

const construirNumeroCNJValido = (sequencial7, ano4, j1, tr2, origem4) => {
    const dd = calcularDigitoVerificadorCNJ(sequencial7, ano4, j1, tr2, origem4);
    const num = `${String(sequencial7).padStart(7, '0')}-${dd}.${String(ano4).padStart(4, '0')}.${j1}.${String(tr2).padStart(2, '0')}.${String(origem4).padStart(4, '0')}`;
    return num;
};

describe('FASE 1 — Parser CNJ (TRF3 + Módulo 97), Cofre AES-256-GCM e Hash SHA-256', () => {
    it('valida dígito verificador Módulo 97 e identifica corretamente TRF3 (1G e 2G) e demais tribunais', () => {
        const cnjTrf3_1G = construirNumeroCNJValido('5001234', '2025', '4', '03', '6100');
        const parsed1G = parseNumeroCNJ(cnjTrf3_1G);

        assert.equal(parsed1G.valido, true);
        assert.equal(parsed1G.digitoVerificadorValido, true);
        assert.equal(parsed1G.justica_codigo, '4');
        assert.equal(parsed1G.tribunal_codigo, '03');
        assert.equal(parsed1G.tribunal_sigla, 'TRF3');
        assert.equal(parsed1G.alias_datajud, 'trf3');
        assert.equal(parsed1G.sistema_processual, 'PJE');
        assert.equal(parsed1G.instancia_sugerida, '1G');
        assert.equal(parsed1G.is_trf3, true);
        assert.deepEqual(parsed1G.endpoints, ENDPOINTS_TRF3);

        const cnjTrf3_2G = construirNumeroCNJValido('0012345', '2024', '4', '03', '0000');
        const parsed2G = CNJParser.parse(cnjTrf3_2G);
        assert.equal(parsed2G.valido, true);
        assert.equal(parsed2G.tribunal_sigla, 'TRF3');
        assert.equal(parsed2G.instancia_sugerida, '2G');
        assert.equal(parsed2G.is_trf3, true);

        const cnjTjsp = construirNumeroCNJValido('1001229', '2025', '8', '26', '0363');
        const parsedTjsp = parseNumeroCNJ(cnjTjsp);
        assert.equal(parsedTjsp.valido, true);
        assert.equal(parsedTjsp.tribunal_sigla, 'TJSP');
        assert.equal(parsedTjsp.sistema_processual, 'ESAJ');
        assert.equal(parsedTjsp.is_trf3, false);

        const cnjTrf1 = construirNumeroCNJValido('1004567', '2025', '4', '01', '3400');
        assert.equal(parseNumeroCNJ(cnjTrf1).tribunal_sigla, 'TRF1');

        const cnjTrt15 = construirNumeroCNJValido('0010234', '2024', '5', '15', '0001');
        assert.equal(parseNumeroCNJ(cnjTrt15).tribunal_sigla, 'TRT15');

        // Altera último dígito para quebrar o dígito verificador Módulo 97
        const digitosInvalidos = `${parsed1G.numero_cnj.slice(0, 19)}${parsed1G.numero_cnj.slice(19) === '9' ? '8' : '9'}`;
        assert.equal(validarDigitoVerificadorCNJ(digitosInvalidos), false);
        const parsedInvalido = parseNumeroCNJ(digitosInvalidos);
        assert.equal(parsedInvalido.valido, false);
        assert.equal(parsedInvalido.digitoVerificadorValido, false);
    });

    it('criptografa e descriptografa .pfx binário e credenciais JSON com AES-256-GCM e detecta adulteração', () => {
        const masterKeyHex = crypto.randomBytes(32).toString('hex');
        const pfxSimulado = Buffer.from([0x30, 0x82, 0x0a, 0x11, 0x02, 0x01, 0x03, 0xaa, 0xbb, 0xcc]);

        const cifradoPfx = CredentialVaultService.encrypt(pfxSimulado, masterKeyHex);
        assert.equal(Buffer.isBuffer(cifradoPfx.payload_criptografado), true);
        assert.equal(cifradoPfx.iv_hex.length, 24);
        assert.equal(cifradoPfx.auth_tag_hex.length, 32);

        const pfxRecuperado = CredentialVaultService.decrypt(cifradoPfx, {
            asBuffer: true,
            masterKeyOverride: masterKeyHex
        });
        assert.equal(Buffer.compare(pfxRecuperado, pfxSimulado), 0);

        const creds = { cpf: '12345678901', senha: 'SegredoPJe#2026', totp_seed: 'JBSWY3DPEHPK3PXP' };
        const cifradoJson = CredentialVaultService.encryptCredentialsJson(creds, masterKeyHex);
        const jsonRecuperado = CredentialVaultService.decryptCredentialsJson(cifradoJson, masterKeyHex);
        assert.deepEqual(jsonRecuperado, creds);

        // Tamper detection na auth_tag_hex
        const tamperedTag = `${cifradoJson.auth_tag_hex.slice(0, -1)}${cifradoJson.auth_tag_hex.endsWith('a') ? 'b' : 'a'}`;
        assert.throws(() => {
            CredentialVaultService.decryptCredentialsJson(
                { ...cifradoJson, auth_tag_hex: tamperedTag },
                masterKeyHex
            );
        });
    });

    it('gera hash SHA-256 idempotente para movimentações equivalentes e partes normalizadas', () => {
        const hash1 = gerarHashMovimentacao({
            processo_id: 42,
            instancia: '1G',
            data_movimentacao: '2026-11-16T09:15:00Z',
            codigo_cnj: 12200,
            titulo: '  Intimação   Eletrônica Expedida/Certificada '
        });
        const hash2 = ProcessHashGenerator.gerarHashMovimentacao({
            processo_id: 42,
            instancia: '1g',
            data_movimentacao: '2026-11-16T21:40:00Z',
            codigo_cnj: 12200,
            titulo: 'intimacao eletronica expedida/certificada'
        });

        assert.equal(hash1.length, 64);
        assert.equal(hash1, hash2);

        const hashOutroDia = gerarHashMovimentacao({
            processo_id: 42,
            instancia: '1G',
            data_movimentacao: '2026-11-17T09:15:00Z',
            codigo_cnj: 12200,
            titulo: 'Intimação Eletrônica Expedida/Certificada'
        });
        assert.notEqual(hash1, hashOutroDia);

        const hashParteA = gerarHashParte({
            polo: 'ATIVO',
            tipo_participacao: 'Autor',
            nome: 'João   da Silva',
            documento_cpf_cnpj: '123.456.789-00'
        });
        const hashParteB = gerarHashParte({
            polo: 'ativo',
            tipo_participacao: 'autor',
            nome: 'joao da silva',
            documento_cpf_cnpj: '12345678900'
        });
        assert.equal(hashParteA, hashParteB);

        const capaHash1 = gerarHashCapa({ classe_processual: 'PROCEDIMENTO COMUM CÍVEL', valor_causa: 75400 });
        const capaHash2 = gerarHashCapa({ classe_processual: 'procedimento comum civel', valor_causa: '75400.00' });
        assert.equal(capaHash1, capaHash2);
    });
});

describe('FASE 2 — Migrations MySQL, Persistência Idempotente, Worker Concorrente e Endpoints REST', () => {
    let app;
    let server;
    let baseUrl;

    before(async () => {
        reativarQueueWorker();
        await runMigrations(db);
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_ID]);

        app = express();
        app.use(express.json());
        app.use((req, _res, next) => {
            req.usuarioId = 1;
            next();
        });
        app.use('/api/processos', processosRouter);

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const { port } = server.address();
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });

        // Aquece fetch/keep-alive antes da medição de latência do endpoint
        await fetch(`${baseUrl}/api/processos/999999999/status-sincronizacao`);
    });

    after(async () => {
        encerrarQueueWorker();
        resetSyncProviders();
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_ID]);
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await db.end();
    });

    it('confirma criação das 6 tabelas no MySQL e idempotência com enriquecimento MNI sobre DataJud', async () => {
        const [tables] = await db.query('SHOW TABLES');
        const nomes = tables.map(r => Object.values(r)[0]);

        for (const esperada of [
            'processos',
            'processo_partes',
            'processo_movimentacoes',
            'processo_documentos',
            'credenciais_tribunal',
            'jobs_sincronizacao'
        ]) {
            assert.equal(nomes.includes(esperada), true, `Tabela ausente: ${esperada}`);
        }

        const cnjTrf3 = construirNumeroCNJValido('5001234', '2025', '4', '03', '6100');
        const numeroLimpo = cnjTrf3.replace(/\D/g, '');

        const dtoDatajud = {
            numero_cnj: numeroLimpo,
            tribunal_sigla: 'TRF3',
            instancia: '1G',
            sistema_processual: 'PJE',
            segredo_justica: false,
            capa: {
                classe_processual: 'PROCEDIMENTO COMUM CÍVEL',
                assunto_principal: 'Concessão de Benefício Previdenciário',
                orgao_julgador: '1ª Vara Federal Previdenciária de São Paulo',
                valor_causa: 75400.00,
                data_distribuicao: '2025-02-10T11:15:00Z'
            },
            partes: [
                {
                    polo: 'ATIVO',
                    tipo_participacao: 'AUTOR',
                    nome: 'JOÃO DA SILVA',
                    documento_cpf_cnpj: '12345678900',
                    advogados: [{ nome: 'ADVOGADO DO ESCRITÓRIO', oab: '999999', uf: 'SP' }]
                },
                {
                    polo: 'PASSIVO',
                    tipo_participacao: 'RÉU',
                    nome: 'INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS',
                    documento_cpf_cnpj: '29979036000140',
                    advogados: []
                }
            ],
            movimentacoes: [
                {
                    instancia: '1G',
                    data_movimentacao: '2026-11-16T08:00:00Z',
                    codigo_cnj: 12200,
                    titulo: 'Intimação eletrônica expedida/certificada',
                    teor_completo: null,
                    fonte_captura: 'DATAJUD',
                    documentos_vinculados: []
                }
            ]
        };

        // 1ª gravação: DATAJUD (sem teor_completo)
        const r1 = await ProcessPersistenceService.persistirProcessoDTO(dtoDatajud, { escritorio_id: ESCRITORIO_TESTE_ID });
        assert.equal(r1.novas_movimentacoes_inseridas, 1);

        // 2ª gravação repetida: deve garantir zero duplicatas
        const r2 = await ProcessPersistenceService.persistirProcessoDTO(dtoDatajud, { escritorio_id: ESCRITORIO_TESTE_ID });
        assert.equal(r2.novas_movimentacoes_inseridas, 0);

        // 3ª gravação via MNI na mesma movimentação: enriquece teor_completo + anexa documento sem duplicar
        const dtoMni = {
            ...dtoDatajud,
            movimentacoes: [
                {
                    instancia: '1G',
                    data_movimentacao: '2026-11-16T16:40:00Z',
                    codigo_cnj: 12200,
                    titulo: 'Intimação eletrônica expedida/certificada',
                    teor_completo: 'Intimação da parte autora para manifestação sobre o laudo pericial no prazo de 15 dias.',
                    fonte_captura: 'MNI',
                    documentos_vinculados: [
                        {
                            id_documento_tribunal: '319482719',
                            tipo_documento: 'Laudo Pericial',
                            descricao: 'Laudo Médico Judicial',
                            data_juntada: '2026-11-16T16:35:00Z',
                            mimetype: 'application/pdf'
                        }
                    ]
                }
            ]
        };

        const r3 = await ProcessPersistenceService.persistirProcessoDTO(dtoMni, { escritorio_id: ESCRITORIO_TESTE_ID });
        assert.equal(r3.novas_movimentacoes_inseridas, 0);

        const status = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(r1.processo_id);
        assert.equal(status.total_movimentacoes, 1);
        assert.equal(status.partes.length, 2);
        assert.equal(status.documentos.length, 1);
        assert.equal(status.movimentacoes[0].fonte_captura, 'MNI');
        assert.equal(Boolean(status.movimentacoes[0].possui_anexo), true);
        assert.match(status.movimentacoes[0].teor_completo, /laudo pericial/i);
    });

    it('POST /api/processos/sincronizar responde 202 Accepted em < 100ms e worker atualiza tabela processos', async () => {
        resetSyncProviders();
        const cnjTrf3Novo = construirNumeroCNJValido('5009999', '2026', '4', '03', '6100');

        // Valida rejeição de CNJ inválido (400) e ID inexistente (404) aquecendo o pipeline POST/JSON
        const badResp = await fetch(`${baseUrl}/api/processos/sincronizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ numero_cnj: '5001234-00.2025.4.03.6100' })
        });
        assert.equal(badResp.status, 400);

        const notFoundResp = await fetch(`${baseUrl}/api/processos/999999999/status-sincronizacao`);
        assert.equal(notFoundResp.status, 404);

        const inicioMs = performance.now();
        const resp = await fetch(`${baseUrl}/api/processos/sincronizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                escritorio_id: ESCRITORIO_TESTE_ID,
                numero_cnj: cnjTrf3Novo,
                parametros: {
                    dto: {
                        numero_cnj: cnjTrf3Novo.replace(/\D/g, ''),
                        tribunal_sigla: 'TRF3',
                        instancia: '1G',
                        sistema_processual: 'PJE',
                        capa: { classe_processual: 'PROCEDIMENTO COMUM CÍVEL' },
                        partes: [],
                        movimentacoes: []
                    }
                }
            })
        });
        const duracaoMs = performance.now() - inicioMs;
        const body = await resp.json();

        assert.equal(resp.status, 202);
        assert.ok(duracaoMs < 100, `Endpoint demorou ${duracaoMs.toFixed(1)}ms (esperado < 100ms)`);
        assert.ok(body.job_id > 0);
        assert.ok(body.processo_id > 0);
        assert.equal(body.tribunal_sigla, 'TRF3');

        // Aguarda worker consumir o job assíncrono
        let dadosStatus = null;
        for (let i = 0; i < 40; i++) {
            const statusResp = await fetch(`${baseUrl}/api/processos/${body.processo_id}/status-sincronizacao`);
            assert.equal(statusResp.status, 200);
            dadosStatus = await statusResp.json();
            if (dadosStatus.processo.status_sincronizacao === 'ATUALIZADO') {
                break;
            }
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(dadosStatus.processo.status_sincronizacao, 'ATUALIZADO');
        assert.equal(dadosStatus.ultimo_job.id, body.job_id);
        assert.equal(dadosStatus.ultimo_job.status, 'SUCESSO');
    });

    it('limita concorrência a no máximo 2 requisições simultâneas por tribunal (TRF3)', async () => {
        await db.query(
            "DELETE FROM jobs_sincronizacao WHERE status IN ('EM_FILA', 'PROCESSANDO', 'FALHA_TEMPORARIA') AND processo_id IN (SELECT id FROM processos WHERE escritorio_id = ?)",
            [ESCRITORIO_TESTE_ID]
        );

        let emExecucaoAtual = 0;
        let picoSimultaneo = 0;
        let totalExecutados = 0;

        registerSyncProvider('DATAJUD', async (job) => {
            emExecucaoAtual++;
            picoSimultaneo = Math.max(picoSimultaneo, emExecucaoAtual);
            await new Promise(r => setTimeout(r, 150));
            emExecucaoAtual--;
            totalExecutados++;
            return {
                status_sincronizacao: 'ATUALIZADO',
                novas_movimentacoes_inseridas: 0,
                codigo_http_ou_soap: '200'
            };
        });

        const processosIds = [];
        for (let i = 1; i <= 5; i++) {
            const cnj = construirNumeroCNJValido(`500200${i}`, '2026', '4', '03', '6100');
            const { processo } = await ProcessPersistenceService.garantirProcessoBase({
                escritorio_id: ESCRITORIO_TESTE_ID,
                numero_cnj: cnj
            });
            processosIds.push(processo.id);
        }

        await Promise.all(processosIds.map(pid => enfileirarJobSincronizacao({
            processo_id: pid,
            fonte_utilizada: 'DATAJUD',
            dispararWorker: false
        })));
        dispararProcessamentoFila();

        for (let i = 0; i < 80; i++) {
            if (totalExecutados === 5) break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(totalExecutados, 5);
        assert.ok(
            picoSimultaneo <= ProcessSyncQueueWorker.MAX_CONCORRENCIA_POR_TRIBUNAL,
            `Pico simultâneo foi ${picoSimultaneo}, deveria ser <= ${ProcessSyncQueueWorker.MAX_CONCORRENCIA_POR_TRIBUNAL}`
        );
        assert.equal(picoSimultaneo, 2);
        // Aguarda encerramento final da gravação do último job antes do after() fechar o pool
        await new Promise(r => setTimeout(r, 60));
    });
});
