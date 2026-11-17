import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import axios from 'axios';

import { ENDPOINTS_TRF3, parseNumeroCNJ } from '../utils/cnjParser.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const RECURSOS_BLOQUEADOS_PLAYWRIGHT = ['image', 'media', 'font'];
export const TTL_SESSAO_SCRAPER_MS = 30 * 60 * 1000;
export const DIAGNOSTICS_STORAGE_DIR = path.resolve(__dirname, '../../storage/diagnostics');

export const URLS_CONSULTA_SCRAPER = {
    TRF3: {
        '1G': ENDPOINTS_TRF3.consulta_publica_1g,
        '2G': ENDPOINTS_TRF3.consulta_publica_2g
    },
    TJSP: {
        '1G': 'https://esaj.tjsp.jus.br/cpopg/open.do',
        '2G': 'https://esaj.tjsp.jus.br/cposg/open.do'
    }
};

const BASE32_ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

const decodificarBase32 = (input) => {
    const clean = String(input || '').replace(/[\s=-]+/g, '').toUpperCase();
    let bits = '';
    for (const ch of clean) {
        const val = BASE32_ALFABETO.indexOf(ch);
        if (val === -1) {
            throw new Error(`Caractere Base32 inválido na seed TOTP: ${ch}`);
        }
        bits += val.toString(2).padStart(5, '0');
    }

    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) {
        bytes.push(parseInt(bits.slice(i, i + 8), 2));
    }
    return Buffer.from(bytes);
};

/**
 * Gera código 2FA TOTP de 6 dígitos (RFC 6238 / HMAC-SHA1) compatível com PyOTP.
 */
export const gerarTokenTotp = (seed, timestampMs = Date.now(), intervalSec = 30, digits = 6) => {
    if (!seed || !String(seed).trim()) {
        throw new Error('Seed TOTP é obrigatória.');
    }

    const secret = decodificarBase32(seed);
    const counter = Math.floor(Math.floor(timestampMs / 1000) / intervalSec);
    const buf = Buffer.alloc(8);
    buf.writeBigUInt64BE(BigInt(counter));

    const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
    const offset = hmac[hmac.length - 1] & 0x0f;
    const binCode = ((hmac[offset] & 0x7f) << 24)
        | ((hmac[offset + 1] & 0xff) << 16)
        | ((hmac[offset + 2] & 0xff) << 8)
        | (hmac[offset + 3] & 0xff);

    const tokenNum = binCode % (10 ** digits);
    return String(tokenNum).padStart(digits, '0');
};

const decodeHtmlEntities = (text) => {
    if (!text) return '';
    return String(text)
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
        .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
};

const stripTags = (htmlStr) => {
    if (!htmlStr) return '';
    return decodeHtmlEntities(String(htmlStr).replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
};

const parseDataBrParaIso = (rawStr) => {
    const str = String(rawStr || '').trim();
    const match = str.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*(?:às|-)?\s*(\d{2}):(\d{2})(?::(\d{2}))?)?/i);
    if (!match) return null;
    const [, dia, mes, ano, hora = '00', min = '00', seg = '00'] = match;
    return `${ano}-${mes}-${dia}T${hora}:${min}:${seg}Z`;
};

const parseValorMonetarioBr = (rawStr) => {
    const str = String(rawStr || '').trim();
    const match = str.match(/([\d.]+,\d{2})/);
    if (!match) return null;
    const norm = Number(match[1].replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(norm) ? norm : null;
};

const extrairCampoHtmlPorIdOuRotulo = (html, patternStr) => {
    const idRegex = new RegExp(`id=["'][^"']*(?:${patternStr})[^"']*["'][^>]*>([\\s\\S]*?)<\\/`, 'i');
    const idMatch = html.match(idRegex);
    if (idMatch) {
        const val = stripTags(idMatch[1]);
        if (val) return val;
    }

    const labelRegex = new RegExp(
        `(?:${patternStr})\\s*:?\\s*(?:<\\/(?:label|strong|span)>\\s*)*<\\/(?:dt|th|label|strong|span|td)>\\s*<(?:dd|td|span|div)[^>]*>([\\s\\S]*?)<\\/`,
        'i'
    );
    const labelMatch = html.match(labelRegex);
    if (labelMatch) {
        const val = stripTags(labelMatch[1]);
        if (val) return val;
    }

    return null;
};

const extrairLinhasPorClasse = (html, classPattern) => {
    const linhas = [];
    const regex = new RegExp(`<tr[^>]*class=["'][^"']*(?:${classPattern})[^"']*["'][^>]*>([\\s\\S]*?)<\\/tr>`, 'gi');
    let m;
    while ((m = regex.exec(html)) !== null) {
        linhas.push(m[1]);
    }
    return linhas;
};

const extrairCelulasTr = (trInnerHtml) => {
    const cols = [];
    const regex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let m;
    while ((m = regex.exec(trInnerHtml)) !== null) {
        cols.push(m[1]);
    }
    return cols;
};

/**
 * Grava artefato de diagnóstico (equivalente ao screenshot/snapshot de erro de seletor)
 * no diretório `backend/storage/diagnostics`.
 */
export const salvarDiagnosticoSeletor = async ({
    tribunal_sigla = 'TRF3',
    numero_cnj = '',
    motivo = 'Erro de seletor no scraper',
    htmlSnapshot = ''
}, storageBaseDir = DIAGNOSTICS_STORAGE_DIR) => {
    await fs.mkdir(storageBaseDir, { recursive: true });
    const safeTrib = String(tribunal_sigla || 'TRIBUNAL').replace(/[^a-zA-Z0-9_-]/g, '').toUpperCase() || 'TRIBUNAL';
    const digits = String(numero_cnj || '').replace(/\D/g, '') || 'sem_cnj';
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');

    const baseName = `${safeTrib}_${digits}_${stamp}`;
    const caminhoRelatorio = path.join(storageBaseDir, `${baseName}.json`);
    const caminhoHtml = htmlSnapshot ? path.join(storageBaseDir, `${baseName}.html`) : null;

    await fs.writeFile(caminhoRelatorio, JSON.stringify({
        tribunal_sigla: safeTrib,
        numero_cnj: digits,
        motivo,
        timestamp: new Date().toISOString(),
        html_arquivo: caminhoHtml
    }, null, 2), 'utf8');

    if (caminhoHtml) {
        await fs.writeFile(caminhoHtml, String(htmlSnapshot), 'utf8');
    }

    return { caminho_relatorio: caminhoRelatorio, caminho_html: caminhoHtml };
};

/**
 * Parser HTML da Consulta Pública do PJe TRF3 para DTO da Seção 5 (`fonte_captura = 'SCRAPER'`).
 */
export const parsearHtmlPjeTrf3ParaDTO = (html, { numero_cnj, instancia = '1G' } = {}) => {
    if (!html || typeof html !== 'string') {
        throw new Error('HTML da Consulta Pública PJe TRF3 vazio ou inválido.');
    }

    const instNorm = String(instancia || '1G').toUpperCase() === '2G' ? '2G' : '1G';
    const numeroLimpo = String(numero_cnj || '').replace(/\D/g, '');

    const classe = extrairCampoHtmlPorIdOuRotulo(html, 'classeJudicial|Classe Judicial');
    const assunto = extrairCampoHtmlPorIdOuRotulo(html, 'assuntoProcesso|Assunto');
    const orgao = extrairCampoHtmlPorIdOuRotulo(html, 'orgaoJulgador|Órgão Julgador');
    const distRaw = extrairCampoHtmlPorIdOuRotulo(html, 'dataDistribuicao|Data de Distribuição');
    const valorRaw = extrairCampoHtmlPorIdOuRotulo(html, 'valorCausa|Valor da Causa');

    const partes = [];
    for (const rowHtml of extrairLinhasPorClasse(html, 'parte-row')) {
        const cols = extrairCelulasTr(rowHtml);
        if (cols.length < 2) continue;
        const rotuloPolo = stripTags(cols[0]).toUpperCase();
        const nomeParte = stripTags(cols[1]);
        const docParte = cols[2] ? stripTags(cols[2]).replace(/\D/g, '') : null;
        if (!nomeParte) continue;

        const polo = rotuloPolo.includes('PASSIVO') || rotuloPolo.includes('RÉU') || rotuloPolo.includes('REU')
            ? 'PASSIVO'
            : rotuloPolo.includes('TERCEIRO')
                ? 'TERCEIRO'
                : 'ATIVO';

        partes.push({
            polo,
            tipo_participacao: stripTags(cols[0]) || polo,
            nome: nomeParte,
            documento_cpf_cnpj: docParte || null,
            advogados: []
        });
    }

    const movimentacoes = [];
    for (const rowHtml of extrairLinhasPorClasse(html, 'movimento-row')) {
        const cols = extrairCelulasTr(rowHtml);
        if (cols.length < 2) continue;
        const dataIso = parseDataBrParaIso(stripTags(cols[0])) || new Date().toISOString();
        const titulo = stripTags(cols[1]);
        const teor = cols[2] ? stripTags(cols[2]) : titulo;
        if (!titulo) continue;

        movimentacoes.push({
            instancia: instNorm,
            data_movimentacao: dataIso,
            codigo_cnj: null,
            titulo: titulo.slice(0, 500),
            teor_completo: teor || titulo,
            fonte_captura: 'SCRAPER',
            possui_anexo: false,
            documentos_vinculados: []
        });
    }

    if (!classe && !orgao && movimentacoes.length === 0 && partes.length === 0) {
        const err = new Error('Seletores da Consulta Pública PJe TRF3 não retornaram dados estruturados.');
        err.code = 'SCRAPER_SELECTOR_ERROR';
        throw err;
    }

    return {
        numero_cnj: numeroLimpo,
        tribunal_sigla: 'TRF3',
        instancia: instNorm,
        sistema_processual: 'PJE',
        segredo_justica: false,
        fonte_captura: 'SCRAPER',
        capa: {
            classe_processual: classe,
            assunto_principal: assunto,
            orgao_julgador: orgao,
            valor_causa: parseValorMonetarioBr(valorRaw),
            data_distribuicao: parseDataBrParaIso(distRaw)
        },
        partes,
        movimentacoes
    };
};

/**
 * Parser HTML do Portal e-SAJ (TJSP) para DTO padronizado da Seção 5 (`sistema_processual = 'ESAJ'`).
 */
export const parsearHtmlEsajTjspParaDTO = (html, { numero_cnj, instancia = '1G' } = {}) => {
    if (!html || typeof html !== 'string') {
        throw new Error('HTML do Portal e-SAJ TJSP vazio ou inválido.');
    }

    const instNorm = String(instancia || '1G').toUpperCase() === '2G' ? '2G' : '1G';
    const numeroLimpo = String(numero_cnj || '').replace(/\D/g, '');

    const classe = extrairCampoHtmlPorIdOuRotulo(html, 'classeProcesso|Classe');
    const assunto = extrairCampoHtmlPorIdOuRotulo(html, 'assuntoProcesso|Assunto');
    const orgao = extrairCampoHtmlPorIdOuRotulo(html, 'varaProcesso|foroProcesso|Vara');
    const distRaw = extrairCampoHtmlPorIdOuRotulo(html, 'dataHoraDistribuicaoProcesso|Distribuição');
    const valorRaw = extrairCampoHtmlPorIdOuRotulo(html, 'valorAcaoProcesso|Valor da ação');

    const partes = [];
    const tabelaPartesMatch = html.match(/id=["']tablePartesPrincipais["'][^>]*>([\s\S]*?)<\/table>/i);
    if (tabelaPartesMatch) {
        const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let m;
        while ((m = trRegex.exec(tabelaPartesMatch[1])) !== null) {
            const cols = extrairCelulasTr(m[1]);
            if (cols.length < 2) continue;
            const tipo = stripTags(cols[0]).replace(/:$/, '');
            const nomeCompleto = stripTags(cols[1]);
            const advMatch = nomeCompleto.match(/Advogad[oa]:\s*(.+)$/i);
            const nomeParte = advMatch ? nomeCompleto.slice(0, advMatch.index).trim() : nomeCompleto;
            if (!nomeParte) continue;

            const upperTipo = tipo.toUpperCase();
            const polo = (upperTipo.includes('REQDO') || upperTipo.includes('RÉU') || upperTipo.includes('REU') || upperTipo.includes('APELAD') || upperTipo.includes('EXECUTAD'))
                ? 'PASSIVO'
                : (upperTipo.includes('TERCEIRO') ? 'TERCEIRO' : 'ATIVO');

            partes.push({
                polo,
                tipo_participacao: tipo || polo,
                nome: nomeParte,
                documento_cpf_cnpj: null,
                advogados: advMatch ? [{ nome: advMatch[1].trim(), oab: '', uf: 'SP' }] : []
            });
        }
    }

    const movimentacoes = [];
    for (const rowHtml of extrairLinhasPorClasse(html, 'containerMovimentacao')) {
        const cols = extrairCelulasTr(rowHtml);
        if (cols.length < 2) continue;
        const dataIso = parseDataBrParaIso(stripTags(cols[0])) || new Date().toISOString();
        const textoCompleto = stripTags(cols[cols.length - 1]);
        if (!textoCompleto) continue;

        const primeiraLinha = textoCompleto.split(/\s+-\s+|\n/)[0].trim() || textoCompleto;
        movimentacoes.push({
            instancia: instNorm,
            data_movimentacao: dataIso,
            codigo_cnj: null,
            titulo: primeiraLinha.slice(0, 500),
            teor_completo: textoCompleto,
            fonte_captura: 'SCRAPER',
            possui_anexo: false,
            documentos_vinculados: []
        });
    }

    if (!classe && !orgao && movimentacoes.length === 0 && partes.length === 0) {
        const err = new Error('Seletores do portal e-SAJ TJSP não retornaram dados estruturados.');
        err.code = 'SCRAPER_SELECTOR_ERROR';
        throw err;
    }

    return {
        numero_cnj: numeroLimpo,
        tribunal_sigla: 'TJSP',
        instancia: instNorm,
        sistema_processual: 'ESAJ',
        segredo_justica: false,
        fonte_captura: 'SCRAPER',
        capa: {
            classe_processual: classe,
            assunto_principal: assunto,
            orgao_julgador: orgao,
            valor_causa: parseValorMonetarioBr(valorRaw),
            data_distribuicao: parseDataBrParaIso(distRaw)
        },
        partes,
        movimentacoes
    };
};

/**
 * Executa a captura via Scraper de fallback (PJe TRF3 Consulta Pública ou e-SAJ TJSP),
 * registrando artefato de diagnóstico em caso de erro de seletor.
 */
export const executarScraperFallback = async ({
    numero_cnj,
    tribunal_sigla = null,
    instancia = '1G',
    htmlMock = null,
    httpClient = axios,
    urlOverride = null,
    storageBaseDir = DIAGNOSTICS_STORAGE_DIR
}) => {
    const numeroLimpo = String(numero_cnj || '').replace(/\D/g, '');
    const parsed = parseNumeroCNJ(numeroLimpo, { exigirDigitoVerificador: false });
    const tribunalNorm = String(tribunal_sigla || parsed.tribunal_sigla || '').trim().toUpperCase();
    const instNorm = String(instancia || parsed.instancia_sugerida || '1G').toUpperCase() === '2G' ? '2G' : '1G';

    const urlsTribunal = URLS_CONSULTA_SCRAPER[tribunalNorm];
    if (!urlsTribunal && !urlOverride) {
        const err = new Error(`Scraper de fallback não implementado para o tribunal ${tribunalNorm || 'desconhecido'}.`);
        err.code = 'SCRAPER_UNSUPPORTED_COURT';
        err.retryable = false;
        throw err;
    }

    const targetUrl = urlOverride || urlsTribunal[instNorm];
    let html = htmlMock;

    if (!html) {
        const resp = await httpClient.get(targetUrl, {
            params: { numeroProcesso: numeroLimpo },
            timeout: 20000
        });
        html = typeof resp?.data === 'string' ? resp.data : String(resp?.data || '');
    }

    try {
        if (tribunalNorm === 'TJSP') {
            return parsearHtmlEsajTjspParaDTO(html, { numero_cnj: numeroLimpo, instancia: instNorm });
        }
        return parsearHtmlPjeTrf3ParaDTO(html, { numero_cnj: numeroLimpo, instancia: instNorm });
    } catch (error) {
        await salvarDiagnosticoSeletor({
            tribunal_sigla: tribunalNorm,
            numero_cnj: numeroLimpo,
            motivo: error.message,
            htmlSnapshot: html
        }, storageBaseDir);
        throw error;
    }
};

/**
 * Handler integrado ao `ProcessSyncQueueWorker` para execução via `SCRAPER` (ou fallback automático).
 */
export const executarJobScraper = async (job, options = {}) => {
    const params = typeof job.parametros_json === 'string'
        ? JSON.parse(job.parametros_json)
        : (job.parametros_json || {});

    const dto = await executarScraperFallback({
        numero_cnj: job.numero_cnj,
        tribunal_sigla: job.tribunal_sigla,
        instancia: params.instancia || (job.instancia === 'AMBAS' ? '1G' : job.instancia) || '1G',
        htmlMock: params.htmlMock || options.htmlMock || null,
        httpClient: options.httpClient || axios,
        urlOverride: options.urlOverride || null,
        storageBaseDir: options.storageBaseDir || DIAGNOSTICS_STORAGE_DIR
    });

    return {
        dto,
        fonteEfetivaUsada: 'SCRAPER',
        status_sincronizacao: 'ATUALIZADO',
        codigo_http_ou_soap: '200-SCRAPER'
    };
};

export const CourtScraperProvider = {
    RECURSOS_BLOQUEADOS_PLAYWRIGHT,
    TTL_SESSAO_SCRAPER_MS,
    DIAGNOSTICS_STORAGE_DIR,
    URLS_CONSULTA_SCRAPER,
    gerarTokenTotp,
    salvarDiagnosticoSeletor,
    parsearHtmlPjeTrf3ParaDTO,
    parsearHtmlEsajTjspParaDTO,
    executarScraperFallback,
    executarJobScraper
};

export default CourtScraperProvider;
