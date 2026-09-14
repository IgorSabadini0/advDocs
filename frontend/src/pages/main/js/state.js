// --- ESTADO DA APLICAÇÃO ---
export const API_URL = window.location.origin;
export let currentFilter = 'all';

// Mapeia os parametros passados para a função pelo HTML e "traduz" para o ENUM do MySQL
export const mapFiltroParaDB = {
    'all': 'Todos Processos',
    'previdenciario': 'Previdenciário',
    'santa_casa': 'Santa Casa',
    'justica_gratuita': 'Justiça Gratuita',
    'arquivado': 'Arquivado',
    'outro': 'Outro'
};
export let searchTimeout = null;
export let clientes = []; // Agora é um array que receberá os dados do banco