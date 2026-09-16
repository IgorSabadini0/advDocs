// Validador de dados de cliente para evitar dados malformados ou inválidos
const validateCliente = (data) => {

    // Verifica se a variável data é um objeto válido, assim garante que o req.body não seja nulo ou indefinido, evitando erros de referência.
    if (!data || typeof data !== 'object') {
        return { valido: false, mensagem: "Dados não fornecidos ou inválidos." };
    }

    const { acao, nome, numeroPasta, tipo, numeroProc, status, consultarProcesso, descricao } = data;

    if (!nome || typeof nome !== 'string' || nome.trim().length === 0 || nome.length > 128) {
        return { valido: false, mensagem: "Nome inválido (deve ter entre 1 e 128 caracteres)." };
    }

    if (numeroPasta === null || numeroPasta === undefined || typeof numeroPasta === 'boolean' || String(numeroPasta).trim() === '') {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const parsedPasta = Number(numeroPasta);
    if (isNaN(parsedPasta) || !Number.isInteger(parsedPasta) || parsedPasta <= 0) {
        return { valido: false, mensagem: "Número da pasta inválido (deve ser um número inteiro positivo)." };
    }

    const tiposValidos = ['Todos Processos', 'Previdenciário', 'Santa Casa', 'Justiça Gratuita', 'Arquivado', 'Outro'];
    if (tipo && !tiposValidos.includes(tipo)) {
        return { valido: false, mensagem: "Tipo de processo inválido." };
    }

    if (acao && (typeof acao !== 'string' || acao.length > 128)) {
        return { valido: false, mensagem: "Ação inválida (máximo 128 caracteres)." };
    }

    if (numeroProc && (typeof numeroProc !== 'string' || numeroProc.length > 25)) {
        return { valido: false, mensagem: "Número do processo inválido (máximo 25 caracteres)." };
    }

    const statusValidos = ['Ativo', 'Parado'];
    if (!status || !statusValidos.includes(status)) {
        return { valido: false, mensagem: "Status inválido (deve ser 'Ativo' ou 'Parado')." };
    }

    if (descricao && typeof descricao !== 'string') {
        return { valido: false, mensagem: "Descrição inválida." };
    }

    if (consultarProcesso !== true && consultarProcesso !== false) {
        return { valido: false, mensagem: "Opção de consulta de processo inválida (deve ser true ou false)." };
    }

    return { valido: true };
};

export { validateCliente };