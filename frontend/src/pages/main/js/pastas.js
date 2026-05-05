// --- ESTADO DA APLICAÇÃO ---
const API_URL = window.location.origin;
let currentFilter = 'all';

// Mapeia os parametros passados para a função pelo HTML e "traduz" para o ENUM do MySQL
const mapFiltroParaDB = {
    'all': 'Todos Processos',
    'previdenciario': 'Previdenciário',
    'santa_casa': 'Santa Casa',
    'justica_gratuita': 'Justiça Gratuita',
    'arquivado': 'Arquivado',
    'outro': 'Outro'
};
let searchTimeout = null;
let clientes = []; // Agora é um array que receberá os dados do banco

function adicionar() {
    window.location.href = '../register';
}

function editar() {
    window.location.href = '../edit';
}

// --- BUSCAR DADOS DO BANCO ---
const carregarDados = async () => {
    try {
        const response = await fetch(`${API_URL}/clientes`, {
            headers: {
                'Authorization': localStorage.getItem('token')
            }
        });

        clientes = await response.json();
    } catch (error) {
        console.error('Erro ao buscar dados da API:', error);
        clientes = []; // Garante que seja um array mesmo se der erro
    }
};

// --- LÓGICA CENTRAL UNIFICADA ---
const executarBuscaEFiltro = async (isInitialLoad = false) => {
    const searchInput = document.getElementById('search');
    const query = searchInput.value.trim().toLowerCase();

    if (query.length > 0 && query.length < 2) {
        if (!isInitialLoad) {
            showEmptyState('Digite pelo menos 2 caracteres para pesquisar.');
        }
        return;
    }

    showLoading(true);
    hideResults();
    hideEmptyState();

    if (!isInitialLoad) {
        await new Promise(resolve => setTimeout(resolve, 400));
    }

    try {
        const resultados = clientes.filter(item => {
            // Traduz o filtro atual ('santa_casa') para o formato do DB ('Santa Casa')
            const tipoNoBanco = mapFiltroParaDB[currentFilter];

            // Compara o tipo exato do enum
            const matchTipo = currentFilter === 'all' || item.tipo === tipoNoBanco;

            const matchTexto = query === '' || (
                (item.acao && item.acao.toLowerCase().includes(query)) ||
                (item.nome && item.nome.toLowerCase().includes(query)) ||
                (item.numeroPasta && item.numeroPasta.toLowerCase().includes(query)) ||
                (item.numeroProc && item.numeroProc.toLowerCase().includes(query)) ||
                (item.descricao && item.descricao.toLowerCase().includes(query))
            );

            return matchTipo && matchTexto;
        });

        showLoading(false);

        if (resultados.length > 0) {
            displayResults(resultados);
        } else {
            const nomeFiltro = traduzirTipo(currentFilter);
            if (query) {
                showEmptyState(`
                    <strong style="display:block; margin-bottom: 8px;">Nenhum resultado para "${query}" em "${nomeFiltro}".</strong>
                    <span style="font-size: 0.9em; color: #666;">Tente selecionar outra aba de filtro acima.</span>
                `);
            } else {
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
const buscar = () => {
    executarBuscaEFiltro();
};

const filterResults = (filter) => {
    currentFilter = filter;

    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => {
        btn.classList.remove('active');
        const btnText = btn.textContent.trim().toLowerCase();

        // Mapa para relacionar o parâmetro com o texto visível no botão (em minúsculas)
        const mapButtonText = {
            'all': 'todos',
            'previdenciario': 'previdenciário',
            'santa_casa': 'santa casa',
            'justica_gratuita': 'justiça gratuita',
            'arquivado': 'arquivado',
            'outro': 'outro'
        };

        if (mapButtonText[filter] === btnText) {
            btn.classList.add('active');
        }
    });

    executarBuscaEFiltro();
};

// --- FUNÇÕES DE UI (DOM MANIPULATION) ---
const displayResults = (results) => {
    const resultsGrid = document.getElementById('resultsGrid');
    const resultsCount = document.getElementById('resultsCount');
    const container = document.getElementById('resultsContainer');

    resultsGrid.innerHTML = '';

    results.forEach((item, index) => {
        const card = createResultCard(item, index);
        resultsGrid.appendChild(card);
    });

    const count = results.length;
    resultsCount.innerHTML = `<strong>${count}</strong> ${count === 1 ? 'resultado encontrado' : 'resultados encontrados'}`;

    container.style.display = 'block';
    setTimeout(() => {
        container.classList.add('show');
    }, 10);
};

// --- RENDERIZAÇÃO DOS CARDS COM AS NOVAS VARIÁVEIS ---
const createResultCard = (item, index) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${index * 0.05}s`;

    const iconMap = { 'Todos Processos': 'fa-folder-open', 'Previdenciário': 'fa-person-cane', 'Santa Casa': 'fa-hospital', 'Justiça Gratuita': 'fa-hand-holding-usd', 'Arquivado': 'fa-box-archive', 'Outro': 'fa-file' }; // preciso alterar

    card.innerHTML = `
        <div class="card-header">
            <div class="card-icon"><i class="fa-solid ${iconMap[item.tipo] || 'fa-file'}"></i></div>
            <div class="card-title">
                <h3>${escapeHtml(item.nome)}</h3>
                <span class="card-type">${item.tipo}</span>
            </div>
        </div>
        <div class="card-body">
            <div class="card-info">
                ${item.numeroPasta ? `<div class="info-item"><i class="fa-solid fa-folder-open"></i><span>Pasta: ${escapeHtml(item.numeroPasta)}</span></div>` : ''}
                ${item.numeroProc ? `<div class="info-item"><i class="fa-solid fa-scale-balanced"></i><span>Proc: ${escapeHtml(item.numeroProc)}</span></div>` : ''}
                ${item.nome ? `<div class="info-item"><i class="fa-solid fa-user-tie"></i><span>${escapeHtml(item.nome)}</span></div>` : ''}
                ${item.data ? `<div class="info-item"><i class="fa-solid fa-calendar"></i><span>${formatDate(item.data)}</span></div>` : ''}
                ${item.status ? `<div class="info-item"><i class="fa-solid fa-circle-check"></i><span>${escapeHtml(item.status)}</span></div>` : ''}
            </div>
            ${item.descricao ? `<p style="margin-top: 15px; font-size: 0.9rem; color: var(--text-light); line-height: 1.4;">${escapeHtml(item.descricao)}</p>` : ''}
        </div>
        <div class="card-footer">
            <span class="card-date">${item.data ? formatDate(item.data) : ''}</span>
            <button class="btn-view" onclick="viewItem(${item.id}, '${item.tipo}')">Ver Detalhes <i class="fa-solid fa-arrow-right"></i></button>
        </div>
    `;

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
    setTimeout(() => {
        if (!container.classList.contains('show')) container.style.display = 'none';
    }, 300);
};

const showEmptyState = (messageHTML) => {
    const emptyState = document.getElementById('emptyState');
    const p = emptyState.querySelector('p');

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

const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR');
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};
const traduzirTipo = (tipo) => {
    return mapFiltroParaDB[tipo] || tipo;
};
// --- FUNÇÕES DE VISUALIZAÇÃO (MODAL) ---
const viewItem = (id, tipo) => {
    // 1. Verificação e Busca do Item
    // Convertendo ambos para String para evitar erros de tipagem (Number vs String) vindos da API
    const item = clientes.find(c => String(c.id) === String(id) && c.tipo === tipo);

    // 2. Tratamento de Erro (Item não encontrado)
    if (!item) {
        console.error(`[Erro] Item não encontrado: ID ${id} | Tipo: ${tipo}`);
        alert('Não foi possível encontrar os detalhes deste item. Ele pode ter sido removido.');
        return;
    }

    // Remover modal existente (se houver) para evitar duplicatas
    const modalExistente = document.getElementById('itemModal');
    if (modalExistente) modalExistente.remove();

    // 3. Renderização Condicional por 'Tipo'
    let detalhesEspecificos = '';

    if (tipo === 'pasta' || tipo === 'processo') { // Assumindo que possa ter 'processo' futuramente
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Número da Pasta:</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Número do Processo:</strong> <span>${escapeHtml(item.numeroProc || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Status:</strong> <span class="status-badge">${escapeHtml(item.status || 'N/A')}</span></div>
        `;
    } else if (tipo === 'cliente') {
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Nome Completo:</strong> <span>${escapeHtml(item.nome || item.acao || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Contato:</strong> <span>${escapeHtml(item.contato || 'N/A')}</span></div>
        `;
    } else if (tipo === 'documento') {
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Tipo de Documento:</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Vínculo (Pasta):</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
        `;
    }

    // 4. Criação dinâmica do Modal no DOM
    const modal = document.createElement('div');
    modal.id = 'itemModal';
    modal.className = 'modal-overlay';

    // acao,
    // nome,
    // numeroPasta,
    // tipo,
    // numeroProc,
    // status,
    // descricao

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">${item.nome} - <span class="badge">${item.acao}</span></h2>
                <button class="btn-close-modal" onclick="fecharModal()"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="modal-section">
                    <h3>Informações Gerais</h3>
                    <div class="modal-info-grid">
                        <div class="modal-info-item"><strong>ID do Sistema:</strong> <span>#${escapeHtml(item.id || 'N/A')}</span></div> 
                        <div class="modal-info-item"><strong>Ação:</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Nome:</strong> <span>${escapeHtml(item.nome || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Número da Pasta:</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Tipo:</strong> <span>${traduzirTipo(tipo)}</span></div>
                        <div class="modal-info-item"><strong>Número do Processo:</strong> <span>${escapeHtml(item.numeroProc || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Status:</strong> <span class="status-badge">${escapeHtml(item.status || 'N/A')}</span></div>
                    </div>
                </div>

                ${item.descricao ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Descrição / Observações</h3>
                    <p class="modal-description">${escapeHtml(item.descricao)}</p>
                </div>` : ''}
            </div>

            <div class="modal-footer">
                <button class="btn-view-delete" onclick="deletarItem(${item.id}, '${tipo}')">Deletar</button>
                <button class="btn-view" onclick="editarItem(${item.id}, '${tipo}')">Editar <i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) fecharModal();
    });

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

const fecharModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

const editarItem = (id, tipo) => {
    console.log(`Redirecionando para edição: ID ${id}, Tipo ${tipo}`);
    // Ex: window.location.href = `../edit?id=${id}&tipo=${tipo}`;
};

const deletarItem = (id, tipo) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmDeleteModal';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
            <h3 class>Confirmar Exclusão</h3>
            <p>Esta ação apagará permanentemente os dados da pasta e não poderá ser desfeita. <span style="font-weight: bold; color: white;">Deseja continuar?</span></p>
            <div class="confirm-buttons-group">
                <button class="btn-cancel-modal" onclick="fecharConfirmacao()">Cancelar</button>
                <button class="btn-confirm-delete-act" id="confirmRealDelete">Apagar Agora</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    //pega o botão de confirmação como uma variável
    const confirmButton = document.getElementById('confirmRealDelete');

    confirmButton.onclick = async () => {
        try {
            const response = await fetch(`${API_URL}/clientes/${id}`, { method: 'DELETE' });
            if (response.ok) {
                clientes = clientes.filter(c => String(c.id) !== String(id)); // caso o id seja um number passa para um String
                fecharConfirmacao();
                fecharModal();
                executarBuscaEFiltro();
            }
        } catch (error) {
            console.log(`Erro na exclusão`, error);
        }
    }
};

const fecharConfirmacao = () => {
    const modal = document.getElementById('confirmDeleteModal');
    if (modal) modal.remove();
};

// --- INICIALIZAÇÃO (DOMContentLoaded) ---
document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search');
    searchInput.focus();

    showLoading(true);
    await carregarDados();
    showLoading(false);

    executarBuscaEFiltro(true);

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        const delay = query.length === 0 ? 0 : 500;

        searchTimeout = setTimeout(() => {
            buscar();
        }, delay);
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            buscar();
        }
    });
});