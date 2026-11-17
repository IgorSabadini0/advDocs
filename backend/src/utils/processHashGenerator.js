import crypto from 'node:crypto';

/**
 * Normaliza textos para cálculo determinístico de hash (minúsculas, sem acentos, espaços colapsados).
 */
export const normalizarTextoHash = (texto) => {
    if (texto === undefined || texto === null) return '';
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
};

/**
 * Trunca data para YYYY-MM-DD preservando a data do calendário quando informada em ISO ou formato compacto CNJ.
 */
export const truncarDataMovimentacao = (dataInput) => {
    if (!dataInput) return '';

    if (dataInput instanceof Date) {
        return isNaN(dataInput.getTime()) ? '' : dataInput.toISOString().slice(0, 10);
    }

    const str = String(dataInput).trim();
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
        return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const compactMatch = str.match(/^(\d{4})(\d{2})(\d{2})/);
    if (compactMatch) {
        return `${compactMatch[1]}-${compactMatch[2]}-${compactMatch[3]}`;
    }

    const parsed = new Date(str);
    return isNaN(parsed.getTime()) ? '' : parsed.toISOString().slice(0, 10);
};

const sha256Hex = (conteudo) => {
    return crypto.createHash('sha256').update(String(conteudo), 'utf8').digest('hex');
};

/**
 * Calcula hash SHA-256 idempotente de uma movimentação processual conforme Seção 5:
 * SHA-256(processo_id + "|" + instancia + "|" + data_truncada + "|" + COALESCE(codigo_cnj, 0) + "|" + titulo_normalizado)
 */
export const gerarHashMovimentacao = ({
    processo_id,
    instancia = '1G',
    data_movimentacao,
    codigo_cnj = 0,
    titulo
}) => {
    const idNorm = Number(processo_id) || 0;
    const instanciaNorm = String(instancia || '1G').trim().toUpperCase();
    const dataTruncada = truncarDataMovimentacao(data_movimentacao);
    const codigoNorm = (codigo_cnj !== undefined && codigo_cnj !== null && !isNaN(Number(codigo_cnj)))
        ? Number(codigo_cnj)
        : 0;
    const tituloNorm = normalizarTextoHash(titulo);

    const base = `${idNorm}|${instanciaNorm}|${dataTruncada}|${codigoNorm}|${tituloNorm}`;
    return sha256Hex(base);
};

/**
 * Calcula hash SHA-256 determinístico de uma parte processual para evitar duplicações em `processo_partes`.
 */
export const gerarHashParte = ({
    polo = 'OUTRO',
    tipo_participacao = '',
    nome = '',
    documento_cpf_cnpj = ''
}) => {
    const poloNorm = String(polo || 'OUTRO').trim().toUpperCase();
    const participacaoNorm = normalizarTextoHash(tipo_participacao);
    const nomeNorm = normalizarTextoHash(nome);
    const docDigits = String(documento_cpf_cnpj || '').replace(/\D/g, '');

    const base = `${poloNorm}|${participacaoNorm}|${nomeNorm}|${docDigits}`;
    return sha256Hex(base);
};

/**
 * Calcula hash SHA-256 determinístico dos dados da capa processual para detectar alterações relevantes.
 */
export const gerarHashCapa = (capa = {}, extra = {}) => {
    const payloadCanonic = {
        classe_processual: normalizarTextoHash(capa?.classe_processual),
        assunto_principal: normalizarTextoHash(capa?.assunto_principal),
        orgao_julgador: normalizarTextoHash(capa?.orgao_julgador),
        valor_causa: capa?.valor_causa !== undefined && capa?.valor_causa !== null ? Number(capa.valor_causa).toFixed(2) : '',
        data_distribuicao: truncarDataMovimentacao(capa?.data_distribuicao),
        segredo_justica: Boolean(extra?.segredo_justica ?? capa?.segredo_justica)
    };
    return sha256Hex(JSON.stringify(payloadCanonic));
};

export const ProcessHashGenerator = {
    normalizarTextoHash,
    truncarDataMovimentacao,
    gerarHashMovimentacao,
    gerarHashParte,
    gerarHashCapa
};

export default ProcessHashGenerator;
