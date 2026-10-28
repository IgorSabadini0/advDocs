import { setClientes } from '../js/state.js';
import { apiFetch } from '../../../utils/utils.js';

export const deleteClienteApi = async (id) => {
    await apiFetch(`/clientes/${id}`, {
        method: 'DELETE'
    });
    return true;
};

export const carregarDados = async () => {
    try {
        const dados = await apiFetch('/clientes');
        setClientes(dados);
    } catch (error) {
        console.error('Erro ao buscar dados da API:', error);
        setClientes([]); // Garante que seja um array mesmo se der erro
        throw error;
    }
};
