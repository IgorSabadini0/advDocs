export const API_URL = window.location.origin;

export let currentFilter = 'all';
export const setCurrentFilter = (novoFiltro) => { currentFilter = novoFiltro; };

export const mapFiltroParaDB = {
    'all': 'Todos Processos',
    'previdenciario': 'Previdenciário',
    'santa_casa': 'Santa Casa',
    'justica_gratuita': 'Justiça Gratuita',
    'arquivado': 'Arquivado',
    'outro': 'Outro'
};

export let searchTimeout = null;
export const setSearchTimeout = (novoTimeout) => { searchTimeout = novoTimeout; };

export let clientes = [];
export const setClientes = (novosClientes) => { clientes = novosClientes; };