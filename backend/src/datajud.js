import axios from 'axios'; // Permite fazer HTTP request em API's externas

async function buscarProcesso(numeroProcesso) {
    // O endpoint varia conforme o tribunal, mas a chave de API pública é disponibilizada pelo CNJ
    const url = 'https://api-publica.datajud.cnj.jus.br/api_publica_tjsp/_search';
    const apiKey = 'APIKey cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw=='; // Chave pública fornecida no portal do CNJ

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
                }
            }
        );

        console.log(response.data.hits.hits);
    } catch (error) {
        console.error('Erro ao buscar processo:', error.message);
    }
}