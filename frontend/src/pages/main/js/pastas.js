// --- ESTADO DA APLICAÇÃO ---
let currentFilter = 'all';
let searchTimeout = null;
const API_URL = "http://192.168.0.150:3000";

// --- DADOS CLIENTES ---

const tipo = document.getElementById('tipo').value;
const titulo = document.getElementById('titulo').value;
const cliente = document.getElementById('cliente').value;
const numero = document.getElementById('numero').value;
const status = document.getElementById('status').value;
const descricao = document.getElementById('descricao').value;

const clientes = fetch(`${API_URL}/clientes`, {
    method: 'GET'
});

const criarClientes = fetch(`${API_URL}/clientes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tipo, titulo, cliente, numero, status, drescricao })
});


// --- LÓGICA CENTRAL UNIFICADA ---
const executarBuscaEFiltro = async (isInitialLoad = false) => {
    const searchInput = document.getElementById('search');
    const query = searchInput.value.trim().toLowerCase();

    // Regra: Se tem texto, precisa ter pelo menos 2 caracteres.
    // Mas se estiver vazio (query.length === 0), deixamos passar para mostrar TUDO (cenário inicial ou limpar busca).
    if (query.length > 0 && query.length < 2) {
        if (!isInitialLoad) {
            showEmptyState('Digite pelo menos 2 caracteres para pesquisar.');
        }
        return;
    }

    // UI: Loading
    // Mostramos loading para dar feedback, exceto se você quiser que o load inicial seja instantâneo
    showLoading(true);

    // Esconde a GRADE de resultados, mas NÃO os filtros (os filtros devem estar fora do 'resultsContainer' no HTML)
    hideResults();
    hideEmptyState();

    // Simular delay de API (reduzido para 400ms para ficar mais ágil)
    if (!isInitialLoad) {
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    try {
        // --- FILTRAGEM ---
        const resultados = clientes.filter(item => {
            // 1. Verifica a Categoria (Aba selecionada)
            const matchTipo = currentFilter === 'all' || item.tipo === currentFilter;

            // 2. Verifica o Texto (Input)
            // Se input vazio, retorna true (mostra tudo da categoria).
            const matchTexto = query === '' || (
                item.titulo.toLowerCase().includes(query) ||
                (item.cliente && item.cliente.toLowerCase().includes(query)) ||
                item.numero.toLowerCase().includes(query) ||
                (item.descricao && item.descricao.toLowerCase().includes(query))
            );

            return matchTipo && matchTexto;
        });

        showLoading(false);

        // --- EXIBIÇÃO ---
        if (resultados.length > 0) {
            displayResults(resultados);
        } else {
            // Se não encontrou nada, preparamos uma mensagem útil
            const nomeFiltro = traduzirTipo(currentFilter);


            if (query) {
                // Caso tenha pesquisado algo que não existe na categoria atual
                showEmptyState(`
                    <strong style="display:block; margin-bottom: 8px;">Nenhum resultado para "${query}" em "${nomeFiltro}".</strong>
                    <span style="font-size: 0.9em; color: #666;">Tente selecionar outra aba de filtro acima.</span>
                `);
            } else {
                // Caso a categoria esteja vazia mesmo
                showEmptyState(`Nenhum item cadastrado na categoria "${nomeFiltro}".`);
            }
        }

    } catch (error) {
        console.error('Erro na busca:', error);
        showLoading(false);
        showEmptyState('Erro ao processar dados.');
    }
};

// --- GATILHOS (EVENT HANDLERS) ---

// 1. Chamada pelo Input de Busca
const buscar = () => {
    executarBuscaEFiltro();
};

// 2. Chamada pelos Botões de Filtro
const filterResults = (filter) => {
    currentFilter = filter;

    // Atualiza visual dos botões (active class)
    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => {
        btn.classList.remove('active');

        // Lógica flexível para encontrar o botão certo pelo texto
        const btnText = btn.textContent.trim().toLowerCase();
        const map = { 'all': 'todos', 'pasta': 'pastas', 'cliente': 'clientes', 'documento': 'documentos' };

        if (map[filter] === btnText || (filter === 'all' && btnText === 'todos')) {
            btn.classList.add('active');
        }
    });

    // Ao clicar no filtro, executamos a busca imediatamente
    // O termo que estiver digitado no input será mantido e aplicado no novo filtro!
    executarBuscaEFiltro();
};

// --- FUNÇÕES DE UI (DOM MANIPULATION) ---

const displayResults = (results) => {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');
    const container = document.getElementById('resultsContainer');

    // Limpa grade anterior
    resultsGrid.innerHTML = '';

    // Cria e adiciona os cards
    results.forEach((item, index) => {
        const card = createResultCard(item, index);
        resultsGrid.appendChild(card);
    });

    // Atualiza contador
    const count = results.length;
    resultsCount.innerHTML = `<strong>${count}</strong> ${count === 1 ? 'resultado encontrado' : 'resultados encontrados'}`;

    // Mostra container com animação
    container.style.display = 'block';
    setTimeout(() => {
        container.classList.add('show');
    }, 10);
};

const createResultCard = (item, index) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${index * 0.05}s`; // Cascata mais rápida

    const iconMap = { 'pasta': 'fa-folder', 'cliente': 'fa-user', 'documento': 'fa-file-alt' };
    const typeLabels = { 'pasta': 'Pasta', 'cliente': 'Cliente', 'documento': 'Documento' };

    card.innerHTML = `
        <div class="card-header">
            <div class="card-icon"><i class="fa-solid ${iconMap[item.tipo] || 'fa-file'}"></i></div>
            <div class="card-title">
                <h3>${escapeHtml(item.titulo)}</h3>
                <span class="card-type">${typeLabels[item.tipo] || item.tipo}</span>
            </div>
        </div>
        <div class="card-body">
            <div class="card-info">
                <div class="info-item"><i class="fa-solid fa-hashtag"></i><span>${escapeHtml(item.numero)}</span></div>
                ${item.cliente ? `<div class="info-item"><i class="fa-solid fa-user-tie"></i><span>${escapeHtml(item.cliente)}</span></div>` : ''}
                <div class="info-item"><i class="fa-solid fa-calendar"></i><span>${formatDate(item.data)}</span></div>
                ${item.status ? `<div class="info-item"><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(item.status)}</span></div>` : ''}
            </div>
            ${item.descricao ? `<p style="margin-top: 15px; font-size: 0.9rem; color: var(--text-light); line-height: 1.4;">${escapeHtml(item.descricao)}</p>` : ''}
        </div>
        <div class="card-footer">
            <span class="card-date">${formatDate(item.data)}</span>
            <button class="btn-view" onclick="viewItem(${item.id}, '${item.tipo}')">Ver Detalhes <i class="fa-solid fa-arrow-right"></i></button>
        </div>
    `;

    // Hover via JS (opcional)
    card.onmouseenter = () => card.style.transform = 'translateY(-5px)';
    card.onmouseleave = () => card.style.transform = 'translateY(0)';

    return card;
};

// --- HELPERS E UTILITÁRIOS ---

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    if (show) loading.classList.add('show');
    else loading.classList.remove('show');
};

const hideResults = () => {
    const container = document.getElementById('resultsContainer');
    container.classList.remove('show');
    // Pequeno timeout para não remover do DOM antes da transição CSS terminar
    setTimeout(() => {
        if (!container.classList.contains('show')) container.style.display = 'none';
    }, 300);
};

const showEmptyState = (messageHTML) => {
    const emptyState = document.getElementById('emptyState');
    const p = emptyState.querySelector('p');

    // Usamos innerHTML para permitir negrito ou quebras de linha na mensagem
    if (p) p.innerHTML = messageHTML;

    emptyState.style.display = 'block';
    setTimeout(() => emptyState.classList.add('show'), 10);
};

const hideEmptyState = () => {
    const emptyState = document.getElementById('emptyState');
    emptyState.classList.remove('show');
    setTimeout(() => {
        if (!emptyState.classList.contains('show')) emptyState.style.display = 'none';
    }, 300);
};

// Formatação e Segurança
const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR');
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};
const traduzirTipo = (tipo) => {
    const map = { 'all': 'Todos', 'pasta': 'Pastas', 'cliente': 'Clientes', 'documento': 'Documentos' };
    return map[tipo] || tipo;
};

// Ação de clique no botão
const viewItem = (id, tipo) => {
    alert(`Visualizando ${tipo} com ID: ${id}\n(Backend pendente)`);
};

// --- INICIALIZAÇÃO (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('search');

    // 1. Foco inicial
    searchInput.focus();

    // 2. CARREGAMENTO INICIAL: 
    // Chama a busca sem digitar nada. Isso fará aparecer TODOS os cards do mockup.
    // O parâmetro 'true' indica que é o load inicial.
    executarBuscaEFiltro(true);

    // 3. Listeners de Input (com Debounce)
    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();

        // Se o campo for limpo, busca imediatamente (para restaurar a lista completa).
        // Se estiver digitando, espera 500ms.
        const delay = query.length === 0 ? 0 : 500;

        searchTimeout = setTimeout(() => {
            buscar();
        }, delay);
    });

    // Enter busca imediatamente
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            buscar();
        }
    });
});