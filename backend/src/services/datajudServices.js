import axios from 'axios';

// Mapeamento de tribunais estaduais (J = 8)
const TRIBUNAIS_ESTADUAIS = {
    '01': { sigla: 'TJAC', nome: 'Tribunal de Justiça do Acre', endpoint: 'tjac' },
    '02': { sigla: 'TJAL', nome: 'Tribunal de Justiça de Alagoas', endpoint: 'tjal' },
    '03': { sigla: 'TJAP', nome: 'Tribunal de Justiça do Amapá', endpoint: 'tjap' },
    '04': { sigla: 'TJAM', nome: 'Tribunal de Justiça do Amazonas', endpoint: 'tjam' },
    '05': { sigla: 'TJBA', nome: 'Tribunal de Justiça da Bahia', endpoint: 'tjba' },
    '06': { sigla: 'TJCE', nome: 'Tribunal de Justiça do Ceará', endpoint: 'tjce' },
    '07': { sigla: 'TJDFT', nome: 'Tribunal de Justiça do Distrito Federal e Territórios', endpoint: 'tjdft' },
    '08': { sigla: 'TJES', nome: 'Tribunal de Justiça do Espírito Santo', endpoint: 'tjes' },
    '09': { sigla: 'TJGO', nome: 'Tribunal de Justiça de Goiás', endpoint: 'tjgo' },
    '10': { sigla: 'TJMA', nome: 'Tribunal de Justiça do Maranhão', endpoint: 'tjma' },
    '11': { sigla: 'TJMT', nome: 'Tribunal de Justiça de Mato Grosso', endpoint: 'tjmt' },
    '12': { sigla: 'TJMS', nome: 'Tribunal de Justiça de Mato Grosso do Sul', endpoint: 'tjms' },
    '13': { sigla: 'TJMG', nome: 'Tribunal de Justiça de Minas Gerais', endpoint: 'tjmg' },
    '14': { sigla: 'TJPA', nome: 'Tribunal de Justiça do Pará', endpoint: 'tjpa' },
    '15': { sigla: 'TJPB', nome: 'Tribunal de Justiça da Paraíba', endpoint: 'tjpb' },
    '16': { sigla: 'TJPR', nome: 'Tribunal de Justiça do Paraná', endpoint: 'tjpr' },
    '17': { sigla: 'TJPE', nome: 'Tribunal de Justiça de Pernambuco', endpoint: 'tjpe' },
    '18': { sigla: 'TJPI', nome: 'Tribunal de Justiça do Piauí', endpoint: 'tjpi' },
    '19': { sigla: 'TJRJ', nome: 'Tribunal de Justiça do Rio de Janeiro', endpoint: 'tjrj' },
    '20': { sigla: 'TJRN', nome: 'Tribunal de Justiça do Rio Grande do Norte', endpoint: 'tjrn' },
    '21': { sigla: 'TJRS', nome: 'Tribunal de Justiça do Rio Grande do Sul', endpoint: 'tjrs' },
    '22': { sigla: 'TJRO', nome: 'Tribunal de Justiça de Rondônia', endpoint: 'tjro' },
    '23': { sigla: 'TJRR', nome: 'Tribunal de Justiça de Roraima', endpoint: 'tjrr' },
    '24': { sigla: 'TJSC', nome: 'Tribunal de Justiça de Santa Catarina', endpoint: 'tjsc' },
    '25': { sigla: 'TJSE', nome: 'Tribunal de Justiça de Sergipe', endpoint: 'tjse' },
    '26': { sigla: 'TJSP', nome: 'Tribunal de Justiça de São Paulo', endpoint: 'tjsp' },
    '27': { sigla: 'TJTO', nome: 'Tribunal de Justiça do Tocantins', endpoint: 'tjto' }
};

// Mapeamento de tribunais federais (J = 4)
const TRIBUNAIS_FEDERAIS = {
    '01': { sigla: 'TRF1', nome: 'Tribunal Regional Federal da 1ª Região', endpoint: 'trf1' },
    '02': { sigla: 'TRF2', nome: 'Tribunal Regional Federal da 2ª Região', endpoint: 'trf2' },
    '03': { sigla: 'TRF3', nome: 'Tribunal Regional Federal da 3ª Região', endpoint: 'trf3' },
    '04': { sigla: 'TRF4', nome: 'Tribunal Regional Federal da 4ª Região', endpoint: 'trf4' },
    '05': { sigla: 'TRF5', nome: 'Tribunal Regional Federal da 5ª Região', endpoint: 'trf5' },
    '06': { sigla: 'TRF6', nome: 'Tribunal Regional Federal da 6ª Região', endpoint: 'trf6' }
};

// Mapeamento de tribunais do trabalho (J = 5)
const TRIBUNAIS_TRABALHO = {};
for (let i = 1; i <= 24; i++) {
    const code = String(i).padStart(2, '0');
    TRIBUNAIS_TRABALHO[code] = {
        sigla: `TRT${i}`,
        nome: `Tribunal Regional do Trabalho da ${i}ª Região`,
        endpoint: `trt${i}`
    };
}

/**
 * Identifica o tribunal correspondente a partir do número CNJ do processo
 * Formato CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (20 dígitos numéricos)
 * J = ramo da justiça (posição índice 13)
 * TR = identificador do tribunal (posições índice 14 e 15)
 */
export function identificarTribunalCNJ(numeroProcesso) {
    const limpo = String(numeroProcesso || '').replace(/\D/g, '');
    if (limpo.length !== 20) return null;

    const ramo = limpo.substring(13, 14);
    const tribunalCod = limpo.substring(14, 16);

    if (ramo === '8') return TRIBUNAIS_ESTADUAIS[tribunalCod] || null;
    if (ramo === '4') return TRIBUNAIS_FEDERAIS[tribunalCod] || null;
    if (ramo === '5') return TRIBUNAIS_TRABALHO[tribunalCod] || null;
    if (ramo === '3') return { sigla: 'STJ', nome: 'Superior Tribunal de Justiça', endpoint: 'stj' };
    if (ramo === '1') return { sigla: 'STF', nome: 'Supremo Tribunal Federal', endpoint: 'stf' };
    if (ramo === '2') return { sigla: 'CNJ', nome: 'Conselho Nacional de Justiça', endpoint: 'cnj' };
    if (ramo === '7') return { sigla: 'STM', nome: 'Superior Tribunal Militar', endpoint: 'stm' };

    return null;
}

/**
 * Consulta processo judicial na API Pública do DataJud (CNJ)
 * @param {string} numeroProcesso - Número do processo com ou sem pontuação
 * @returns {Promise<object|null>} Dados do processo retornado pelo DataJud ou null se não encontrado
 */
export async function buscarProcesso(numeroProcesso) {
    const numeroLimpo = String(numeroProcesso || '').replace(/\D/g, '');
    if (numeroLimpo.length !== 20) {
        throw new Error('Número de processo CNJ deve conter 20 dígitos numéricos.');
    }

    const infoTribunal = identificarTribunalCNJ(numeroLimpo);
    const endpoint = infoTribunal?.endpoint || 'tjsp';
    const url = `https://api-publica.datajud.cnj.jus.br/api_publica_${endpoint}/_search`;
    const apiKey = process.env.DATAJUD_API_KEY || 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';

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
                timeout: 15000
            }
        );

        const hits = response.data?.hits?.hits;
        if (!hits || hits.length === 0) {
            return null;
        }

        const source = hits[0]._source;
        if (!source.tribunalInfo && infoTribunal) {
            source.tribunalInfo = infoTribunal;
        }

        return source;
    } catch (error) {
        console.error(`Erro ao buscar processo ${numeroLimpo} no endpoint ${endpoint}:`, error.message);
        throw error;
    }
}