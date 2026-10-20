export const API_URL = window.location.origin;

export let currentFilter = 'all';
export const setCurrentFilter = (novoFiltro) => { currentFilter = novoFiltro; };

export let tiposProcesso = [];
export const setTiposProcesso = (novosTipos) => { tiposProcesso = novosTipos; };

export let searchTimeout = null;
export const setSearchTimeout = (novoTimeout) => { searchTimeout = novoTimeout; };

export let clientes = [];
export const setClientes = (novosClientes) => { clientes = novosClientes; };
