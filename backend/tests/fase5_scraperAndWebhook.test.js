import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import { calcularDigitoVerificadorCNJ } from '../src/utils/cnjParser.js';
import { CourtScraperProvider } from '../src/services/courtScraperProvider.js';
import { ProcessPersistenceService } from '../src/services/processPersistenceService.js';
import {
    enfileirarJobSincronizacao,
    dispararProcessamentoFila,
    registerSyncProvider,
    resetSyncProviders,
    encerrarQueueWorker,
    reativarQueueWorker
} from '../src/services/processSyncQueueWorker.js';
import { webhookProcessoController } from '../src/controllers/webhookProcessoController.js';
import webhooksRouter from '../src/routes/webhooks.js';

const ESCRITORIO_TESTE_F5 = 999005;

const gerarCnjValido = (seq, ano, j, tr, orig) => {
    const dd = calcularDigitoVerificadorCNJ(seq, ano, j, tr, orig);
    return `${String(seq).padStart(7, '0')}${dd}${ano}${j}${tr}${orig}`;
};

describe('FASE 5 — Scraper Playwright Fallback (PJe TRF3 / e-SAJ TJSP) e Webhook HMAC', () => {
    let tempDiagDir;
    let appServer;
    let baseUrl;

    const htmlMockEsajTjsp = `
        <html>
            <body>
                <span id="classeProcesso">Execução de Título Extrajudicial</span>
                <span id="assuntoProcesso">Duplicata</span>
                <span id="varaProcesso">15ª Vara Cível - Foro Central Cível</span>
                <div id="dataHoraDistribuicaoProcesso">10/03/2026 às 14:20</div>
                <div id="valorAcaoProcesso">R$ 45.200,00</div>
                <table id="tablePartesPrincipais">
                    <tr><td>Reqte:</td><td>COMERCIAL PAULISTA LTDA Advogado: Dr. Marcos Oliveira</td></tr>
                    <tr><td>Reqdo:</td><td>BETA DISTRIBUIDORA S/A</td></tr>
                </table>
                <table id="tabelaTodasMovimentacoes">
                    <tr class="containerMovimentacao">
                        <td>12/11/2026</td>
                        <td>Certidão de Publicação Expedida - Relação nº 0412/2026 disponível no DJE.</td>
                    </tr>
                </table>
            </body>
        </html>
    `;

    const htmlMockPjeTrf3 = `
        <html>
            <body>
                <dl>
                    <dt><label>Classe Judicial</label></dt><dd>PROCEDIMENTO COMUM CÍVEL</dd>
                    <dt><label>Assunto</label></dt><dd>Auxílio por Incapacidade Temporária</dd>
                    <dt><label>Órgão Julgador</label></dt><dd>3ª Vara Federal de Campinas</dd>
                    <dt><label>Data de Distribuição</label></dt><dd>05/04/2026 09:30:00</dd>
                </dl>
                <table>
                    <tr class="parte-row"><td>POLO ATIVO</td><td>CARLOS EDUARDO</td><td>11122233344</td></tr>
                    <tr class="parte-row"><td>POLO PASSIVO</td><td>INSS</td><td>29979036000140</td></tr>
                    <tr class="movimento-row">
                        <td>16/11/2026 15:10:00</td>
                        <td>Juntada de Contestação</td>
                        <td>Contestação apresentada pela Procuradoria Federal com documentos anexos.</td>
                    </tr>
                </table>
            </body>
        </html>
    `;

    before(async () => {
        reativarQueueWorker();
        await runMigrations(db);
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F5]);
        await db.query('DELETE FROM credenciais_tribunal WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F5]);

        tempDiagDir = await fs.mkdtemp(path.join(os.tmpdir(), 'advdocs-fase5-diag-'));

        const app = express();
        app.use('/api/webhooks', webhooksRouter);

        await new Promise((resolve) => {
            appServer = app.listen(0, '127.0.0.1', () => {
                const { port } = appServer.address();
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        encerrarQueueWorker();
        resetSyncProviders();
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F5]);
        if (tempDiagDir) {
            await fs.rm(tempDiagDir, { recursive: true, force: true });
        }
        if (appServer) {
            await new Promise((resolve) => appServer.close(resolve));
        }
        await db.end();
    });

    it('valida TOTP 2FA (Node <-> Python), parsers PJe TRF3 / e-SAJ TJSP e captura diagnóstica em erro de seletor', async () => {
        const seed = 'JBSWY3DPEHPK3PXP';
        const fixedEpochSec = 1700000010;
        const totpNode = CourtScraperProvider.gerarTokenTotp(seed, fixedEpochSec * 1000);

        const totpPython = execFileSync('python', [
            '-c',
            [
                'import sys',
                'sys.path.insert(0, "backend/workers")',
                'from court_scrapers import generate_totp_token, BaseCourtScraper, BLOCKED_RESOURCE_TYPES',
                `print(generate_totp_token("${seed}", for_time=${fixedEpochSec}), sorted(list(BLOCKED_RESOURCE_TYPES)))`
            ].join('; ')
        ], { encoding: 'utf8' }).trim();

        assert.equal(totpPython, `${totpNode} ['font', 'image', 'media']`);

        const cnjTjsp = gerarCnjValido('1005555', '2026', '8', '26', '0100');
        const dtoEsaj = CourtScraperProvider.parsearHtmlEsajTjspParaDTO(htmlMockEsajTjsp, {
            numero_cnj: cnjTjsp,
            instancia: '1G'
        });

        assert.equal(dtoEsaj.tribunal_sigla, 'TJSP');
        assert.equal(dtoEsaj.sistema_processual, 'ESAJ');
        assert.equal(dtoEsaj.capa.classe_processual, 'Execução de Título Extrajudicial');
        assert.equal(dtoEsaj.capa.valor_causa, 45200);
        assert.equal(dtoEsaj.partes.length, 2);
        assert.equal(dtoEsaj.partes[0].advogados[0].nome, 'Dr. Marcos Oliveira');
        assert.equal(dtoEsaj.movimentacoes[0].fonte_captura, 'SCRAPER');

        // Simula erro de seletor com captura automática de arquivo de diagnóstico
        await assert.rejects(
            () => CourtScraperProvider.executarScraperFallback({
                numero_cnj: cnjTjsp,
                tribunal_sigla: 'TJSP',
                htmlMock: '<html><body><div>Layout inesperado</div></body></html>',
                storageBaseDir: tempDiagDir
            }),
            (err) => err.code === 'SCRAPER_SELECTOR_ERROR'
        );

        const arquivosDiag = await fs.readdir(tempDiagDir);
        assert.ok(arquivosDiag.some(f => f.endsWith('.json') && f.startsWith('TJSP_')));
        assert.ok(arquivosDiag.some(f => f.endsWith('.html') && f.startsWith('TJSP_')));
    });

    it('aciona fallback automático para SCRAPER quando tribunal não suporta MNI (TJSP) e quando TRF3 não possui A1', async () => {
        resetSyncProviders();
        const cnjTjsp = gerarCnjValido('1008888', '2026', '8', '26', '0100');
        const cnjTrf3 = gerarCnjValido('5008888', '2026', '4', '03', '6100');

        // Registra executor HTTP mockado no fallback SCRAPER sem substituir o roteamento MNI->SCRAPER do worker
        registerSyncProvider('SCRAPER', (job) => {
            const html = job.tribunal_sigla === 'TJSP' ? htmlMockEsajTjsp : htmlMockPjeTrf3;
            return CourtScraperProvider.executarJobScraper(job, {
                htmlMock: html,
                storageBaseDir: tempDiagDir
            });
        });

        // 1) TJSP não suporta MNI TRF3 -> worker deve desviar automaticamente para SCRAPER
        const { processo: procTjsp } = await ProcessPersistenceService.garantirProcessoBase({
            escritorio_id: ESCRITORIO_TESTE_F5,
            numero_cnj: cnjTjsp
        });

        const jobTjsp = await enfileirarJobSincronizacao({
            processo_id: procTjsp.id,
            fonte_utilizada: 'MNI',
            dispararWorker: false
        });
        dispararProcessamentoFila();

        let statusTjsp = null;
        for (let i = 0; i < 60; i++) {
            statusTjsp = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(procTjsp.id);
            if (statusTjsp?.ultimo_job?.id === jobTjsp.job_id && statusTjsp.ultimo_job.status === 'SUCESSO') break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(statusTjsp.ultimo_job.status, 'SUCESSO');
        assert.equal(statusTjsp.ultimo_job.fonte_utilizada, 'SCRAPER');
        assert.equal(statusTjsp.processo.status_sincronizacao, 'ATUALIZADO');
        assert.equal(statusTjsp.processo.sistema_processual, 'ESAJ');
        assert.equal(statusTjsp.movimentacoes[0].fonte_captura, 'SCRAPER');
        assert.equal(statusTjsp.partes.length, 2);

        // 2) TRF3 sem Certificado A1 no escritorio -> MNI falha com MISSING_CERTIFICATE_A1 -> fallback automático PJe Consulta Pública
        const { processo: procTrf3 } = await ProcessPersistenceService.garantirProcessoBase({
            escritorio_id: ESCRITORIO_TESTE_F5,
            numero_cnj: cnjTrf3
        });

        const jobTrf3 = await enfileirarJobSincronizacao({
            processo_id: procTrf3.id,
            fonte_utilizada: 'MNI',
            dispararWorker: false
        });
        dispararProcessamentoFila();

        let statusTrf3 = null;
        for (let i = 0; i < 60; i++) {
            statusTrf3 = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(procTrf3.id);
            if (statusTrf3?.ultimo_job?.id === jobTrf3.job_id && statusTrf3.ultimo_job.status === 'SUCESSO') break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(statusTrf3.ultimo_job.fonte_utilizada, 'SCRAPER');
        assert.equal(statusTrf3.processo.tribunal_sigla, 'TRF3');
        assert.equal(statusTrf3.processo.capa?.classe_processual ?? statusTrf3.processo.classe_processual, 'PROCEDIMENTO COMUM CÍVEL');
        assert.match(statusTrf3.movimentacoes[0].teor_completo, /Procuradoria Federal/);
    });

    it('POST /api/webhooks/processos autentica HMAC-SHA256, persiste com WEBHOOK_EXTERNO e rejeita assinatura inválida', async () => {
        const cnjTrf3 = gerarCnjValido('5009123', '2026', '4', '03', '6100');
        const payloadObj = {
            escritorio_id: ESCRITORIO_TESTE_F5,
            numero_cnj: cnjTrf3,
            tribunal_sigla: 'TRF3',
            instancia: '1G',
            sistema_processual: 'PJE',
            capa: {
                classe_processual: 'CUMPRIMENTO DE SENTENÇA CONTRA A FAZENDA PÚBLICA',
                assunto_principal: 'Precatório Federal',
                orgao_julgador: '4ª Vara Federal Cível de São Paulo',
                valor_causa: 120000
            },
            partes: [
                { polo: 'ATIVO', tipo_participacao: 'EXEQUENTE', nome: 'FERNANDO COSTA', documento_cpf_cnpj: '44455566677' }
            ],
            movimentacoes: [
                {
                    instancia: '1G',
                    data_movimentacao: '2026-11-17T10:15:00Z',
                    codigo_cnj: 85,
                    titulo: 'Expedição de Requisição de Pequeno Valor - RPV',
                    teor_completo: 'Ofício requisitório expedido ao TRF3 para pagamento.'
                }
            ]
        };

        const rawJson = JSON.stringify(payloadObj);

        // 1) Sem assinatura -> 401
        const unauthResp = await fetch(`${baseUrl}/api/webhooks/processos`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rawJson
        });
        assert.equal(unauthResp.status, 401);

        // 2) Assinatura adulterada -> 401
        const badSigResp = await fetch(`${baseUrl}/api/webhooks/processos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': 'sha256=0000000000000000000000000000000000000000000000000000000000000000'
            },
            body: rawJson
        });
        assert.equal(badSigResp.status, 401);

        // 3) Assinatura HMAC válida -> 200 OK e persistência idempotente
        const assinaturaHex = webhookProcessoController.calcularAssinaturaHmacWebhook(rawJson);
        const okResp = await fetch(`${baseUrl}/api/webhooks/processos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${assinaturaHex}`
            },
            body: rawJson
        });
        const okBody = await okResp.json();

        assert.equal(okResp.status, 200);
        assert.equal(okBody.tribunal_sigla, 'TRF3');
        assert.equal(okBody.novas_movimentacoes_inseridas, 1);

        const status = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(okBody.processo_id);
        assert.equal(status.ultimo_job.fonte_utilizada, 'WEBHOOK_EXTERNO');
        assert.equal(status.movimentacoes[0].fonte_captura, 'WEBHOOK_EXTERNO');

        // 4) Reenvio idempotente -> 0 duplicatas
        const retryResp = await fetch(`${baseUrl}/api/webhooks/processos`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Webhook-Signature': `sha256=${assinaturaHex}`
            },
            body: rawJson
        });
        const retryBody = await retryResp.json();
        assert.equal(retryResp.status, 200);
        assert.equal(retryBody.novas_movimentacoes_inseridas, 0);
    });
});
