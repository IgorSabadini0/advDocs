import axios from 'axios';
import {
    detectarTribunalCNJ,
    paraAliasDatajud,
    MAPA_TJ_ESTADUAL,
    MAPA_TRE_ELEITORAL,
    MAPA_MILITAR_ESTADUAL
} from '../utils/cnjParser.js';

const ORGAOS_SEM_API_PUBLICA = new Set(['stf', 'cnj', 'cjf']);

const TRIBUNAIS_PERMITIDOS = new Set([
    ...Object.values(MAPA_TJ_ESTADUAL).map(paraAliasDatajud),
    ...Array.from({ length: 6 }, (_, i) => `trf${i + 1}`),
    ...Array.from({ length: 24 }, (_, i) => `trt${i + 1}`),
    ...Object.values(MAPA_TRE_ELEITORAL).map(paraAliasDatajud),
    ...Object.values(MAPA_MILITAR_ESTADUAL).map(paraAliasDatajud),
    'stj', 'tst', 'tse', 'stm'
]);

/**
 * Identifica o alias do tribunal na API pública do DataJud a partir dos 20 dígitos do número CNJ.
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO
 */
export function identificarTribunalCNJ(numeroLimpo) {
    const digits = String(numeroLimpo || '').replace(/\D/g, '');
    if (digits.length !== 20) {
        return null;
    }

    const sigla = detectarTribunalCNJ(digits);
    return sigla ? paraAliasDatajud(sigla) : null;
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

    const tribunalOverrideLimpo = tribunalOverride && String(tribunalOverride).trim() !== ''
        ? paraAliasDatajud(tribunalOverride)
        : null;
    const tribunalAlias = tribunalOverrideLimpo || identificarTribunalCNJ(numeroLimpo);

    if (tribunalAlias && ORGAOS_SEM_API_PUBLICA.has(tribunalAlias)) {
        const erro = new Error('O órgão/tribunal deste processo (STF/CNJ/CJF) não disponibiliza consulta pública na API do DataJud.');
        erro.code = 'INVALID_COURT';
        throw erro;
    }

    if (!tribunalAlias || !TRIBUNAIS_PERMITIDOS.has(tribunalAlias)) {
        const erro = new Error('Tribunal informado ou código CNJ inválido/não suportado pelo DataJud.');
        erro.code = 'INVALID_COURT';
        throw erro;
    }

    const apiKey = process.env.DATAJUD_API_KEY || process.env.APIKEY;
    if (!apiKey) {
        const erro = new Error('Chave da API do DataJud (DATAJUD_API_KEY) não configurada no ambiente.');
        erro.code = 'DATAJUD_API_ERROR';
        throw erro;
    }

    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${encodeURIComponent(tribunalAlias)}/_search`;

    const maxTentativas = 2;
    let ultimoErro = null;

    for (let tentativa = 1; tentativa <= maxTentativas; tentativa++) {
        try {
            const response = await axios.post(
                url,
                {
                    size: 5,
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
            ultimoErro = error;
            const status = error.response?.status;
            const retryable = status === 429 || status === 503;

            if (retryable && tentativa < maxTentativas) {
                console.warn(`DataJud retornou HTTP ${status} na tentativa ${tentativa}. Repetindo em 1500ms...`);
                await new Promise(resolve => setTimeout(resolve, 1500));
                continue;
            }
            break;
        }
    }

    const status = ultimoErro?.response?.status;
    console.error(`Erro ao buscar processo no DataJud (status=${status || ultimoErro?.code || 'N/A'}):`, ultimoErro?.message);

    let mensagemErro = 'Não foi possível consultar a API pública do DataJud (CNJ) no momento. Tente novamente em instantes.';
    if (status === 429) {
        mensagemErro = 'Os servidores públicos do DataJud (CNJ) estão temporariamente sobrecarregados para este tribunal (fila de consultas lotada - Erro 429). Aguarde alguns instantes e tente novamente.';
    } else if (ultimoErro?.code === 'ECONNABORTED' || ultimoErro?.code === 'ETIMEDOUT' || String(ultimoErro?.message || '').toLowerCase().includes('timeout')) {
        mensagemErro = 'O servidor público do DataJud (CNJ) demorou muito para responder (tempo limite excedido). Tente novamente em alguns instantes.';
    } else if (status === 401 || status === 403) {
        mensagemErro = 'A chave pública da API do DataJud (DATAJUD_API_KEY) foi recusada pelo CNJ. Verifique se o CNJ atualizou a chave pública.';
    }

    const erroApi = new Error(mensagemErro);
    erroApi.code = 'DATAJUD_API_ERROR';
    erroApi.cause = ultimoErro;
    throw erroApi;
}
