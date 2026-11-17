import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import express from 'express';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import { calcularDigitoVerificadorCNJ } from '../src/utils/cnjParser.js';
import { ProcessMonitorScheduler } from '../src/services/processMonitorScheduler.js';
import { ProcessPersistenceService } from '../src/services/processPersistenceService.js';
import { MniTrf3Provider } from '../src/services/mniTrf3Provider.js';
import {
    registerSyncProvider,
    resetSyncProviders,
    encerrarQueueWorker,
    reativarQueueWorker
} from '../src/services/processSyncQueueWorker.js';
import credenciaisRouter from '../src/routes/credenciais.js';
import processosRouter from '../src/routes/processos.js';

const ESCRITORIO_TESTE_F6 = 999006;
const SENHA_PFX_F6 = 'Fase6Pass#2026';

const gerarCnjValido = (seq, ano, j, tr, orig) => {
    const dd = calcularDigitoVerificadorCNJ(seq, ano, j, tr, orig);
    return `${String(seq).padStart(7, '0')}${dd}${ano}${j}${tr}${orig}`;
};

describe('FASE 6 — Agendador Diário (Cron Noturno) e Fluxo Completo Ponta a Ponta (E2E)', () => {
    let tempDir;
    let pfxBuffer;
    let mniServer;
    let mniUrl;
    let apiServer;
    let apiBaseUrl;

    const pdfFake = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Title (Sentenca TRF3 E2E) >>\nendobj\n%%EOF\n', 'utf8');
    const cnjE2E = gerarCnjValido('5006666', '2026', '4', '03', '6100');

    before(async () => {
        reativarQueueWorker();
        await runMigrations(db);
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F6]);
        await db.query('DELETE FROM credenciais_tribunal WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F6]);

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'advdocs-fase6-'));

        const clientKey = path.join(tempDir, 'cli-key.pem');
        const clientCert = path.join(tempDir, 'cli-cert.pem');
        const clientPfx = path.join(tempDir, 'cli.pfx');
        const srvKey = path.join(tempDir, 'srv-key.pem');
        const srvCert = path.join(tempDir, 'srv-cert.pem');

        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', clientKey, '-out', clientCert,
            '-days', '365', '-nodes',
            '-subj', '/CN=DR ADVOGADO FASE6:98765432100/C=BR'
        ], { stdio: 'pipe' });

        execFileSync('openssl', [
            'pkcs12', '-export',
            '-out', clientPfx,
            '-inkey', clientKey,
            '-in', clientCert,
            '-passout', `pass:${SENHA_PFX_F6}`
        ], { stdio: 'pipe' });

        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', srvKey, '-out', srvCert,
            '-days', '365', '-nodes',
            '-subj', '/CN=127.0.0.1'
        ], { stdio: 'pipe' });

        pfxBuffer = await fs.readFile(clientPfx);
        const serverCertPem = await fs.readFile(srvCert);
        const serverKeyPem = await fs.readFile(srvKey);
        await fs.unlink(clientKey);
        await fs.unlink(clientCert);

        mniServer = https.createServer({
            key: serverKeyPem,
            cert: serverCertPem,
            requestCert: true,
            rejectUnauthorized: false
        }, (req, res) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                const bodyXml = Buffer.concat(chunks).toString('utf8');
                res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });

                if (bodyXml.includes('<tip:documento>888777</tip:documento>')) {
                    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:consultarProcessoResponse xmlns:ns2="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">
      <sucesso>true</sucesso>
      <processo>
        <tip:dadosBasicos numero="${cnjE2E}">
          <tip:documento idDocumento="888777" tipoDocumento="Sentença" mimetype="application/pdf">
            <tip:conteudo>${pdfFake.toString('base64')}</tip:conteudo>
          </tip:documento>
        </tip:dadosBasicos>
      </processo>
    </ns2:consultarProcessoResponse>
  </soap:Body>
</soap:Envelope>`);
                    return;
                }

                res.end(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:consultarProcessoResponse xmlns:ns2="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">
      <sucesso>true</sucesso>
      <processo>
        <tip:dadosBasicos numero="${cnjE2E}" descricaoClasse="MANDADO DE SEGURANÇA CÍVEL" dataAjuizamento="20260401100000">
          <tip:orgaoJulgador nomeOrgao="6ª Vara Federal Cível de São Paulo"/>
          <tip:assunto><tip:descricao>Liminares e Tutela</tip:descricao></tip:assunto>
          <tip:polo polo="AT">
            <tip:parte tipoParticipacao="IMPETRANTE"><tip:pessoa nome="EMPRESA E2E LTDA" numeroDocumentoPrincipal="11222333000144"/></tip:parte>
          </tip:polo>
          <tip:polo polo="PA">
            <tip:parte tipoParticipacao="IMPETRADO"><tip:pessoa nome="UNIÃO FEDERAL"/></tip:parte>
          </tip:polo>
          <tip:documento idDocumento="888777" tipoDocumento="Sentença" descricao="Sentença de Mérito" dataHora="2026-11-17T12:00:00Z" mimetype="application/pdf"/>
        </tip:dadosBasicos>
        <tip:movimento dataHora="2026-11-17T12:05:00Z">
          <tip:movimentoNacional codigoNacional="219" descricao="Julgado procedente o pedido"/>
          <tip:complemento>Segurança concedida em definitivo.</tip:complemento>
          <tip:idDocumentoVinculado>888777</tip:idDocumentoVinculado>
        </tip:movimento>
      </processo>
    </ns2:consultarProcessoResponse>
  </soap:Body>
</soap:Envelope>`);
            });
        });

        await new Promise((resolve) => {
            mniServer.listen(0, '127.0.0.1', () => {
                mniUrl = `https://127.0.0.1:${mniServer.address().port}/pje/intercomunicacao`;
                resolve();
            });
        });

        const app = express();
        app.use('/api/credenciais', (req, _res, next) => { req.usuarioId = 1; next(); }, express.json({ limit: '5mb' }), credenciaisRouter);
        app.use(express.json({ limit: '16kb' }));
        app.use((req, _res, next) => { req.usuarioId = 1; next(); });
        app.use('/api/processos', processosRouter);

        await new Promise((resolve) => {
            apiServer = app.listen(0, '127.0.0.1', () => {
                apiBaseUrl = `http://127.0.0.1:${apiServer.address().port}`;
                resolve();
            });
        });
    });

    after(async () => {
        ProcessMonitorScheduler.pararAgendadorMonitoramentoDiario();
        encerrarQueueWorker();
        resetSyncProviders();
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F6]);
        await db.query('DELETE FROM credenciais_tribunal WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F6]);
        if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
        if (mniServer) await new Promise((resolve) => mniServer.close(resolve));
        if (apiServer) await new Promise((resolve) => apiServer.close(resolve));
        await db.end();
    });

    it('Cron Job Noturno seleciona apenas processos > 24h ativos e distribui jobs com espaçamento', async () => {
        // Verifica cálculo do próximo agendamento para 02:00 AM
        const antesDas2h = new Date('2026-11-17T01:30:00');
        assert.equal(ProcessMonitorScheduler.calcularMsAteProximaExecucao(2, 0, antesDas2h), 30 * 60 * 1000);
        const depoisDas2h = new Date('2026-11-17T15:00:00');
        assert.equal(ProcessMonitorScheduler.calcularMsAteProximaExecucao(2, 0, depoisDas2h), 11 * 60 * 60 * 1000);

        // Sobe Certificado A1 para verificar seleção automática de fonte 'MNI' no cron para TRF3
        const certResp = await fetch(`${apiBaseUrl}/api/credenciais/certificado-a1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                escritorio_id: ESCRITORIO_TESTE_F6,
                tribunal_sigla: 'TRF3',
                pfx_base64: pfxBuffer.toString('base64'),
                senha: SENHA_PFX_F6
            })
        });
        assert.equal(certResp.status, 201);

        const cnjElegivel1 = gerarCnjValido('5001111', '2026', '4', '03', '6100');
        const cnjElegivel2 = gerarCnjValido('1002222', '2026', '8', '26', '0100');
        const cnjRecente = gerarCnjValido('5003333', '2026', '4', '03', '6100');
        const cnjInativo = gerarCnjValido('5004444', '2026', '4', '03', '6100');

        const { processo: p1 } = await ProcessPersistenceService.garantirProcessoBase({ escritorio_id: ESCRITORIO_TESTE_F6, numero_cnj: cnjElegivel1 });
        const { processo: p2 } = await ProcessPersistenceService.garantirProcessoBase({ escritorio_id: ESCRITORIO_TESTE_F6, numero_cnj: cnjElegivel2 });
        const { processo: p3 } = await ProcessPersistenceService.garantirProcessoBase({ escritorio_id: ESCRITORIO_TESTE_F6, numero_cnj: cnjRecente });
        const { processo: p4 } = await ProcessPersistenceService.garantirProcessoBase({
            escritorio_id: ESCRITORIO_TESTE_F6,
            numero_cnj: cnjInativo,
            monitoramento_ativo: false
        });

        await db.query('UPDATE processos SET ultima_sincronizacao_em = DATE_SUB(NOW(), INTERVAL 30 HOUR) WHERE id = ?', [p1.id]);
        await db.query('UPDATE processos SET ultima_sincronizacao_em = NULL WHERE id = ?', [p2.id]);
        await db.query('UPDATE processos SET ultima_sincronizacao_em = DATE_SUB(NOW(), INTERVAL 2 HOUR) WHERE id = ?', [p3.id]);
        await db.query('UPDATE processos SET ultima_sincronizacao_em = DATE_SUB(NOW(), INTERVAL 48 HOUR), monitoramento_ativo = FALSE WHERE id = ?', [p4.id]);

        const resultadoCron = await ProcessMonitorScheduler.executarVarreduraNoturnaMonitoramento({
            espacamentoSegundos: 15,
            escritorioId: ESCRITORIO_TESTE_F6,
            dispararWorker: false
        });

        assert.equal(resultadoCron.total_enfileirados, 2);
        const idsAgendados = resultadoCron.jobs.map(j => j.processo_id);
        assert.equal(idsAgendados.includes(p1.id), true);
        assert.equal(idsAgendados.includes(p2.id), true);
        assert.equal(idsAgendados.includes(p3.id), false);
        assert.equal(idsAgendados.includes(p4.id), false);

        const jobTrf3 = resultadoCron.jobs.find(j => j.processo_id === p1.id);
        const jobTjsp = resultadoCron.jobs.find(j => j.processo_id === p2.id);
        assert.equal(jobTrf3.fonte_utilizada, 'MNI');
        assert.equal(jobTjsp.fonte_utilizada, 'DATAJUD');
        assert.equal(resultadoCron.jobs[0].atraso_segundos, 0);
        assert.equal(resultadoCron.jobs[1].atraso_segundos, 15);
    });

    it('Fluxo Ponta a Ponta: sincroniza TRF3 MNI, consulta selo + não lidas, baixa e serve PDF, e marca como lidas', async () => {
        // Provider MNI conectado ao servidor loopback HTTPS mTLS e pasta tempDir
        registerSyncProvider('MNI', async (job) => {
            const params = typeof job.parametros_json === 'string'
                ? JSON.parse(job.parametros_json)
                : (job.parametros_json || {});

            if (job.tipo_job === 'DOWNLOAD_DOCUMENTO') {
                const download = await MniTrf3Provider.baixarDocumentoMniTrf3({
                    processo_id: job.processo_id,
                    documento_id: params.documento_id,
                    id_documento_tribunal: params.id_documento_tribunal,
                    numero_cnj: job.numero_cnj,
                    instancia: params.instancia || '1G',
                    escritorio_id: job.escritorio_id,
                    tribunal_sigla: job.tribunal_sigla,
                    storageBaseDir: tempDir,
                    endpointsCustom: { '1G': mniUrl, '2G': mniUrl },
                    rejectUnauthorized: false
                });
                return { dto: null, download, status_sincronizacao: 'ATUALIZADO', codigo_http_ou_soap: '200-MNI-DOC' };
            }

            const dto = await MniTrf3Provider.executarConsultaMniTrf3({
                numero_cnj: job.numero_cnj,
                instancia: '1G',
                escritorio_id: job.escritorio_id,
                tribunal_sigla: job.tribunal_sigla,
                endpointsCustom: { '1G': mniUrl, '2G': mniUrl },
                rejectUnauthorized: false
            });
            return { dto, status_sincronizacao: 'ATUALIZADO', codigo_http_ou_soap: '200-MNI' };
        });

        // 1) Dispara sincronização "Atualizar Agora" (POST /api/processos/sincronizar)
        const syncResp = await fetch(`${apiBaseUrl}/api/processos/sincronizar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                escritorio_id: ESCRITORIO_TESTE_F6,
                numero_cnj: cnjE2E,
                fonte: 'MNI'
            })
        });
        assert.equal(syncResp.status, 202);
        const syncBody = await syncResp.json();

        // 2) Consulta endpoint por CNJ (usado pelo modal/tela de consulta do advDocs)
        let statusCnj = null;
        for (let i = 0; i < 60; i++) {
            const r = await fetch(`${apiBaseUrl}/api/processos/cnj/${cnjE2E}/status-sincronizacao?escritorio_id=${ESCRITORIO_TESTE_F6}`);
            assert.equal(r.status, 200);
            statusCnj = await r.json();
            if (statusCnj.processo?.status_sincronizacao === 'ATUALIZADO') break;
            await new Promise(res => setTimeout(res, 25));
        }

        assert.equal(statusCnj.processo.status_sincronizacao, 'ATUALIZADO');
        assert.equal(statusCnj.nao_lidos, 1);
        assert.equal(statusCnj.documentos.length, 1);
        assert.equal(statusCnj.documentos[0].id_documento_tribunal, '888777');

        // 3) Solicita "Baixar PDF" via endpoint e depois baixa o arquivo servido em GET .../arquivo
        const dlResp = await fetch(`${apiBaseUrl}/api/processos/${syncBody.processo_id}/documentos/${statusCnj.documentos[0].id}/baixar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instancia: '1G' })
        });
        assert.equal(dlResp.status, 202);
        const dlBody = await dlResp.json();

        for (let i = 0; i < 60; i++) {
            const r = await fetch(`${apiBaseUrl}/api/processos/${syncBody.processo_id}/status-sincronizacao`);
            const s = await r.json();
            if (s.ultimo_job?.id === dlBody.job_id && s.ultimo_job.status === 'SUCESSO') break;
            await new Promise(res => setTimeout(res, 25));
        }

        const pdfResp = await fetch(`${apiBaseUrl}/api/processos/${syncBody.processo_id}/documentos/${statusCnj.documentos[0].id}/arquivo`);
        assert.equal(pdfResp.status, 200);
        assert.match(pdfResp.headers.get('content-type') || '', /application\/pdf/);
        const pdfBytesRecebidos = Buffer.from(await pdfResp.arrayBuffer());
        assert.equal(Buffer.compare(pdfBytesRecebidos, pdfFake), 0);

        // 4) Advogado marca movimentações como lidas
        const readResp = await fetch(`${apiBaseUrl}/api/processos/${syncBody.processo_id}/movimentacoes/ler`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });
        assert.equal(readResp.status, 200);
        const readBody = await readResp.json();
        assert.equal(readBody.atualizadas, 1);
        assert.equal(readBody.nao_lidos, 0);

        const afterReadResp = await fetch(`${apiBaseUrl}/api/processos/cnj/${cnjE2E}/status-sincronizacao?escritorio_id=${ESCRITORIO_TESTE_F6}`);
        const afterReadBody = await afterReadResp.json();
        assert.equal(afterReadBody.nao_lidos, 0);
    });
});
