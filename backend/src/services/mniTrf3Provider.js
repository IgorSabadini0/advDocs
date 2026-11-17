import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

import { db } from '../config/db.js';
import { ENDPOINTS_TRF3, parseNumeroCNJ } from '../utils/cnjParser.js';
import { PfxCertificateService } from './pfxCertificateService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_STORAGE_DIR = path.resolve(__dirname, '../../storage');
export const TIMEOUT_MNI_MS = 30000;

export const WSDL_TRF3_1G = ENDPOINTS_TRF3.mni_1g;
export const WSDL_TRF3_2G = ENDPOINTS_TRF3.mni_2g;
export const SOAP_ENDPOINT_TRF3_1G = WSDL_TRF3_1G.replace(/\?wsdl$/i, '');
export const SOAP_ENDPOINT_TRF3_2G = WSDL_TRF3_2G.replace(/\?wsdl$/i, '');

const xmlEscape = (valor) => {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
};

const decodeXmlEntities = (valor) => {
    if (!valor) return '';
    return String(valor)
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&');
};

const parseAttrs = (attrStr = '') => {
    const attrs = {};
    const regex = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let m;
    while ((m = regex.exec(attrStr)) !== null) {
        const keyFull = m[1];
        const keyLocal = keyFull.includes(':') ? keyFull.split(':').pop() : keyFull;
        attrs[keyLocal] = decodeXmlEntities(m[2] ?? m[3] ?? '');
    }
    return attrs;
};

/**
 * Scanner XML com profundidade controlada para extrair blocos de uma tag ignorando prefixos de namespace.
 */
export const extrairBlocosTag = (xml = '', localTag = '') => {
    const resultados = [];
    if (!xml || !localTag) return resultados;

    const regex = new RegExp(`<(/?)(?:[\\w-]+:)?${localTag}(?=[\\s>/])([^>]*)>`, 'gi');
    let depth = 0;
    let openAttrs = '';
    let contentStart = 0;
    let match;

    while ((match = regex.exec(xml)) !== null) {
        const isClosing = match[1] === '/';
        const attrRaw = match[2] || '';
        const isSelfClosing = !isClosing && attrRaw.trimEnd().endsWith('/');

        if (!isClosing) {
            if (depth === 0) {
                if (isSelfClosing) {
                    resultados.push({
                        attrs: parseAttrs(attrRaw.slice(0, -1)),
                        innerXml: ''
                    });
                    continue;
                }
                depth = 1;
                openAttrs = attrRaw;
                contentStart = regex.lastIndex;
            } else if (!isSelfClosing) {
                depth++;
            }
        } else if (depth > 0) {
            depth--;
            if (depth === 0) {
                resultados.push({
                    attrs: parseAttrs(openAttrs),
                    innerXml: xml.slice(contentStart, match.index)
                });
            }
        }
    }

    return resultados;
};

const extrairTextoTagUnica = (xml, localTag) => {
    const blocos = extrairBlocosTag(xml, localTag);
    if (blocos.length === 0) return null;
    const texto = decodeXmlEntities(blocos[0].innerXml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
    return texto !== '' ? texto : null;
};

/**
 * Gera o envelope SOAP 1.1 do protocolo MNI 2.2.2 para operação `consultarProcesso`.
 */
export const construirEnvelopeConsultarProcessoMni = ({
    idConsultante,
    senhaConsultante = '',
    numeroProcesso,
    movimentos = true,
    incluirCabecalho = true,
    incluirDocumentos = false,
    documentos = []
}) => {
    const cpfDigits = String(idConsultante || '').replace(/\D/g, '');
    const procDigits = String(numeroProcesso || '').replace(/\D/g, '');

    if (procDigits.length !== 20) {
        const err = new Error('Número do processo para consulta MNI deve conter 20 dígitos.');
        err.code = 'INVALID_CNJ';
        throw err;
    }

    const docsXml = (Array.isArray(documentos) ? documentos : [])
        .filter(Boolean)
        .map(docId => `<tip:documento>${xmlEscape(docId)}</tip:documento>`)
        .join('\n                ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
                  xmlns:ser="http://www.cnj.jus.br/servico-intercomunicacao-2.2.2/"
                  xmlns:tip="http://www.cnj.jus.br/tipos-servico-intercomunicacao-2.2.2">
    <soapenv:Header/>
    <soapenv:Body>
        <ser:consultarProcesso>
            <tip:idConsultante>${xmlEscape(cpfDigits)}</tip:idConsultante>
            <tip:senhaConsultante>${xmlEscape(senhaConsultante)}</tip:senhaConsultante>
            <tip:numeroProcesso>${xmlEscape(procDigits)}</tip:numeroProcesso>
            <tip:movimentos>${movimentos ? 'true' : 'false'}</tip:movimentos>
            <tip:incluirCabecalho>${incluirCabecalho ? 'true' : 'false'}</tip:incluirCabecalho>
            <tip:incluirDocumentos>${incluirDocumentos ? 'true' : 'false'}</tip:incluirDocumentos>${docsXml ? `\n            ${docsXml}` : ''}
        </ser:consultarProcesso>
    </soapenv:Body>
</soapenv:Envelope>`;
};

const mapearPoloMni = (codigoPolo = '') => {
    const p = String(codigoPolo || '').trim().toUpperCase();
    if (p === 'AT' || p === 'ATIVO' || p === 'AUTOR') return 'ATIVO';
    if (p === 'PA' || p === 'PASSIVO' || p === 'REU' || p === 'RÉU') return 'PASSIVO';
    if (p === 'TC' || p === 'TERCEIRO' || p === 'TI') return 'TERCEIRO';
    return 'OUTRO';
};

const normalizarInstanciaMni = (inst = '1G') => {
    const val = String(inst || '1G').trim().toUpperCase();
    if (val === '2G' || val === 'G2' || val === 'TR') return '2G';
    if (val === 'SUPERIOR' || val === 'SUP') return 'SUPERIOR';
    return '1G';
};

/**
 * Converte a resposta XML SOAP MNI 2.2.2 (`consultarProcessoResponse`)
 * para o DTO padronizado da Seção 5, incluindo partes, documentos e `teor_completo`.
 */
export const parsearXmlMniParaDTO = (xmlString, {
    numero_cnj = null,
    instancia = '1G',
    tribunal_sigla = 'TRF3'
} = {}) => {
    if (!xmlString || typeof xmlString !== 'string') {
        throw new Error('Resposta XML MNI vazia ou inválida.');
    }

    const faults = extrairBlocosTag(xmlString, 'Fault');
    if (faults.length > 0) {
        const faultMsg = extrairTextoTagUnica(faults[0].innerXml, 'faultstring')
            || extrairTextoTagUnica(faults[0].innerXml, 'Text')
            || 'Erro SOAP Fault no servidor MNI do tribunal.';
        const err = new Error(faultMsg);
        err.code = 'MNI_SOAP_FAULT';
        throw err;
    }

    const sucessoTexto = extrairTextoTagUnica(xmlString, 'sucesso');
    if (sucessoTexto && sucessoTexto.toLowerCase() === 'false') {
        const msgTribunal = extrairTextoTagUnica(xmlString, 'mensagem') || 'Consulta recusada pelo MNI do TRF3.';
        const err = new Error(msgTribunal);
        err.code = 'MNI_BUSINESS_ERROR';
        throw err;
    }

    const dadosBasicosBloco = extrairBlocosTag(xmlString, 'dadosBasicos')[0];
    if (!dadosBasicosBloco) {
        return null;
    }

    const dbAttrs = dadosBasicosBloco.attrs;
    const dbInner = dadosBasicosBloco.innerXml;
    const numeroLimpo = String(numero_cnj || dbAttrs.numero || '').replace(/\D/g, '');
    const instanciaNorm = normalizarInstanciaMni(instancia);

    const parsed = numeroLimpo.length === 20
        ? parseNumeroCNJ(numeroLimpo, { exigirDigitoVerificador: false })
        : null;

    const orgaoBloco = extrairBlocosTag(dbInner, 'orgaoJulgador')[0];
    const orgaoJulgador = orgaoBloco?.attrs?.nomeOrgao
        || orgaoBloco?.attrs?.nome
        || extrairTextoTagUnica(orgaoBloco?.innerXml || '', 'nomeOrgao')
        || null;

    const classeProcessual = dbAttrs.descricaoClasse
        || dbAttrs.classeProcessualNome
        || extrairTextoTagUnica(dbInner, 'descricaoClasse')
        || (dbAttrs.classeProcessual ? `Classe TPU ${dbAttrs.classeProcessual}` : null);

    const assuntosBlocos = extrairBlocosTag(dbInner, 'assunto');
    const assuntosDesc = [];
    for (const a of assuntosBlocos) {
        const desc = a.attrs?.descricao
            || extrairTextoTagUnica(a.innerXml, 'descricao')
            || extrairTextoTagUnica(a.innerXml, 'assuntoLocal')
            || (a.attrs?.codigoNacional ? `Assunto TPU ${a.attrs.codigoNacional}` : null);
        if (desc && !assuntosDesc.includes(desc)) {
            assuntosDesc.push(desc);
        }
    }

    const valorCausaRaw = dbAttrs.valorCausa || extrairTextoTagUnica(dbInner, 'valorCausa');
    const valorCausaNum = valorCausaRaw !== null && valorCausaRaw !== undefined && valorCausaRaw !== ''
        ? Number(String(valorCausaRaw).replace(',', '.'))
        : null;

    const nivelSigilo = Number(dbAttrs.nivelSigilo || 0);

    // Partes e Advogados (<polo>)
    const partes = [];
    for (const poloBloco of extrairBlocosTag(dbInner, 'polo')) {
        const polo = mapearPoloMni(poloBloco.attrs?.polo);
        for (const parteBloco of extrairBlocosTag(poloBloco.innerXml, 'parte')) {
            const pessoaBloco = extrairBlocosTag(parteBloco.innerXml, 'pessoa')[0];
            const nomeParte = pessoaBloco?.attrs?.nome || extrairTextoTagUnica(parteBloco.innerXml, 'nome');
            if (!nomeParte) continue;

            const docParte = pessoaBloco?.attrs?.numeroDocumentoPrincipal
                || extrairTextoTagUnica(parteBloco.innerXml, 'numeroDocumentoPrincipal')
                || null;

            const advogados = [];
            for (const advBloco of extrairBlocosTag(parteBloco.innerXml, 'advogado')) {
                const nomeAdv = advBloco.attrs?.nome || extrairTextoTagUnica(advBloco.innerXml, 'nome');
                if (!nomeAdv) continue;
                advogados.push({
                    nome: nomeAdv,
                    oab: advBloco.attrs?.inscricao || advBloco.attrs?.numeroOab || '',
                    uf: advBloco.attrs?.uf || ''
                });
            }

            partes.push({
                polo,
                tipo_participacao: parteBloco.attrs?.tipoParticipacao || pessoaBloco?.attrs?.tipoPessoa || polo,
                nome: nomeParte,
                documento_cpf_cnpj: docParte ? String(docParte).replace(/\D/g, '') : null,
                advogados
            });
        }
    }

    // Documentos do processo (<documento>)
    const mapaDocs = new Map();
    const documentosProcesso = [];
    for (const docBloco of extrairBlocosTag(xmlString, 'documento')) {
        const idDoc = docBloco.attrs?.idDocumento || extrairTextoTagUnica(docBloco.innerXml, 'idDocumento');
        if (!idDoc) continue;

        const docObj = {
            id_documento_tribunal: String(idDoc).trim(),
            instancia: instanciaNorm,
            tipo_documento: docBloco.attrs?.tipoDocumento
                || docBloco.attrs?.tipoDocumentoLocal
                || extrairTextoTagUnica(docBloco.innerXml, 'tipoDocumento')
                || 'Documento Processual',
            descricao: docBloco.attrs?.descricao || extrairTextoTagUnica(docBloco.innerXml, 'descricao') || null,
            data_juntada: docBloco.attrs?.dataHora || extrairTextoTagUnica(docBloco.innerXml, 'dataHora') || null,
            mimetype: docBloco.attrs?.mimetype || extrairTextoTagUnica(docBloco.innerXml, 'mimetype') || 'application/pdf',
            hash_documento_tribunal: docBloco.attrs?.hash || extrairTextoTagUnica(docBloco.innerXml, 'hash') || null
        };

        if (!mapaDocs.has(docObj.id_documento_tribunal)) {
            mapaDocs.set(docObj.id_documento_tribunal, docObj);
            documentosProcesso.push(docObj);
        }
    }

    // Movimentações (<movimento>) com teor_completo e vínculo de documentos
    const movimentacoes = [];
    const blocosMov = extrairBlocosTag(xmlString, 'movimento');

    for (const movBloco of blocosMov) {
        const movAttrs = movBloco.attrs || {};
        const movInner = movBloco.innerXml || '';

        const movNac = extrairBlocosTag(movInner, 'movimentoNacional')[0];
        const movLoc = extrairBlocosTag(movInner, 'movimentoLocal')[0];

        const codigoCnjRaw = movNac?.attrs?.codigoNacional
            || movAttrs.codigoNacional
            || extrairTextoTagUnica(movInner, 'codigoNacional');
        const codigoCnj = codigoCnjRaw !== null && !isNaN(Number(codigoCnjRaw)) ? Number(codigoCnjRaw) : null;

        const tituloBase = movNac?.attrs?.descricao
            || movLoc?.attrs?.descricao
            || movAttrs.descricao
            || extrairTextoTagUnica(movInner, 'movimentoLocal')
            || extrairTextoTagUnica(movInner, 'descricao')
            || 'Movimentação processual MNI';

        const complementos = extrairBlocosTag(movInner, 'complemento')
            .map(c => decodeXmlEntities(c.innerXml.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim())
            .filter(Boolean);

        const teorDireto = extrairTextoTagUnica(movInner, 'teor');
        const teorCompleto = complementos.length > 0
            ? complementos.join('\n')
            : (teorDireto || tituloBase);

        const idsDocsVinc = extrairBlocosTag(movInner, 'idDocumentoVinculado')
            .map(d => decodeXmlEntities(d.innerXml).trim())
            .filter(Boolean);

        const docsVinculados = idsDocsVinc.map(docId => {
            return mapaDocs.get(docId) || {
                id_documento_tribunal: docId,
                instancia: instanciaNorm,
                tipo_documento: 'Peça Processual',
                descricao: `Documento ${docId}`,
                data_juntada: movAttrs.dataHora || null,
                mimetype: 'application/pdf'
            };
        });

        movimentacoes.push({
            instancia: instanciaNorm,
            data_movimentacao: movAttrs.dataHora || extrairTextoTagUnica(movInner, 'dataHora') || new Date().toISOString(),
            codigo_cnj: codigoCnj,
            titulo: tituloBase,
            teor_completo: teorCompleto,
            fonte_captura: 'MNI',
            possui_anexo: docsVinculados.length > 0,
            documentos_vinculados: docsVinculados
        });
    }

    return {
        numero_cnj: numeroLimpo,
        tribunal_sigla: (tribunal_sigla || parsed?.tribunal_sigla || 'TRF3').toUpperCase(),
        instancia: instanciaNorm,
        sistema_processual: parsed?.sistema_processual || 'PJE',
        segredo_justica: nivelSigilo > 0,
        fonte_captura: 'MNI',
        capa: {
            classe_processual: classeProcessual ? String(classeProcessual).slice(0, 255) : null,
            assunto_principal: assuntosDesc.length > 0 ? assuntosDesc.join(', ').slice(0, 255) : null,
            orgao_julgador: orgaoJulgador ? String(orgaoJulgador).slice(0, 255) : null,
            valor_causa: Number.isFinite(valorCausaNum) ? valorCausaNum : null,
            data_distribuicao: dbAttrs.dataAjuizamento || extrairTextoTagUnica(dbInner, 'dataAjuizamento') || null
        },
        partes,
        movimentacoes,
        documentos: documentosProcesso
    };
};

/**
 * Extrai o conteúdo binário (PDF) Base64 retornado em `<documento><conteudo>...</conteudo></documento>`.
 */
export const extrairConteudoDocumentoXml = (xmlString, idDocumentoAlvo = null) => {
    const blocosDoc = extrairBlocosTag(xmlString, 'documento');
    if (blocosDoc.length === 0) {
        const err = new Error('Nenhum elemento <documento> retornado na resposta MNI.');
        err.code = 'MNI_DOCUMENT_NOT_FOUND';
        throw err;
    }

    const escolhido = idDocumentoAlvo
        ? (blocosDoc.find(d => String(d.attrs?.idDocumento || '').trim() === String(idDocumentoAlvo).trim()) || blocosDoc[0])
        : blocosDoc[0];

    const conteudoB64 = extrairTextoTagUnica(escolhido.innerXml, 'conteudo')
        || extrairTextoTagUnica(xmlString, 'conteudo');

    if (!conteudoB64) {
        const err = new Error('O documento retornado pelo MNI não possui conteúdo binário (<conteudo>).');
        err.code = 'MNI_EMPTY_DOCUMENT';
        throw err;
    }

    const limpo = conteudoB64.replace(/\s+/g, '');
    const buffer = Buffer.from(limpo, 'base64');
    if (buffer.length === 0) {
        const err = new Error('Conteúdo Base64 do documento MNI é inválido ou vazio.');
        err.code = 'MNI_INVALID_BASE64';
        throw err;
    }

    const mimetype = escolhido.attrs?.mimetype
        || extrairTextoTagUnica(escolhido.innerXml, 'mimetype')
        || 'application/pdf';

    return {
        buffer,
        mimetype,
        id_documento_tribunal: escolhido.attrs?.idDocumento || idDocumentoAlvo
    };
};

const enviarRequisicaoSoapMtls = ({
    endpointUrl,
    xmlEnvelope,
    pfxBuffer,
    senha,
    soapAction = 'consultarProcesso',
    timeoutMs = TIMEOUT_MNI_MS,
    rejectUnauthorized = true
}) => {
    return new Promise((resolve, reject) => {
        const urlObj = new URL(endpointUrl);
        const isHttps = urlObj.protocol === 'https:';
        const transport = isHttps ? https : http;

        const agent = isHttps && pfxBuffer
            ? new https.Agent({
                pfx: pfxBuffer,
                passphrase: String(senha ?? ''),
                rejectUnauthorized
            })
            : undefined;

        const req = transport.request({
            hostname: urlObj.hostname,
            port: urlObj.port || (isHttps ? 443 : 80),
            path: `${urlObj.pathname}${urlObj.search}`,
            method: 'POST',
            agent,
            timeout: timeoutMs,
            headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': `"${soapAction}"`,
                'Content-Length': Buffer.byteLength(xmlEnvelope, 'utf8')
            }
        }, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const body = Buffer.concat(chunks).toString('utf8');
                if (res.statusCode >= 500 || res.statusCode === 429) {
                    const err = new Error(`MNI HTTP ${res.statusCode}`);
                    err.statusCode = String(res.statusCode);
                    err.retryable = true;
                    err.body = body;
                    reject(err);
                    return;
                }
                if (res.statusCode >= 400) {
                    const err = new Error(`MNI recusou requisição com HTTP ${res.statusCode}`);
                    err.statusCode = String(res.statusCode);
                    err.retryable = false;
                    err.body = body;
                    reject(err);
                    return;
                }
                resolve({ statusCode: res.statusCode, data: body });
            });
        });

        req.on('timeout', () => {
            req.destroy();
            const err = new Error('Timeout na comunicação SOAP MNI 2.2.2 com o TRF3.');
            err.code = 'ETIMEDOUT';
            err.retryable = true;
            reject(err);
        });

        req.on('error', (error) => {
            const code = String(error.code || '').toUpperCase();
            error.retryable = code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED';
            reject(error);
        });

        req.write(xmlEnvelope, 'utf8');
        req.end();
    });
};

export const resolverEndpointSoapTrf3 = (instancia = '1G', endpointsCustom = null) => {
    const instNorm = normalizarInstanciaMni(instancia);
    if (instNorm === '2G') {
        return endpointsCustom?.['2G'] || SOAP_ENDPOINT_TRF3_2G;
    }
    return endpointsCustom?.['1G'] || SOAP_ENDPOINT_TRF3_1G;
};

const resolverCredencialEmMemoria = async ({
    escritorio_id = 1,
    tribunal_sigla = 'TRF3',
    pfxBuffer = null,
    senha = null,
    titular_cpf_cnpj = null
}) => {
    if (pfxBuffer) {
        return {
            pfxBuffer,
            senha: String(senha ?? ''),
            titular_cpf_cnpj: titular_cpf_cnpj || ''
        };
    }

    const cred = await PfxCertificateService.obterCertificadoA1DescriptografadoEmMemoria({
        escritorio_id,
        tribunal_sigla
    });

    if (!cred) {
        const err = new Error(`Nenhum Certificado Digital A1 ativo encontrado no cofre para ${tribunal_sigla}.`);
        err.code = 'MISSING_CERTIFICATE_A1';
        err.statusCode = '401';
        err.retryable = false;
        throw err;
    }

    return cred;
};

/**
 * Consulta um processo no MNI 2.2.2 do TRF3 (`pje1g` / `pje2g`) usando Certificado A1 em memória.
 */
export const executarConsultaMniTrf3 = async ({
    numero_cnj,
    instancia = '1G',
    escritorio_id = 1,
    tribunal_sigla = 'TRF3',
    incluirDocumentos = false,
    pfxBuffer = null,
    senha = null,
    titular_cpf_cnpj = null,
    endpointsCustom = null,
    httpClient = null,
    timeoutMs = TIMEOUT_MNI_MS,
    rejectUnauthorized = true
}) => {
    const credencial = await resolverCredencialEmMemoria({
        escritorio_id,
        tribunal_sigla,
        pfxBuffer,
        senha,
        titular_cpf_cnpj
    });

    const endpoint = resolverEndpointSoapTrf3(instancia, endpointsCustom);
    const envelope = construirEnvelopeConsultarProcessoMni({
        idConsultante: credencial.titular_cpf_cnpj,
        senhaConsultante: '',
        numeroProcesso: numero_cnj,
        movimentos: true,
        incluirCabecalho: true,
        incluirDocumentos
    });

    const resp = httpClient
        ? await httpClient.post(endpoint, envelope, {
            pfxBuffer: credencial.pfxBuffer,
            passphrase: credencial.senha,
            timeout: timeoutMs
        })
        : await enviarRequisicaoSoapMtls({
            endpointUrl: endpoint,
            xmlEnvelope: envelope,
            pfxBuffer: credencial.pfxBuffer,
            senha: credencial.senha,
            timeoutMs,
            rejectUnauthorized
        });

    return parsearXmlMniParaDTO(resp.data, {
        numero_cnj,
        instancia,
        tribunal_sigla
    });
};

const extensaoPorMime = (mimetype = '') => {
    const m = String(mimetype || '').toLowerCase();
    if (m.includes('pdf')) return 'pdf';
    if (m.includes('html')) return 'html';
    if (m.includes('xml')) return 'xml';
    if (m.includes('text')) return 'txt';
    return 'bin';
};

/**
 * Baixa um documento específico sob demanda via MNI 2.2.2 (`<documento>id</documento>`),
 * salva no storage seguro do advDocs e atualiza `processo_documentos`.
 */
export const baixarDocumentoMniTrf3 = async ({
    processo_id,
    documento_id = null,
    id_documento_tribunal,
    numero_cnj,
    instancia = '1G',
    escritorio_id = 1,
    tribunal_sigla = 'TRF3',
    storageBaseDir = DEFAULT_STORAGE_DIR,
    endpointsCustom = null,
    httpClient = null,
    timeoutMs = TIMEOUT_MNI_MS,
    rejectUnauthorized = true
}) => {
    if (!id_documento_tribunal) {
        const err = new Error('id_documento_tribunal é obrigatório para download via MNI.');
        err.code = 'MISSING_DOCUMENT_ID';
        throw err;
    }

    const credencial = await resolverCredencialEmMemoria({
        escritorio_id,
        tribunal_sigla
    });

    const instNorm = normalizarInstanciaMni(instancia);
    const endpoint = resolverEndpointSoapTrf3(instNorm, endpointsCustom);
    const envelope = construirEnvelopeConsultarProcessoMni({
        idConsultante: credencial.titular_cpf_cnpj,
        senhaConsultante: '',
        numeroProcesso: numero_cnj,
        movimentos: false,
        incluirCabecalho: false,
        incluirDocumentos: false,
        documentos: [String(id_documento_tribunal)]
    });

    const resp = httpClient
        ? await httpClient.post(endpoint, envelope, {
            pfxBuffer: credencial.pfxBuffer,
            passphrase: credencial.senha,
            timeout: timeoutMs
        })
        : await enviarRequisicaoSoapMtls({
            endpointUrl: endpoint,
            xmlEnvelope: envelope,
            pfxBuffer: credencial.pfxBuffer,
            senha: credencial.senha,
            timeoutMs,
            rejectUnauthorized
        });

    const docExtraido = extrairConteudoDocumentoXml(resp.data, id_documento_tribunal);
    const hashSha256 = crypto.createHash('sha256').update(docExtraido.buffer).digest('hex');

    const safeCnj = String(numero_cnj || 'sem_cnj').replace(/\D/g, '') || 'sem_cnj';
    const safeDocId = String(id_documento_tribunal).replace(/[^a-zA-Z0-9_-]/g, '_');
    const ext = extensaoPorMime(docExtraido.mimetype);
    const pastaProcesso = path.join(storageBaseDir, 'processos', safeCnj);
    await fs.mkdir(pastaProcesso, { recursive: true });

    const caminhoArquivo = path.join(pastaProcesso, `${instNorm}_${safeDocId}.${ext}`);
    await fs.writeFile(caminhoArquivo, docExtraido.buffer);

    if (processo_id) {
        const condicoes = documento_id
            ? 'id = ? AND processo_id = ?'
            : 'processo_id = ? AND id_documento_tribunal = ?';
        const paramsWhere = documento_id
            ? [Number(documento_id), Number(processo_id)]
            : [Number(processo_id), String(id_documento_tribunal)];

        await db.query(`
            UPDATE processo_documentos
            SET baixado = TRUE,
                caminho_storage = ?,
                mimetype = ?,
                hash_documento_tribunal = ?
            WHERE ${condicoes}
        `, [caminhoArquivo, docExtraido.mimetype, hashSha256, ...paramsWhere]);
    }

    return {
        processo_id,
        id_documento_tribunal: String(id_documento_tribunal),
        caminho_storage: caminhoArquivo,
        hash_documento_tribunal: hashSha256,
        mimetype: docExtraido.mimetype,
        bytes: docExtraido.buffer.length
    };
};

/**
 * Handler MNI integrado ao `ProcessSyncQueueWorker` para `SYNC_PROCESSO` e `DOWNLOAD_DOCUMENTO`.
 */
export const executarJobMni = async (job, options = {}) => {
    const params = typeof job.parametros_json === 'string'
        ? JSON.parse(job.parametros_json)
        : (job.parametros_json || {});

    if (job.tipo_job === 'DOWNLOAD_DOCUMENTO') {
        const docIdTribunal = params.id_documento_tribunal;
        const resultadoDownload = await baixarDocumentoMniTrf3({
            processo_id: job.processo_id,
            documento_id: params.documento_id || null,
            id_documento_tribunal: docIdTribunal,
            numero_cnj: job.numero_cnj,
            instancia: params.instancia || job.instancia || '1G',
            escritorio_id: job.escritorio_id || 1,
            tribunal_sigla: job.tribunal_sigla || 'TRF3',
            storageBaseDir: params.storageBaseDir || options.storageBaseDir || DEFAULT_STORAGE_DIR,
            endpointsCustom: options.endpointsCustom || null,
            httpClient: options.httpClient || null
        });

        return {
            dto: null,
            download: resultadoDownload,
            status_sincronizacao: 'ATUALIZADO',
            novas_movimentacoes_inseridas: 0,
            codigo_http_ou_soap: '200-MNI-DOC'
        };
    }

    const dto = await executarConsultaMniTrf3({
        numero_cnj: job.numero_cnj,
        instancia: params.instancia || (job.instancia === 'AMBAS' ? '1G' : job.instancia) || '1G',
        escritorio_id: job.escritorio_id || 1,
        tribunal_sigla: job.tribunal_sigla || 'TRF3',
        incluirDocumentos: Boolean(params.incluirDocumentos),
        endpointsCustom: options.endpointsCustom || null,
        httpClient: options.httpClient || null
    });

    if (!dto) {
        return {
            dto: null,
            status_sincronizacao: 'ATUALIZADO',
            novas_movimentacoes_inseridas: 0,
            codigo_http_ou_soap: '200-MNI-EMPTY'
        };
    }

    return {
        dto,
        status_sincronizacao: 'ATUALIZADO',
        codigo_http_ou_soap: '200-MNI'
    };
};

export const MniTrf3Provider = {
    WSDL_TRF3_1G,
    WSDL_TRF3_2G,
    SOAP_ENDPOINT_TRF3_1G,
    SOAP_ENDPOINT_TRF3_2G,
    DEFAULT_STORAGE_DIR,
    TIMEOUT_MNI_MS,
    extrairBlocosTag,
    construirEnvelopeConsultarProcessoMni,
    parsearXmlMniParaDTO,
    extrairConteudoDocumentoXml,
    resolverEndpointSoapTrf3,
    executarConsultaMniTrf3,
    baixarDocumentoMniTrf3,
    executarJobMni
};

export default MniTrf3Provider;
