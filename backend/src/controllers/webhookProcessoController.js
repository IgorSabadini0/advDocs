import crypto from 'node:crypto';
import { db } from '../config/db.js';
import { ProcessPersistenceService } from '../services/processPersistenceService.js';
import { parseNumeroCNJ } from '../utils/cnjParser.js';

let hasWarnedDevWebhookSecret = false;

export const resolveWebhookSecret = (secretOverride = null) => {
    const segredo = secretOverride ?? process.env.WEBHOOK_HMAC_SECRET;
    if (typeof segredo === 'string' && segredo.trim() !== '') {
        return segredo.trim();
    }

    if (!hasWarnedDevWebhookSecret) {
        hasWarnedDevWebhookSecret = true;
        console.warn('[WebhookProcesso] WEBHOOK_HMAC_SECRET não definida; usando segredo de desenvolvimento.');
    }

    return process.env.JWT_SECRET || 'advdocs-dev-webhook-hmac-secret-configure-em-producao';
};

/**
 * Calcula assinatura HMAC-SHA256 em hexadecimal para payload bruto do webhook.
 */
export const calcularAssinaturaHmacWebhook = (rawBody, secretOverride = null) => {
    const secret = resolveWebhookSecret(secretOverride);
    const bufferBody = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
    return crypto.createHmac('sha256', secret).update(bufferBody).digest('hex');
};

/**
 * Valida cabeçalho HMAC (`sha256=<hex>` ou `<hex>`) usando comparação segura em tempo constante.
 */
export const validarAssinaturaHmacWebhook = (rawBody, signatureHeader, secretOverride = null) => {
    if (!signatureHeader || typeof signatureHeader !== 'string') {
        return false;
    }

    const hexRecebido = signatureHeader.trim().replace(/^sha256=/i, '').toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(hexRecebido)) {
        return false;
    }

    const hexEsperado = calcularAssinaturaHmacWebhook(rawBody, secretOverride);
    const bufEsperado = Buffer.from(hexEsperado, 'hex');
    const bufRecebido = Buffer.from(hexRecebido, 'hex');

    if (bufEsperado.length !== bufRecebido.length) {
        return false;
    }

    return crypto.timingSafeEqual(bufEsperado, bufRecebido);
};

/**
 * Normaliza payloads recebidos de APIs agregadoras B2B (Judit/Escavador/Codilo)
 * ou no formato DTO direto da Seção 5 para ingestão padronizada via `WEBHOOK_EXTERNO`.
 */
export const normalizarPayloadWebhookParaDTO = (payload = {}) => {
    const origem = payload?.processo && typeof payload.processo === 'object' ? payload.processo : payload;
    const rawNumero = origem.numero_cnj || origem.numeroProcesso || origem.cnj || origem.code || payload.numero_cnj;
    const digits = String(rawNumero || '').replace(/\D/g, '');
    const parsed = parseNumeroCNJ(digits, { exigirDigitoVerificador: false });

    const capaRaw = origem.capa && typeof origem.capa === 'object' ? origem.capa : origem;
    const partesRaw = Array.isArray(origem.partes)
        ? origem.partes
        : (Array.isArray(origem.parties) ? origem.parties : []);

    const partes = partesRaw.map(pt => ({
        polo: pt.polo || 'OUTRO',
        tipo_participacao: pt.tipo_participacao || pt.tipo || pt.polo || 'PARTE',
        nome: pt.nome || pt.name || 'Não informado',
        documento_cpf_cnpj: pt.documento_cpf_cnpj || pt.documento || pt.document || null,
        advogados: Array.isArray(pt.advogados) ? pt.advogados : (Array.isArray(pt.lawyers) ? pt.lawyers : [])
    }));

    const movsRaw = Array.isArray(origem.movimentacoes)
        ? origem.movimentacoes
        : (Array.isArray(origem.andamentos)
            ? origem.andamentos
            : (Array.isArray(origem.steps) ? origem.steps : []));

    const instanciaDefault = origem.instancia || parsed.instancia_sugerida || '1G';

    const movimentacoes = movsRaw.map(m => ({
        instancia: m.instancia || (instanciaDefault === 'AMBAS' ? '1G' : instanciaDefault),
        data_movimentacao: m.data_movimentacao || m.dataHora || m.date || new Date().toISOString(),
        codigo_cnj: m.codigo_cnj ?? m.codigo ?? null,
        titulo: m.titulo || m.nome || m.title || 'Movimentação via Webhook',
        teor_completo: m.teor_completo || m.conteudo || m.content || m.titulo || m.nome || null,
        fonte_captura: 'WEBHOOK_EXTERNO',
        possui_anexo: Boolean(m.possui_anexo || (Array.isArray(m.documentos_vinculados) && m.documentos_vinculados.length > 0)),
        documentos_vinculados: Array.isArray(m.documentos_vinculados) ? m.documentos_vinculados : []
    }));

    return {
        numero_cnj: digits,
        tribunal_sigla: origem.tribunal_sigla || parsed.tribunal_sigla || 'TRF3',
        instancia: instanciaDefault,
        sistema_processual: origem.sistema_processual || parsed.sistema_processual || 'PJE',
        segredo_justica: Boolean(origem.segredo_justica),
        fonte_captura: 'WEBHOOK_EXTERNO',
        capa: {
            classe_processual: capaRaw.classe_processual || capaRaw.classe || null,
            assunto_principal: capaRaw.assunto_principal || capaRaw.assunto || null,
            orgao_julgador: capaRaw.orgao_julgador || capaRaw.orgaoJulgador || null,
            valor_causa: capaRaw.valor_causa ?? null,
            data_distribuicao: capaRaw.data_distribuicao || null
        },
        partes,
        movimentacoes
    };
};

/**
 * POST /api/webhooks/processos
 * Autenticado via assinatura HMAC-SHA256 (`X-Webhook-Signature` ou `X-Hub-Signature-256`).
 */
const receberWebhookProcesso = async (req, res) => {
    try {
        const assinatura = req.headers['x-webhook-signature'] || req.headers['x-hub-signature-256'];
        const rawBody = req.rawBody ?? JSON.stringify(req.body || {});

        if (!validarAssinaturaHmacWebhook(rawBody, assinatura)) {
            return res.status(401).json({
                mensagem: 'Assinatura HMAC do webhook ausente ou inválida.'
            });
        }

        const dto = normalizarPayloadWebhookParaDTO(req.body);
        const parsed = parseNumeroCNJ(dto.numero_cnj, { exigirDigitoVerificador: true });
        if (!parsed.valido) {
            return res.status(400).json({
                mensagem: parsed.erro || 'Número CNJ inválido no payload do webhook.'
            });
        }

        const escritorioId = Number(req.body?.escritorio_id) > 0 ? Number(req.body.escritorio_id) : 1;
        const persistRes = await ProcessPersistenceService.persistirProcessoDTO(dto, {
            escritorio_id: escritorioId,
            status_sincronizacao: 'ATUALIZADO',
            exigirDigitoVerificador: true
        });

        const [resJob] = await db.query(`
            INSERT INTO jobs_sincronizacao (
                processo_id, tipo_job, fonte_utilizada, status,
                tentativa_atual, max_tentativas, novas_movimentacoes_inseridas,
                codigo_http_ou_soap, finalizado_em
            ) VALUES (?, 'SYNC_PROCESSO', 'WEBHOOK_EXTERNO', 'SUCESSO', 1, 1, ?, '200-WEBHOOK', NOW())
        `, [persistRes.processo_id, persistRes.novas_movimentacoes_inseridas]);

        return res.status(200).json({
            mensagem: 'Webhook processual ingerido com sucesso.',
            job_id: resJob.insertId,
            processo_id: persistRes.processo_id,
            numero_cnj: persistRes.numero_cnj,
            tribunal_sigla: persistRes.tribunal_sigla,
            novas_movimentacoes_inseridas: persistRes.novas_movimentacoes_inseridas
        });
    } catch (error) {
        if (error.code === 'INVALID_CNJ') {
            return res.status(400).json({ mensagem: error.message });
        }
        console.error('Erro ao processar webhook de processo:', error);
        return res.status(500).json({ mensagem: 'Erro interno ao processar webhook processual.' });
    }
};

export const webhookProcessoController = {
    resolveWebhookSecret,
    calcularAssinaturaHmacWebhook,
    validarAssinaturaHmacWebhook,
    normalizarPayloadWebhookParaDTO,
    receberWebhookProcesso
};

export default webhookProcessoController;
