// Validador de dados de cliente/pasta para evitar dados malformados ou inválidos
const STATUS_PASTA_VALIDOS = ['Ativo', 'Aguardando Documentos', 'Suspenso', 'Arquivado', 'Parado'];

const validateCliente = (data) => {
    if (!data || typeof data !== 'object') {
        return { valido: false, mensagem: "Dados não fornecidos ou inválidos." };
    }

    const {
        acao,
        nome,
        cpf_cnpj,
        telefone,
        email,
        numeroPasta,
        tipo,
        tipo_processo_id,
        tribunal,
        comarca_vara,
        parte_contraria,
        consultarProcesso
    } = data;

    const numeroProc = data.numero_processo ?? data.numeroProc;
    const status = data.status_pasta ?? data.status ?? 'Ativo';
    const descricao = data.observacoes ?? data.descricao;

    if (!acao || typeof acao !== 'string' || acao.trim().length === 0 || acao.trim().length > 128) {
        return { valido: false, mensagem: "O campo Ação é obrigatório (entre 1 e 128 caracteres)." };
    }

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.trim().length > 128) {
        return { valido: false, mensagem: "Nome Completo / Razão Social é obrigatório (entre 1 e 128 caracteres)." };
    }

    if (cpf_cnpj !== undefined && cpf_cnpj !== null && String(cpf_cnpj).trim() !== '') {
        if (typeof cpf_cnpj !== 'string' || cpf_cnpj.trim().length > 20) {
            return { valido: false, mensagem: "CPF/CNPJ inválido (máximo 20 caracteres)." };
        }
        const docDigits = cpf_cnpj.replace(/\D/g, '');
        if (docDigits.length !== 11 && docDigits.length !== 14) {
            return { valido: false, mensagem: "CPF/CNPJ inválido (informe 11 dígitos para CPF ou 14 para CNPJ)." };
        }
    }

    if (telefone !== undefined && telefone !== null && String(telefone).trim() !== '') {
        if (typeof telefone !== 'string' || telefone.trim().length > 25) {
            return { valido: false, mensagem: "Telefone/WhatsApp inválido (máximo 25 caracteres)." };
        }
        const telDigits = telefone.replace(/\D/g, '');
        if (telDigits.length !== 10 && telDigits.length !== 11) {
            return { valido: false, mensagem: "Telefone/WhatsApp inválido (informe DDD + 8 ou 9 dígitos)." };
        }
    }

    if (email !== undefined && email !== null && String(email).trim() !== '') {
        const emailStr = String(email).trim();
        if (typeof email !== 'string' || emailStr.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailStr)) {
            return { valido: false, mensagem: "E-mail inválido (verifique o formato e limite de 128 caracteres)." };
        }
    }

    if (numeroPasta === null || numeroPasta === undefined || typeof numeroPasta === 'boolean' || String(numeroPasta).trim() === '') {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const parsedPasta = Number(numeroPasta);
    if (isNaN(parsedPasta) || !Number.isInteger(parsedPasta) || parsedPasta <= 0) {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const temTipoTexto = typeof tipo === 'string' && tipo.trim().length > 0 && tipo.trim().length <= 64;
    const parsedTipoId = (tipo_processo_id !== undefined && tipo_processo_id !== null && String(tipo_processo_id).trim() !== '')
        ? Number(tipo_processo_id)
        : null;
    const temTipoId = parsedTipoId !== null && Number.isInteger(parsedTipoId) && parsedTipoId > 0;

    if (parsedTipoId !== null && !temTipoId) {
        return { valido: false, mensagem: "ID do tipo de processo inválido." };
    }

    if (!temTipoTexto && !temTipoId) {
        return { valido: false, mensagem: "Tipo de processo é obrigatório." };
    }

    if (numeroProc !== undefined && numeroProc !== null && String(numeroProc).trim() !== '') {
        if (typeof numeroProc !== 'string' || numeroProc.trim().length > 25) {
            return { valido: false, mensagem: "Número do processo inválido (máximo 25 caracteres)." };
        }
        const digits = numeroProc.replace(/\D/g, '');
        if (!/^\d{20}$/.test(digits)) {
            return { valido: false, mensagem: "Número do processo inválido (deve conter os 20 dígitos do padrão CNJ)." };
        }
    }

    if (tribunal !== undefined && tribunal !== null && String(tribunal).trim() !== '') {
        if (typeof tribunal !== 'string' || tribunal.trim().length > 20) {
            return { valido: false, mensagem: "Tribunal inválido (máximo 20 caracteres)." };
        }
    }

    if (comarca_vara !== undefined && comarca_vara !== null && String(comarca_vara).trim() !== '') {
        if (typeof comarca_vara !== 'string' || comarca_vara.trim().length > 100) {
            return { valido: false, mensagem: "Comarca/Vara inválida (máximo 100 caracteres)." };
        }
    }

    if (parte_contraria !== undefined && parte_contraria !== null && String(parte_contraria).trim() !== '') {
        if (typeof parte_contraria !== 'string' || parte_contraria.trim().length > 150) {
            return { valido: false, mensagem: "Parte contrária inválida (máximo 150 caracteres)." };
        }
    }

    if (!status || !STATUS_PASTA_VALIDOS.includes(status)) {
        return {
            valido: false,
            mensagem: "Status inválido (use 'Ativo', 'Aguardando Documentos', 'Suspenso' ou 'Arquivado')."
        };
    }

    if (descricao !== undefined && descricao !== null && typeof descricao !== 'string') {
        return { valido: false, mensagem: "Observações/descrição inválidas." };
    }

    if (consultarProcesso !== undefined && consultarProcesso !== null && typeof consultarProcesso !== 'boolean') {
        return { valido: false, mensagem: "Opção de consulta de processo inválida (deve ser true ou false)." };
    }

    return { valido: true };
};

export { validateCliente, STATUS_PASTA_VALIDOS };
