/**
 * Parser e detector automático de Tribunal no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).
 * Compatível com os 20 dígitos numéricos (com ou sem pontuação).
 */

export const MAPA_TJ_ESTADUAL = {
    '01': 'TJAC',
    '02': 'TJAL',
    '03': 'TJAP',
    '04': 'TJAM',
    '05': 'TJBA',
    '06': 'TJCE',
    '07': 'TJDFT',
    '08': 'TJES',
    '09': 'TJGO',
    '10': 'TJMA',
    '11': 'TJMT',
    '12': 'TJMS',
    '13': 'TJMG',
    '14': 'TJPA',
    '15': 'TJPB',
    '16': 'TJPR',
    '17': 'TJPE',
    '18': 'TJPI',
    '19': 'TJRJ',
    '20': 'TJRN',
    '21': 'TJRS',
    '22': 'TJRO',
    '23': 'TJRR',
    '24': 'TJSC',
    '25': 'TJSE',
    '26': 'TJSP',
    '27': 'TJTO'
};

export const MAPA_TRE_ELEITORAL = {
    '01': 'TRE-AC',
    '02': 'TRE-AL',
    '03': 'TRE-AP',
    '04': 'TRE-AM',
    '05': 'TRE-BA',
    '06': 'TRE-CE',
    '07': 'TRE-DF',
    '08': 'TRE-ES',
    '09': 'TRE-GO',
    '10': 'TRE-MA',
    '11': 'TRE-MT',
    '12': 'TRE-MS',
    '13': 'TRE-MG',
    '14': 'TRE-PA',
    '15': 'TRE-PB',
    '16': 'TRE-PR',
    '17': 'TRE-PE',
    '18': 'TRE-PI',
    '19': 'TRE-RJ',
    '20': 'TRE-RN',
    '21': 'TRE-RS',
    '22': 'TRE-RO',
    '23': 'TRE-RR',
    '24': 'TRE-SC',
    '25': 'TRE-SE',
    '26': 'TRE-SP',
    '27': 'TRE-TO'
};

export const MAPA_MILITAR_ESTADUAL = {
    '13': 'TJMMG',
    '21': 'TJMRS',
    '26': 'TJMSP'
};

export const ENDPOINTS_TRF3 = {
    datajud: 'https://api-publica.datajud.cnj.jus.br/api_publica_trf3/_search',
    mni_1g: 'https://pje1g.trf3.jus.br/pje/intercomunicacao?wsdl',
    mni_2g: 'https://pje2g.trf3.jus.br/pje/intercomunicacao?wsdl',
    consulta_publica_1g: 'https://pje1g.trf3.jus.br/pje/ConsultaPublica/listView.seam',
    consulta_publica_2g: 'https://pje2g.trf3.jus.br/pje/ConsultaPublica/listView.seam'
};

const construirUrlDatajudPorAlias = (alias) => `https://api-publica.datajud.cnj.jus.br/api_publica_${alias}/_search`;

export const DICIONARIO_ENDPOINTS_DATAJUD = (() => {
    const mapa = {
        '3.00': construirUrlDatajudPorAlias('stj'),
        '5.00': construirUrlDatajudPorAlias('tst'),
        '6.00': construirUrlDatajudPorAlias('tse'),
        '7.00': construirUrlDatajudPorAlias('stm')
    };

    for (let i = 1; i <= 6; i++) {
        mapa[`4.${String(i).padStart(2, '0')}`] = construirUrlDatajudPorAlias(`trf${i}`);
    }
    mapa['4.03'] = ENDPOINTS_TRF3.datajud;

    for (let i = 1; i <= 24; i++) {
        mapa[`5.${String(i).padStart(2, '0')}`] = construirUrlDatajudPorAlias(`trt${i}`);
    }

    for (const [codigo, sigla] of Object.entries(MAPA_TJ_ESTADUAL)) {
        mapa[`8.${codigo}`] = construirUrlDatajudPorAlias(sigla.toLowerCase());
    }

    for (const [codigo, sigla] of Object.entries(MAPA_TRE_ELEITORAL)) {
        mapa[`6.${codigo}`] = construirUrlDatajudPorAlias(sigla.toLowerCase().replace(/[\s_-]+/g, ''));
    }

    for (let i = 1; i <= 12; i++) {
        mapa[`7.${String(i).padStart(2, '0')}`] = construirUrlDatajudPorAlias('stm');
    }

    for (const [codigo, sigla] of Object.entries(MAPA_MILITAR_ESTADUAL)) {
        mapa[`9.${codigo}`] = construirUrlDatajudPorAlias(sigla.toLowerCase());
    }

    return Object.freeze(mapa);
})();

const ALIASES_DATAJUD_PERMITIDOS = new Set([
    ...Object.values(MAPA_TJ_ESTADUAL).map(s => s.toLowerCase()),
    ...Array.from({ length: 6 }, (_, i) => `trf${i + 1}`),
    ...Array.from({ length: 24 }, (_, i) => `trt${i + 1}`),
    ...Object.values(MAPA_TRE_ELEITORAL).map(s => s.toLowerCase().replace(/[\s_-]+/g, '')),
    ...Object.values(MAPA_MILITAR_ESTADUAL).map(s => s.toLowerCase()),
    'stj', 'tst', 'tse', 'stm'
]);

const SEQUENCIA_REPETIDA_CNJ = /^(\d)\1+$/;

const normalizarTribunalSigla = (legivel) => {
    if (!legivel) return null;
    return String(legivel).trim().toUpperCase().replace(/^([A-Z]+)-0*(\d+)$/, '$1$2');
};

const resolverSistemaProcessual = (j, tr) => {
    if (j === '4' && tr === '03') return 'PJE';
    if (j === '4' && (tr === '02' || tr === '04')) return 'EPROC';
    if (j === '8' && tr === '26') return 'ESAJ';
    if (j === '4' || j === '5' || j === '8' || j === '6') return 'PJE';
    return 'DESCONHECIDO';
};

const resolverInstanciaSugerida = (j, tr, origem) => {
    if (j === '1' || j === '2' || j === '3' || ((j === '4' || j === '5' || j === '6' || j === '7') && tr === '00')) {
        return 'SUPERIOR';
    }
    return origem === '0000' ? '2G' : '1G';
};

/**
 * Formata 20 dígitos numéricos no padrão CNJ (NNNNNNN-DD.AAAA.J.TR.OOOO).
 */
export const formatarNumeroCNJ = (valor) => {
    const digits = String(valor || '').replace(/\D/g, '');
    if (digits.length !== 20) return null;
    return `${digits.slice(0, 7)}-${digits.slice(7, 9)}.${digits.slice(9, 13)}.${digits.slice(13, 14)}.${digits.slice(14, 16)}.${digits.slice(16, 20)}`;
};

/**
 * Calcula o dígito verificador (DD) Módulo 97 conforme Resolução CNJ nº 65/2008.
 */
export const calcularDigitoVerificadorCNJ = (sequencial7, ano4, j1, tr2, origem4) => {
    const base = `${String(sequencial7).padStart(7, '0')}${String(ano4).padStart(4, '0')}${String(j1)}${String(tr2).padStart(2, '0')}${String(origem4).padStart(4, '0')}00`;
    const resto = BigInt(base) % 97n;
    const dd = 98n - resto;
    return String(dd).padStart(2, '0');
};

/**
 * Valida o dígito verificador (DD) de um número CNJ de 20 dígitos pela regra Módulo 97.
 */
export const validarDigitoVerificadorCNJ = (valor) => {
    const digits = String(valor || '').replace(/\D/g, '');
    if (digits.length !== 20 || SEQUENCIA_REPETIDA_CNJ.test(digits)) {
        return false;
    }

    const sequencial = digits.slice(0, 7);
    const dd = digits.slice(7, 9);
    const ano = digits.slice(9, 13);
    const j = digits.slice(13, 14);
    const tr = digits.slice(14, 16);
    const origem = digits.slice(16, 20);

    return dd === calcularDigitoVerificadorCNJ(sequencial, ano, j, tr, origem);
};

const resolverPorSegmentos = (j, tr) => {
    if (j === '1' && tr === '00') return 'STF';
    if (j === '2' && tr === '00') return 'CNJ';
    if (j === '3' && tr === '00') return 'STJ';

    if (j === '4') {
        if (tr === '00') return 'CJF';
        const num = parseInt(tr, 10);
        if (num >= 1 && num <= 6) return `TRF-${num}`;
        return null;
    }

    if (j === '5') {
        if (tr === '00') return 'TST';
        const num = parseInt(tr, 10);
        if (num >= 1 && num <= 24) return `TRT-${String(num).padStart(2, '0')}`;
        return null;
    }

    if (j === '6') {
        if (tr === '00') return 'TSE';
        return MAPA_TRE_ELEITORAL[tr] || null;
    }

    if (j === '7') {
        if (tr === '00') return 'STM';
        const num = parseInt(tr, 10);
        if (num >= 1 && num <= 12) return 'STM';
        return null;
    }

    if (j === '8') {
        return MAPA_TJ_ESTADUAL[tr] || null;
    }

    if (j === '9') {
        return MAPA_MILITAR_ESTADUAL[tr] || null;
    }

    return null;
};

/**
 * Extrai os segmentos J (órgão do Judiciário) e TR (tribunal) de um número CNJ
 * (formatado ou apenas dígitos) assim que houver ao menos 16 dígitos.
 */
export const extrairSegmentosCNJ = (valor) => {
    const digits = String(valor || '').replace(/\D/g, '').slice(0, 20);

    if (digits.length < 16) {
        return {
            valido: false,
            completo: false,
            digitos: digits,
            j: null,
            tr: null,
            codigoJTR: null,
            tribunal: null
        };
    }

    const j = digits.slice(13, 14);
    const tr = digits.slice(14, 16);
    const codigoJTR = `${j}.${tr}`;
    const tribunal = resolverPorSegmentos(j, tr);

    return {
        valido: Boolean(tribunal),
        completo: digits.length === 20,
        digitos: digits,
        j,
        tr,
        codigoJTR,
        tribunal
    };
};

/**
 * Retorna apenas a sigla do tribunal detectada via CNJ ou null.
 */
export const detectarTribunalCNJ = (valor) => {
    return extrairSegmentosCNJ(valor).tribunal;
};

/**
 * Converte rótulos legíveis (ex: "TRT-15", "TRT-02", "TRF-3", "TJSP") para o alias aceito pelo DataJud.
 */
export const paraAliasDatajud = (tribunalOuAlias) => {
    const raw = String(tribunalOuAlias || '').trim().toLowerCase();
    if (!raw) return null;

    const semHifen = raw.replace(/[\s_-]+/g, '');
    const trtMatch = semHifen.match(/^trt0*(\d{1,2})$/);
    if (trtMatch) {
        return `trt${parseInt(trtMatch[1], 10)}`;
    }

    const trfMatch = semHifen.match(/^trf0*(\d{1})$/);
    if (trfMatch) {
        return `trf${parseInt(trfMatch[1], 10)}`;
    }

    return semHifen;
};

/**
 * Faz o parse completo de um número CNJ validando formato, módulo 97, código J.TR,
 * roteamento prioritário do TRF3 e metadados estruturados.
 */
export const parseNumeroCNJ = (valor, { exigirDigitoVerificador = true } = {}) => {
    const digits = String(valor || '').replace(/\D/g, '');
    if (digits.length !== 20 || SEQUENCIA_REPETIDA_CNJ.test(digits)) {
        return {
            valido: false,
            digitoVerificadorValido: false,
            numero_cnj: digits || null,
            numero_cnj_formatado: null,
            sequencial: null,
            digito_verificador: null,
            ano: null,
            justica_codigo: null,
            tribunal_codigo: null,
            codigo_origem: null,
            codigoJTR: null,
            tribunal_sigla: null,
            tribunal_legivel: null,
            alias_datajud: null,
            sistema_processual: 'DESCONHECIDO',
            instancia_sugerida: '1G',
            is_trf3: false,
            endpoints: null,
            erro: 'Número do processo no padrão CNJ deve conter 20 dígitos numéricos válidos.'
        };
    }

    const sequencial = digits.slice(0, 7);
    const digito_verificador = digits.slice(7, 9);
    const ano = digits.slice(9, 13);
    const justica_codigo = digits.slice(13, 14);
    const tribunal_codigo = digits.slice(14, 16);
    const codigo_origem = digits.slice(16, 20);
    const codigoJTR = `${justica_codigo}.${tribunal_codigo}`;

    const tribunal_legivel = resolverPorSegmentos(justica_codigo, tribunal_codigo);
    const tribunal_sigla = normalizarTribunalSigla(tribunal_legivel);
    const alias_datajud = tribunal_legivel ? paraAliasDatajud(tribunal_legivel) : null;
    const digitoVerificadorValido = validarDigitoVerificadorCNJ(digits);
    const is_trf3 = justica_codigo === '4' && tribunal_codigo === '03';

    let erro = null;
    if (!tribunal_legivel) {
        erro = `Código de Justiça/Tribunal CNJ (${codigoJTR}) não reconhecido.`;
    } else if (exigirDigitoVerificador && !digitoVerificadorValido) {
        erro = 'Dígito verificador (Módulo 97) do número CNJ é inválido.';
    }

    const valido = Boolean(tribunal_legivel) && (!exigirDigitoVerificador || digitoVerificadorValido);

    return {
        valido,
        digitoVerificadorValido,
        numero_cnj: digits,
        numero_cnj_formatado: formatarNumeroCNJ(digits),
        sequencial,
        digito_verificador,
        ano,
        justica_codigo,
        tribunal_codigo,
        codigo_origem,
        codigoJTR,
        tribunal_sigla,
        tribunal_legivel,
        alias_datajud,
        sistema_processual: resolverSistemaProcessual(justica_codigo, tribunal_codigo),
        instancia_sugerida: resolverInstanciaSugerida(justica_codigo, tribunal_codigo, codigo_origem),
        is_trf3,
        endpoints: is_trf3
            ? ENDPOINTS_TRF3
            : (alias_datajud
                ? { datajud: `https://api-publica.datajud.cnj.jus.br/api_publica_${alias_datajud}/_search` }
                : null),
        erro
    };
};

/**
 * Resolve a URL oficial do DataJud a partir de um número CNJ (com ou sem máscara),
 * de um código "J.TR" (ex: "4.03", "8.26") ou de uma sigla explícita (`tribunalOverride`).
 */
export const resolverEndpointDatajud = (numeroCnjOuCodigoJTR, tribunalOverride = null) => {
    if (tribunalOverride && String(tribunalOverride).trim() !== '') {
        const aliasOverride = paraAliasDatajud(tribunalOverride);
        if (aliasOverride && ALIASES_DATAJUD_PERMITIDOS.has(aliasOverride)) {
            return construirUrlDatajudPorAlias(aliasOverride);
        }
        return null;
    }

    const raw = String(numeroCnjOuCodigoJTR || '').trim();
    if (/^\d\.\d{2}$/.test(raw)) {
        return DICIONARIO_ENDPOINTS_DATAJUD[raw] || null;
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.length >= 16) {
        const codigoJTR = `${digits.slice(13, 14)}.${digits.slice(14, 16)}`;
        return DICIONARIO_ENDPOINTS_DATAJUD[codigoJTR] || null;
    }

    return null;
};

export const CNJParser = {
    ENDPOINTS_TRF3,
    DICIONARIO_ENDPOINTS_DATAJUD,
    extrairSegmentosCNJ,
    detectarTribunalCNJ,
    paraAliasDatajud,
    resolverEndpointDatajud,
    formatarNumeroCNJ,
    calcularDigitoVerificadorCNJ,
    validarDigitoVerificadorCNJ,
    parse: parseNumeroCNJ,
    parseNumeroCNJ
};

export default CNJParser;
