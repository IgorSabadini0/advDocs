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
