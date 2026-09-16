import { API_URL } from '../js/state.js';
import { setClientes } from '../js/state.js';

export const deleteClienteApi = async (id) => {
    const token = localStorage.getItem('token');

    if (!token) {
        throw new Error("TOKEN_MISSING");
    }

    const response = await fetch(`${API_URL}/clientes/${id}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': token
        }
    });

    // Tratamento de erros a partir dos status do `response`

    if (response.status === 401 || response.status === 403) {
        throw new Error("UNAUTHORIZED");
    }

    if (!response.ok) {
        throw new Error("Erro ao deletar item no servidor");
    }

    return true;
};

const carregarDados = async () => {
    const token = localStorage.getItem('token');

    if (!token) {
        throw new Error("TOKEN_MISSING");
    }

    try {
        const response = await fetch(`${API_URL}/clientes`, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json', 'Authorization': token }
        });

        if (response.status === 401 || response.status === 403) {
            throw new Error("UNAUTHORIZED");
        }

        if (!response.ok) throw new Error('Erro ao carregar dados'); // gera um erro e desvia para o catch

        const dados = await response.json();
        setClientes(dados);
    } catch (error) {
        console.error('Erro ao buscar dados da API:', error);
        setClientes([]); // Garante que seja um array mesmo se der erro
    }
};