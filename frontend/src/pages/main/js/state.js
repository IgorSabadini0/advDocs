export const API_URL = window.location.origin;

export let currentFilter = 'all';
export const setCurrentFilter = (novoFiltro) => { currentFilter = novoFiltro; };

export let currentStatusFilter = 'all';
export const setCurrentStatusFilter = (novoStatus) => { currentStatusFilter = novoStatus; };

export let currentSort = 'pasta_asc';
export const setCurrentSort = (novaOrdem) => { currentSort = novaOrdem; };

export let tiposProcesso = [];
export const setTiposProcesso = (novosTipos) => { tiposProcesso = novosTipos; };

export let searchTimeout = null;
export const setSearchTimeout = (novoTimeout) => { searchTimeout = novoTimeout; };

export let clientes = [];
export const setClientes = (novosClientes) => { clientes = novosClientes; };

export let permissoesUsuario = {
    isAdmin: false,
    politicas: []
};
export const setPermissoesUsuario = (novasPermissoes) => {
    permissoesUsuario = novasPermissoes;
};
export const temPolitica = (chave) => {
    if (permissoesUsuario.isAdmin) return true;
    return Array.isArray(permissoesUsuario.politicas) && permissoesUsuario.politicas.includes(chave);
};
