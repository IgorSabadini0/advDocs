// Utiliza o DOM para realizar o escape de forma segura.
const escapeHtml = (text) => {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
};

/**
 * Formata data nos padrões comuns (ISO 8601, Date ou YYYYMMDDHHmmss do DataJud) para DD/MM/AAAA
 */
const formatDate = (dateInput) => {
    if (!dateInput) return '-';
    
    // Tratamento para formato YYYYMMDDHHmmss (comum no DataJud, ex: 20080912000000)
    const str = String(dateInput).trim();
    if (/^\d{14}$/.test(str)) {
        const ano = str.substring(0, 4);
        const mes = str.substring(4, 6);
        const dia = str.substring(6, 8);
        return `${dia}/${mes}/${ano}`;
    }

    const data = new Date(dateInput);
    if (isNaN(data.getTime())) return String(dateInput);
    return data.toLocaleDateString('pt-BR');
};

/**
 * Formata data e hora para DD/MM/AAAA às HH:mm
 */
const formatDateTime = (dateInput) => {
    if (!dateInput) return '-';

    const str = String(dateInput).trim();
    if (/^\d{14}$/.test(str)) {
        const ano = str.substring(0, 4);
        const mes = str.substring(4, 6);
        const dia = str.substring(6, 8);
        const hora = str.substring(8, 10);
        const min = str.substring(10, 12);
        return `${dia}/${mes}/${ano} às ${hora}:${min}`;
    }

    const data = new Date(dateInput);
    if (isNaN(data.getTime())) return String(dateInput);
    
    const dataStr = data.toLocaleDateString('pt-BR');
    const horaStr = data.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    return `${dataStr} às ${horaStr}`;
};

/**
 * Máscara progressiva para o padrão CNJ: NNNNNNN-DD.AAAA.J.TR.OOOO (25 caracteres)
 */
const mascaraProcessoCNJ = (valor) => {
    if (!valor) return '';
    let v = String(valor).replace(/\D/g, "");

    v = v.replace(/(\d{7})(\d)/, "$1-$2");
    v = v.replace(/(\d{7}-\d{2})(\d)/, "$1.$2");
    v = v.replace(/(\d{7}-\d{2}\.\d{4})(\d)/, "$1.$2");
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1})(\d)/, "$1.$2");
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2})(\d)/, "$1.$2");

    return v.substring(0, 25);
};

/**
 * Valida se o número possui exatamente 20 dígitos numéricos (padrão CNJ)
 */
const validarProcessoCNJ = (valor) => {
    if (!valor) return false;
    const digitos = String(valor).replace(/\D/g, '');
    return digitos.length === 20;
};

// Dicionário de tribunais para identificação no frontend
const TRIBUNAIS_SIGLAS = {
    '8.01': 'TJAC', '8.02': 'TJAL', '8.03': 'TJAP', '8.04': 'TJAM', '8.05': 'TJBA',
    '8.06': 'TJCE', '8.07': 'TJDFT', '8.08': 'TJES', '8.09': 'TJGO', '8.10': 'TJMA',
    '8.11': 'TJMT', '8.12': 'TJMS', '8.13': 'TJMG', '8.14': 'TJPA', '8.15': 'TJPB',
    '8.16': 'TJPR', '8.17': 'TJPE', '8.18': 'TJPI', '8.19': 'TJRJ', '8.20': 'TJRN',
    '8.21': 'TJRS', '8.22': 'TJRO', '8.23': 'TJRR', '8.24': 'TJSC', '8.25': 'TJSE',
    '8.26': 'TJSP', '8.27': 'TJTO',
    '4.01': 'TRF1', '4.02': 'TRF2', '4.03': 'TRF3', '4.04': 'TRF4', '4.05': 'TRF5', '4.06': 'TRF6',
    '3.00': 'STJ', '1.00': 'STF', '2.00': 'CNJ', '7.00': 'STM'
};

const NOMES_TRIBUNAIS = {
    'TJSP': 'Tribunal de Justiça de São Paulo',
    'TJRJ': 'Tribunal de Justiça do Rio de Janeiro',
    'TJMG': 'Tribunal de Justiça de Minas Gerais',
    'TJRS': 'Tribunal de Justiça do Rio Grande do Sul',
    'TJPR': 'Tribunal de Justiça do Paraná',
    'TJSC': 'Tribunal de Justiça de Santa Catarina',
    'TJBA': 'Tribunal de Justiça da Bahia',
    'TJDFT': 'Tribunal de Justiça do DF e Territórios',
    'TRF1': 'Tribunal Regional Federal da 1ª Região',
    'TRF2': 'Tribunal Regional Federal da 2ª Região',
    'TRF3': 'Tribunal Regional Federal da 3ª Região',
    'TRF4': 'Tribunal Regional Federal da 4ª Região',
    'TRF5': 'Tribunal Regional Federal da 5ª Região',
    'TRF6': 'Tribunal Regional Federal da 6ª Região',
    'STJ': 'Superior Tribunal de Justiça',
    'STF': 'Supremo Tribunal Federal',
    'CNJ': 'Conselho Nacional de Justiça'
};

/**
 * Identifica o tribunal amigável a partir do número do processo
 */
const identificarTribunalCNJ = (numeroProcesso) => {
    const limpo = String(numeroProcesso || '').replace(/\D/g, '');
    if (limpo.length < 16) return null;

    const ramo = limpo.substring(13, 14);
    const tribunalCod = limpo.substring(14, 16);

    if (ramo === '5') {
        const trtNum = parseInt(tribunalCod, 10);
        return {
            sigla: `TRT${trtNum}`,
            nome: `Tribunal Regional do Trabalho da ${trtNum}ª Região`
        };
    }

    const chave = `${ramo}.${tribunalCod}`;
    const sigla = TRIBUNAIS_SIGLAS[chave];
    if (sigla) {
        return {
            sigla,
            nome: NOMES_TRIBUNAIS[sigla] || `Tribunal ${sigla}`
        };
    }

    return null;
};

/**
 * Verifica autenticação do usuário. Redireciona para o login se ausente.
 */
const verificarAutenticacao = () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return null;
    }
    return token;
};

/**
 * Encerra a sessão do usuário e redireciona para tela de login
 */
const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '/pages/auth/';
};

export {
    escapeHtml,
    formatDate,
    formatDateTime,
    mascaraProcessoCNJ,
    validarProcessoCNJ,
    identificarTribunalCNJ,
    verificarAutenticacao,
    sair
};