import axios from 'axios';

const MAPA_JUSTICA_ESTADUAL = {
    '01': 'tjac', '02': 'tjal', '03': 'tjap', '04': 'tjam', '05': 'tjba',
    '06': 'tjce', '07': 'tjdft', '08': 'tjes', '09': 'tjgo', '10': 'tjma',
    '11': 'tjmt', '12': 'tjms', '13': 'tjmg', '14': 'tjpa', '15': 'tjpb',
    '16': 'tjpr', '17': 'tjpe', '18': 'tjpi', '19': 'tjrj', '20': 'tjrn',
    '21': 'tjrs', '22': 'tjro', '23': 'tjrr', '24': 'tjsc', '25': 'tjse',
    '26': 'tjsp', '27': 'tjto'
};

const MAPA_JUSTICA_FEDERAL = {
    '01': 'trf1', '02': 'trf2', '03': 'trf3',
    '04': 'trf4', '05': 'trf5', '06': 'trf6'
};

const TRIBUNAIS_PERMITIDOS = new Set([
    ...Object.values(MAPA_JUSTICA_ESTADUAL),
    ...Object.values(MAPA_JUSTICA_FEDERAL),
    ...Array.from({ length: 24 }, (_, i) => `trt${i + 1}`),
    'stj', 'tst', 'tse', 'stm'
]);

/**
 * Identifica o alias do tribunal na API pública do DataJud a partir dos 20 dígitos do número CNJ.
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
 */
export function identificarTribunalCNJ(numeroLimpo) {
    if (!numeroLimpo || numeroLimpo.length !== 20) {
        return 'tjsp';
    }

    const ramoJustica = numeroLimpo.substring(13, 14);
    const codigoTribunal = numeroLimpo.substring(14, 16);

    if (ramoJustica === '8' && MAPA_JUSTICA_ESTADUAL[codigoTribunal]) {
        return MAPA_JUSTICA_ESTADUAL[codigoTribunal];
    }

    if (ramoJustica === '4' && MAPA_JUSTICA_FEDERAL[codigoTribunal]) {
        return MAPA_JUSTICA_FEDERAL[codigoTribunal];
    }

    if (ramoJustica === '5') {
        const trtNum = parseInt(codigoTribunal, 10);
        if (trtNum >= 1 && trtNum <= 24) {
            return `trt${trtNum}`;
        }
    }

    if (ramoJustica === '3') {
        return 'stj';
    }

    return 'tjsp';
}

/**
 * Normaliza a estrutura retornada pelo DataJud (_source) para consumo no sistema.
 */
export function normalizarDadosProcesso(source, tribunalAlias) {
    const assuntosRaw = Array.isArray(source.assuntos) ? source.assuntos.flat() : [];
    const assuntos = assuntosRaw
        .map(a => a?.nome)
        .filter(Boolean);

    const movimentosRaw = Array.isArray(source.movimentos) ? source.movimentos : [];
    const movimentos = movimentosRaw
        .map(m => ({
            codigo: m.codigo || null,
            nome: m.nome || 'Movimentação sem descrição',
            dataHora: m.dataHora || null,
            complementos: Array.isArray(m.complementosTabelados)
                ? m.complementosTabelados.map(c => ({
                    nome: c.nome || c.descricao || '',
                    descricao: c.descricao || ''
                })).filter(c => c.nome || c.descricao)
                : []
        }))
        .sort((a, b) => {
            const dataA = a.dataHora ? new Date(a.dataHora).getTime() : 0;
            const dataB = b.dataHora ? new Date(b.dataHora).getTime() : 0;
            return dataB - dataA;
        });

    // Extração de polos e partes processuais (conforme disponibilizado pelo tribunal / MNI)
    const poloAtivo = [];
    const poloPassivo = [];

    const extrairNomeParte = (item) => {
        if (!item) return '';
        if (typeof item === 'string') return item.trim();
        return (item.pessoa?.nome || item.nome || item.nomeParte || item.razaoSocial || '').trim();
    };

    const polos = source.dadosBasicos?.polo || source.polo || [];
    if (Array.isArray(polos)) {
        for (const p of polos) {
            const tipoPolo = String(p.polo || p.tipoPolo || '').toUpperCase();
            const partes = Array.isArray(p.parte) ? p.parte : (Array.isArray(p.partes) ? p.partes : [p]);
            for (const pt of partes) {
                const nome = extrairNomeParte(pt);
                if (!nome) continue;
                if (tipoPolo.includes('ATIVO') || tipoPolo === 'AT' || tipoPolo === 'AUTOR' || tipoPolo === 'REQUERENTE' || tipoPolo === 'EXEQUENTE') {
                    if (!poloAtivo.includes(nome)) poloAtivo.push(nome);
                } else if (tipoPolo.includes('PASSIVO') || tipoPolo === 'PA' || tipoPolo === 'REU' || tipoPolo === 'REQUERIDO' || tipoPolo === 'EXECUTADO') {
                    if (!poloPassivo.includes(nome)) poloPassivo.push(nome);
                }
            }
        }
    }

    if (Array.isArray(source.partes)) {
        for (const pt of source.partes) {
            const polo = String(pt.polo || pt.tipo || '').toUpperCase();
            const nome = extrairNomeParte(pt);
            if (!nome) continue;
            if (polo.includes('ATIVO') || polo === 'AUTOR' || polo === 'REQUERENTE' || polo === 'EXEQUENTE') {
                if (!poloAtivo.includes(nome)) poloAtivo.push(nome);
            } else if (polo.includes('PASSIVO') || polo === 'REU' || polo === 'REQUERIDO' || polo === 'EXECUTADO') {
                if (!poloPassivo.includes(nome)) poloPassivo.push(nome);
            }
        }
    }

    const autor = poloAtivo[0] || null;
    const reu = poloPassivo[0] || null;

    return {
        numeroProcesso: source.numeroProcesso || '',
        tribunal: source.tribunal || tribunalAlias.toUpperCase(),
        grau: source.grau || 'N/A',
        classe: source.classe?.nome || 'Não informada',
        codigoClasse: source.classe?.codigo || null,
        sistema: source.sistema?.nome || 'Não informado',
        formato: source.formato?.nome || 'Não informado',
        orgaoJulgador: source.orgaoJulgador?.nome || 'Não informado',
        dataAjuizamento: source.dataAjuizamento || null,
        dataHoraUltimaAtualizacao: source.dataHoraUltimaAtualizacao || null,
        nivelSigilo: source.nivelSigilo ?? 0,
        assuntos,
        autor,
        reu,
        poloAtivo,
        poloPassivo,
        ultimaMovimentacao: movimentos[0] || null,
        totalMovimentacoes: movimentos.length,
        movimentos
    };
}

/**
 * Busca um processo na API Pública do DataJud (CNJ).
 * @param {string} numeroProcesso Número do processo (com ou sem máscara CNJ)
 * @param {string} [tribunalOverride] Alias opcional do tribunal (ex: 'tjsp', 'trf3')
 */
export async function buscarProcesso(numeroProcesso, tribunalOverride = null) {
    const numeroLimpo = String(numeroProcesso || '').replace(/\D/g, '');

    if (numeroLimpo.length !== 20) {
        const erro = new Error('O número do processo no padrão CNJ deve conter 20 dígitos.');
        erro.code = 'INVALID_CNJ_LENGTH';
        throw erro;
    }

    const tribunalAlias = String(tribunalOverride || identificarTribunalCNJ(numeroLimpo)).trim().toLowerCase();
    if (!TRIBUNAIS_PERMITIDOS.has(tribunalAlias)) {
        const erro = new Error('Tribunal informado é inválido ou não permitido.');
        erro.code = 'INVALID_COURT';
        throw erro;
    }

    const apiKey = process.env.APIKEY;
    if (!apiKey) {
        const erro = new Error('Chave da API do DataJud (APIKEY) não configurada no ambiente.');
        erro.code = 'DATAJUD_API_ERROR';
        throw erro;
    }

    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${encodeURIComponent(tribunalAlias)}/_search`;

    try {
        const response = await axios.post(
            url,
            {
                query: {
                    match: {
                        numeroProcesso: numeroLimpo
                    }
                }
            },
            {
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 40000
            }
        );

        const hits = response.data?.hits?.hits || [];
        if (hits.length === 0) {
            return null;
        }

        // Ordena as instâncias retornadas pela última atualização mais recente
        const hitsOrdenados = [...hits].sort((a, b) => {
            const dA = a._source?.dataHoraUltimaAtualizacao ? new Date(a._source.dataHoraUltimaAtualizacao).getTime() : 0;
            const dB = b._source?.dataHoraUltimaAtualizacao ? new Date(b._source.dataHoraUltimaAtualizacao).getTime() : 0;
            return dB - dA;
        });

        const principal = normalizarDadosProcesso(hitsOrdenados[0]._source, tribunalAlias);
        const instancias = hitsOrdenados.map(h => normalizarDadosProcesso(h._source, tribunalAlias));

        return {
            ...principal,
            instancias
        };
    } catch (error) {
        console.error('Erro ao buscar processo no DataJud:', error.message);
        const erroApi = new Error('Não foi possível consultar a API do DataJud no momento.');
        erroApi.code = 'DATAJUD_API_ERROR';
        erroApi.cause = error;
        throw erroApi;
    }
}
