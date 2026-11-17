import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import https from 'node:https';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import express from 'express';

import { db } from '../src/config/db.js';
import { runMigrations } from '../src/database/migrate.js';
import { calcularDigitoVerificadorCNJ } from '../src/utils/cnjParser.js';
import { PfxCertificateService } from '../src/services/pfxCertificateService.js';
import { MniTrf3Provider } from '../src/services/mniTrf3Provider.js';
import { ProcessPersistenceService } from '../src/services/processPersistenceService.js';
import {
    registerSyncProvider,
    resetSyncProviders,
    encerrarQueueWorker,
    reativarQueueWorker
} from '../src/services/processSyncQueueWorker.js';
import credenciaisRouter from '../src/routes/credenciais.js';
import processosRouter from '../src/routes/processos.js';

const ESCRITORIO_TESTE_F4 = 999004;
const SENHA_PFX_TESTE = 'CertTrf3#2026';

const gerarCnjValido = (seq, ano, j, tr, orig) => {
    const dd = calcularDigitoVerificadorCNJ(seq, ano, j, tr, orig);
    return `${String(seq).padStart(7, '0')}${dd}${ano}${j}${tr}${orig}`;
};

describe('FASE 4 — Upload Certificado A1, MNI 2.2.2 TRF3 (mTLS em RAM) e Download Sob Demanda', () => {
    let tempDir;
    let pfxBuffer;
    let serverCertPem;
    let serverKeyPem;

    let apiServer;
    let apiBaseUrl;
    let mniHttpsServer;
    let mniBaseUrl;

    let ultimoSoapRecebido = '';
    let ultimoPeerCertCn = null;
    let cnjTrf3Teste;
    let processoTesteId;

    const pdfBinarioFake = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'utf8');

    before(async () => {
        reativarQueueWorker();
        await runMigrations(db);
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F4]);
        await db.query('DELETE FROM credenciais_tribunal WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F4]);

        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'advdocs-fase4-'));
        cnjTrf3Teste = gerarCnjValido('5007777', '2026', '4', '03', '6100');

        // Gera Certificado Cliente (.pfx com CPF ICP-Brasil) e Certificado Servidor Mock TLS via OpenSSL
        const clientKey = path.join(tempDir, 'client-key.pem');
        const clientCert = path.join(tempDir, 'client-cert.pem');
        const clientPfx = path.join(tempDir, 'client.pfx');
        const srvKey = path.join(tempDir, 'srv-key.pem');
        const srvCert = path.join(tempDir, 'srv-cert.pem');

        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', clientKey, '-out', clientCert,
            '-days', '365', '-nodes',
            '-subj', '/CN=ADVOGADO TESTE TRF3:12345678901/C=BR'
        ], { stdio: 'pipe' });

        execFileSync('openssl', [
            'pkcs12', '-export',
            '-out', clientPfx,
            '-inkey', clientKey,
            '-in', clientCert,
            '-passout', `pass:${SENHA_PFX_TESTE}`
        ], { stdio: 'pipe' });

        execFileSync('openssl', [
            'req', '-x509', '-newkey', 'rsa:2048',
            '-keyout', srvKey, '-out', srvCert,
            '-days', '365', '-nodes',
            '-subj', '/CN=127.0.0.1'
        ], { stdio: 'pipe' });

        pfxBuffer = await fs.readFile(clientPfx);
        serverCertPem = await fs.readFile(srvCert);
        serverKeyPem = await fs.readFile(srvKey);

        // Remove chave e cert PEM em texto plano antes de rodar os testes
        await fs.unlink(clientKey);
        await fs.unlink(clientCert);

        // Servidor HTTPS mTLS simulando PJe MNI 2.2.2 do TRF3
        mniHttpsServer = https.createServer({
            key: serverKeyPem,
            cert: serverCertPem,
            requestCert: true,
            rejectUnauthorized: false
        }, (req, res) => {
            const chunks = [];
            req.on('data', c => chunks.push(c));
            req.on('end', () => {
                ultimoSoapRecebido = Buffer.concat(chunks).toString('utf8');
                const peer = req.socket.getPeerCertificate();
                ultimoPeerCertCn = peer?.subject?.CN || null;

                res.writeHead(200, { 'Content-Type': 'text/xml; charset=utf-8' });

                if (ultimoSoapRecebido.includes('<tip:documento>319482719</tip:documento>')) {
                    const pdfB64 = pdfBinarioFake.toString('base64');
                    res.end(`<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <ns2:consultarProcessoResponse xmlns:ns2="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/" xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">
      <sucesso>true</sucesso>
      <processo>
        <tip:dadosBasicos numero="${cnjTrf3Teste}">
          <tip:documento idDocumento="319482719" tipoDocumento="Laudo Pericial" mimetype="application/pdf">
            <tip:conteudo>${pdfB64}</tip:conteudo>
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
        <tip:dadosBasicos numero="${cnjTrf3Teste}" classeProcessual="199" descricaoClasse="PROCEDIMENTO COMUM CÍVEL" nivelSigilo="0" dataAjuizamento="20260310111500" valorCausa="85000.50">
          <tip:orgaoJulgador nomeOrgao="1ª Vara Federal Previdenciária de São Paulo"/>
          <tip:assunto codigoNacional="6101">
            <tip:descricao>Aposentadoria por Invalidez</tip:descricao>
          </tip:assunto>
          <tip:polo polo="AT">
            <tip:parte tipoParticipacao="AUTOR">
              <tip:pessoa nome="MARIA DA SILVA" numeroDocumentoPrincipal="11122233344"/>
              <tip:advogado nome="ADVOGADO TESTE TRF3" inscricao="123456" uf="SP"/>
            </tip:parte>
          </tip:polo>
          <tip:polo polo="PA">
            <tip:parte tipoParticipacao="RÉU">
              <tip:pessoa nome="INSTITUTO NACIONAL DO SEGURO SOCIAL - INSS" numeroDocumentoPrincipal="29979036000140"/>
            </tip:parte>
          </tip:polo>
          <tip:documento idDocumento="319482719" tipoDocumento="Laudo Pericial" descricao="Laudo Médico Judicial" dataHora="2026-11-16T16:35:00Z" mimetype="application/pdf"/>
        </tip:dadosBasicos>
        <tip:movimento dataHora="2026-11-16T16:40:00Z" idMovimento="901">
          <tip:movimentoNacional codigoNacional="12200" descricao="Intimação eletrônica expedida/certificada"/>
          <tip:complemento>Intimação da parte autora para manifestação sobre o laudo pericial no prazo de 15 dias.</tip:complemento>
          <tip:idDocumentoVinculado>319482719</tip:idDocumentoVinculado>
        </tip:movimento>
      </processo>
    </ns2:consultarProcessoResponse>
  </soap:Body>
</soap:Envelope>`);
            });
        });

        await new Promise((resolve) => {
            mniHttpsServer.listen(0, '127.0.0.1', () => {
                const { port } = mniHttpsServer.address();
                mniBaseUrl = `https://127.0.0.1:${port}/pje/intercomunicacao`;
                resolve();
            });
        });

        // App Express de teste com rotas `/api/credenciais` e `/api/processos`
        const app = express();
        app.use('/api/credenciais', (req, _res, next) => { req.usuarioId = 1; next(); }, express.json({ limit: '5mb' }), credenciaisRouter);
        app.use(express.json({ limit: '16kb' }));
        app.use((req, _res, next) => { req.usuarioId = 1; next(); });
        app.use('/api/processos', processosRouter);

        await new Promise((resolve) => {
            apiServer = app.listen(0, '127.0.0.1', () => {
                const { port } = apiServer.address();
                apiBaseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        encerrarQueueWorker();
        resetSyncProviders();
        await db.query('DELETE FROM processos WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F4]);
        await db.query('DELETE FROM credenciais_tribunal WHERE escritorio_id = ?', [ESCRITORIO_TESTE_F4]);
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
        }
        if (mniHttpsServer) {
            await new Promise((resolve) => mniHttpsServer.close(resolve));
        }
        if (apiServer) {
            await new Promise((resolve) => apiServer.close(resolve));
        }
        await db.end();
    });

    it('POST /api/credenciais/certificado-a1 valida .pfx em RAM, extrai CPF/validade e grava cifrado AES-256-GCM', async () => {
        // Senha incorreta deve retornar 400
        const badPassResp = await fetch(`${apiBaseUrl}/api/credenciais/certificado-a1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                escritorio_id: ESCRITORIO_TESTE_F4,
                tribunal_sigla: 'TRF3',
                pfx_base64: pfxBuffer.toString('base64'),
                senha: 'SenhaErrada'
            })
        });
        assert.equal(badPassResp.status, 400);

        // Upload válido
        const okResp = await fetch(`${apiBaseUrl}/api/credenciais/certificado-a1`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                escritorio_id: ESCRITORIO_TESTE_F4,
                tribunal_sigla: 'TRF3',
                pfx_base64: pfxBuffer.toString('base64'),
                senha: SENHA_PFX_TESTE
            })
        });
        const body = await okResp.json();

        assert.equal(okResp.status, 201);
        assert.equal(body.credencial.titular_cpf_cnpj, '12345678901');
        assert.equal(body.credencial.tribunal_sigla, 'TRF3');
        assert.equal(body.credencial.status_credencial, 'VALIDA');
        assert.ok(body.credencial.validade_certificado);
        assert.equal(body.credencial.senha, undefined);
        assert.equal(body.credencial.payload_criptografado, undefined);

        // Confirma interoperabilidade Node <-> Python decrypt AES-256-GCM no registro salvo em MySQL
        const [[dbRow]] = await db.query(
            'SELECT payload_criptografado, iv_hex, auth_tag_hex FROM credenciais_tribunal WHERE id = ?',
            [body.credencial.id]
        );
        assert.equal(dbRow.iv_hex.length, 24);
        assert.equal(dbRow.auth_tag_hex.length, 32);

        const pyCheck = execFileSync('python', [
            '-c',
            [
                'import sys, base64',
                'sys.path.insert(0, "backend/workers")',
                'from mni_trf3_provider import decrypt_credentials_aes_gcm',
                'payload = base64.b64decode(sys.argv[1])',
                'obj = decrypt_credentials_aes_gcm(payload, sys.argv[2], sys.argv[3])',
                'print(obj["senha"], len(base64.b64decode(obj["pfx_base64"])))'
            ].join('; '),
            Buffer.from(dbRow.payload_criptografado).toString('base64'),
            dbRow.iv_hex,
            dbRow.auth_tag_hex
        ], { encoding: 'utf8' }).trim();

        assert.equal(pyCheck, `${SENHA_PFX_TESTE} ${pfxBuffer.length}`);
    });

    it('consulta processo TRF3 via MNI 2.2.2 com mTLS em memória, enriquece teor_completo e lista documentos', async () => {
        const credEmRam = await PfxCertificateService.obterCertificadoA1DescriptografadoEmMemoria({
            escritorio_id: ESCRITORIO_TESTE_F4,
            tribunal_sigla: 'TRF3'
        });
        assert.ok(credEmRam);
        assert.equal(Buffer.compare(credEmRam.pfxBuffer, pfxBuffer), 0);

        registerSyncProvider('MNI', (job) => MniTrf3Provider.executarJobMni(job, {
            endpointsCustom: { '1G': mniBaseUrl, '2G': mniBaseUrl },
            storageBaseDir: tempDir
        }));

        // Redefine rejectUnauthorized para certificado self-signed local apenas no teste
        // Chama executarConsultaMniTrf3 diretamente e também via fila de jobs
        const dtoDireto = await MniTrf3Provider.executarConsultaMniTrf3({
            numero_cnj: cnjTrf3Teste,
            instancia: '1G',
            escritorio_id: ESCRITORIO_TESTE_F4,
            tribunal_sigla: 'TRF3',
            endpointsCustom: { '1G': mniBaseUrl },
            rejectUnauthorized: false
        });

        assert.equal(ultimoPeerCertCn, 'ADVOGADO TESTE TRF3:12345678901');
        assert.match(ultimoSoapRecebido, /<tip:idConsultante>12345678901<\/tip:idConsultante>/);
        assert.equal(dtoDireto.partes.length, 2);
        assert.equal(dtoDireto.partes[0].polo, 'ATIVO');
        assert.equal(dtoDireto.partes[0].advogados[0].oab, '123456');
        assert.equal(dtoDireto.documentos.length, 1);
        assert.equal(dtoDireto.movimentacoes[0].fonte_captura, 'MNI');
        assert.match(dtoDireto.movimentacoes[0].teor_completo, /laudo pericial/i);

        const persistRes = await ProcessPersistenceService.persistirProcessoDTO(dtoDireto, {
            escritorio_id: ESCRITORIO_TESTE_F4,
            status_sincronizacao: 'ATUALIZADO'
        });
        processoTesteId = persistRes.processo_id;

        const status = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(processoTesteId);
        assert.equal(status.processo.tribunal_sigla, 'TRF3');
        assert.equal(status.documentos.length, 1);
        assert.equal(status.documentos[0].id_documento_tribunal, '319482719');
        assert.equal(Boolean(status.documentos[0].baixado), false);
    });

    it('POST /api/processos/:id/documentos/:docId/baixar baixa PDF sob demanda via MNI e salva no storage', async () => {
        // Injeta opção rejectUnauthorized: false e storageBaseDir temporário no provider MNI para o loopback TLS de teste
        registerSyncProvider('MNI', async (job) => {
            const params = typeof job.parametros_json === 'string'
                ? JSON.parse(job.parametros_json)
                : (job.parametros_json || {});

            if (job.tipo_job === 'DOWNLOAD_DOCUMENTO') {
                const origHttps = https.request;
                // Reaproveita o endpoint loopback mTLS com certificado self-signed sem alterar implementação de produção
                const download = await MniTrf3Provider.baixarDocumentoMniTrf3({
                    processo_id: job.processo_id,
                    documento_id: params.documento_id,
                    id_documento_tribunal: params.id_documento_tribunal,
                    numero_cnj: job.numero_cnj,
                    instancia: params.instancia || '1G',
                    escritorio_id: job.escritorio_id,
                    tribunal_sigla: job.tribunal_sigla,
                    storageBaseDir: tempDir,
                    endpointsCustom: { '1G': mniBaseUrl, '2G': mniBaseUrl },
                    rejectUnauthorized: false
                });
                assert.ok(origHttps);
                return {
                    dto: null,
                    download,
                    status_sincronizacao: 'ATUALIZADO',
                    novas_movimentacoes_inseridas: 0,
                    codigo_http_ou_soap: '200-MNI-DOC'
                };
            }
            return MniTrf3Provider.executarJobMni(job);
        });

        const resp = await fetch(`${apiBaseUrl}/api/processos/${processoTesteId}/documentos/319482719/baixar`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ instancia: '1G' })
        });
        const body = await resp.json();

        assert.equal(resp.status, 202);
        assert.ok(body.job_id > 0);
        assert.equal(body.id_documento_tribunal, '319482719');

        // Aguarda worker baixar e persistir o PDF
        let status = null;
        for (let i = 0; i < 60; i++) {
            status = await ProcessPersistenceService.obterStatusSincronizacaoProcesso(processoTesteId);
            if (status?.ultimo_job?.id === body.job_id && status.ultimo_job.status === 'SUCESSO') break;
            await new Promise(r => setTimeout(r, 25));
        }

        assert.equal(status.ultimo_job.status, 'SUCESSO');
        assert.equal(status.ultimo_job.tipo_job, 'DOWNLOAD_DOCUMENTO');
        assert.equal(Boolean(status.documentos[0].baixado), true);
        assert.ok(status.documentos[0].caminho_storage);

        const pdfLido = await fs.readFile(status.documentos[0].caminho_storage);
        assert.equal(Buffer.compare(pdfLido, pdfBinarioFake), 0);

        const sha256Esperado = crypto.createHash('sha256').update(pdfBinarioFake).digest('hex');
        assert.equal(status.documentos[0].hash_documento_tribunal, sha256Esperado);
    });
});
