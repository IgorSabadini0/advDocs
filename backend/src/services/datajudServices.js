import axios from 'axios'; // Permite fazer HTTP request em API's externas

export async function buscarProcesso(numeroProcesso) {
    // O endpoint varia conforme o tribunal, mas a chave de API pública é disponibilizada pelo CNJ
    const url = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search';
    const apiKey = process.env.DATAJUD_API_KEY; // Chave pública fornecida no portal do CNJ

    try {
        const response = await axios.post(
            url,
            {
                query: {
                    match: {
                        numeroProcesso: numeroProcesso // ex: '00000000020238260000' (sem formatação)
                    }
                }
            },
            {
                headers: {
                    'Authorization': apiKey,
                    'Content-Type': 'application/json'
                },
                timeout: 5000 // Define um tempo limite de 5 segundos para a requisição
            }
        );

        const processo = response.data.hits.hits[0]?._source; // Acessa o primeiro resultado retornado
        if (processo) {
            return processo; // Retorna os dados do processo encontrado
        }

        console.log(`Nenhum processo encontrado para o número: ${numeroProcesso}`);
        return null; // Retorna null se nenhum processo for encontrado
    } catch (error) {
        console.error('Erro ao buscar processo:', error.message);
    }
}