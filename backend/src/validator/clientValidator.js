// Validador de dados de cliente para evitar dados malformados ou inválidos
const validateCliente = (data) => {
    // Verifica se a variável data é um objeto válido, garantindo que o req.body não seja nulo ou indefinido.
    if (!data || typeof data !== 'object') {
        return { valido: false, mensagem: "Dados não fornecidos ou inválidos." };
    }

    const { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = data;

    if (!acao || typeof acao !== 'string' || acao.trim().length === 0 || acao.trim().length > 128) {
        return { valido: false, mensagem: "O campo Ação é obrigatório (entre 1 e 128 caracteres)." };
    }

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.trim().length > 128) {
        return { valido: false, mensagem: "Nome inválido (deve ter entre 1 e 128 caracteres)." };
    }

    if (numeroPasta === null || numeroPasta === undefined || typeof numeroPasta === 'boolean' || String(numeroPasta).trim() === '') {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const parsedPasta = Number(numeroPasta);
    if (isNaN(parsedPasta) || !Number.isInteger(parsedPasta) || parsedPasta <= 0) {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    if (!tipo || typeof tipo !== 'string' || tipo.trim().length === 0 || tipo.trim().length > 64) {
        return { valido: false, mensagem: "Tipo de processo é obrigatório (máximo 64 caracteres)." };
    }

    if (numeroProc !== undefined && numeroProc !== null && String(numeroProc).trim() !== '') {
        if (typeof numeroProc !== 'string' || numeroProc.length > 25) {
            return { valido: false, mensagem: "Número do processo inválido (máximo 25 caracteres)." };
        }
        const digits = numeroProc.replace(/\D/g, '');
        if (!/^\d{20}$/.test(digits)) {
            return { valido: false, mensagem: "Número do processo inválido (deve conter os 20 dígitos do padrão CNJ)." };
        }
    }

    const statusValidos = ['Ativo', 'Parado'];
    if (!status || !statusValidos.includes(status)) {
        return { valido: false, mensagem: "Status inválido (deve ser 'Ativo' ou 'Parado')." };
    }

    if (descricao && typeof descricao !== 'string') {
        return { valido: false, mensagem: "Descrição inválida." };
    }

    if (consultarProcesso !== undefined && consultarProcesso !== null && typeof consultarProcesso !== 'boolean') {
        return { valido: false, mensagem: "Opção de consulta de processo inválida (deve ser true ou false)." };
    }

    return { valido: true };
};

export { validateCliente };
