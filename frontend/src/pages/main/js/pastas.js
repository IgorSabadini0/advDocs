// --- ESTADO DA APLICAÇÃO ---
import { currentFilter, setCurrentFilter, searchTimeout, setSearchTimeout, clientes, setClientes, setTiposProcesso } from './state.js';
import { deleteClienteApi, carregarDados } from '../api/clientsApi.js';
import { createResultCard } from '../components/cardComponent.js';
import { viewItemModal, fecharModal } from '../components/modalComponent.js';
import { confirmModal } from '../../../components/confirmModal.js';
import { normalizeText, escapeHtml, apiFetch } from '../../../utils/utils.js';

const adicionar = () => {
    window.location.href = '/pages/register';
};

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '/pages/auth';
};

const config = () => {
    window.location.href = '/pages/config';
};

const consultar = () => {
    window.location.href = '/pages/consult';
};

// --- ESTATÍSTICAS DO PAINEL ---
const atualizarEstatisticas = () => {
    const totalEl = document.getElementById('stat-total');
    const ativosEl = document.getElementById('stat-ativos');
    const paradosEl = document.getElementById('stat-parados');

    if (totalEl && ativosEl && paradosEl) {
        const total = clientes.length;
        const ativos = clientes.filter(c => c.status === 'Ativo').length;
        const parados = clientes.filter(c => c.status === 'Parado').length;

        animateCounter(totalEl, total);
        animateCounter(ativosEl, ativos);
        animateCounter(paradosEl, parados);
    }
};

const animateCounter = (element, target) => {
    const duration = 800; // ms
    const startTime = performance.now();

    const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const value = Math.floor(progress * (2 - progress) * target);
        element.textContent = value;

        if (progress < 1) {
            requestAnimationFrame(update);
        } else {
            element.textContent = target;
        }
    };
    requestAnimationFrame(update);
};

// --- CARREGAMENTO DINÂMICO DOS FILTROS DE CATEGORIA ---
const carregarFiltrosDinamicos = async () => {
    const container = document.getElementById('filterButtons');
    if (!container) return;

    let listaTipos = [];

    try {
        const data = await apiFetch('/clientes/tipos');
        listaTipos = data.map(t => t.nome);
    } catch (e) {
        console.error('Erro ao carregar tipos de processo para os filtros:', e);
    }

    // Garante que tipos presentes nos clientes também tenham botão, mesmo que não estejam na tabela tipos_processo
    for (const c of clientes) {
        if (c.tipo && !listaTipos.includes(c.tipo)) {
            listaTipos.push(c.tipo);
        }
    }

    setTiposProcesso(listaTipos);

    container.innerHTML = `
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">Todos</button>
        ${listaTipos.map(nome => `
            <button class="filter-btn ${normalizeText(currentFilter) === normalizeText(nome) ? 'active' : ''}" data-filter="${escapeHtml(nome)}">
                ${escapeHtml(nome)}
            </button>
        `).join('')}
    `;

    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterResults(btn.dataset.filter));
    });
};

// --- LÓGICA CENTRAL UNIFICADA DE BUSCA E FILTRAGEM ---
const executarBuscaEFiltro = async (isInitialLoad = false) => {
    const searchInput = document.getElementById('search');
    const query = normalizeText(searchInput.value);

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
        await new Promise(resolve => setTimeout(resolve, 250));
    }

    try {
        const resultados = clientes.filter(item => {
            // Filtro por tipo de processo (funciona dinamicamente com qualquer tipo cadastrado)
            const matchTipo = (currentFilter === 'all') ||
                (item.tipo && normalizeText(item.tipo) === normalizeText(currentFilter));

            const numPastaStr = String(item.numeroPasta ?? '');
            const numProcStr = String(item.numeroProc ?? '');

            const matchTexto = query === '' || (
                normalizeText(item.acao).includes(query) ||
                normalizeText(item.nome).includes(query) ||
                numPastaStr.includes(query) ||
                numProcStr.includes(query) ||
                (query.replace(/\D/g, '') !== '' && numProcStr.replace(/\D/g, '').includes(query.replace(/\D/g, ''))) ||
                normalizeText(item.descricao).includes(query)
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
                    <strong style="display:block; margin-bottom: 8px;">Nenhum resultado para "${escapeHtml(query)}" na categoria "${escapeHtml(nomeFiltro)}".</strong>
                    <span style="font-size: 0.9em; color: #666;">Tente selecionar outra categoria de filtro acima ou limpar o termo pesquisado.</span>
                `);
            } else {
                showEmptyState(`Nenhum item cadastrado na categoria "${escapeHtml(nomeFiltro)}".`);
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
    setCurrentFilter(filter);

    const botoes = document.querySelectorAll('.filter-btn');
    botoes.forEach(btn => {
        const btnFilter = btn.dataset.filter;
        const isActive = (filter === 'all' && btnFilter === 'all') ||
                         (filter !== 'all' && normalizeText(btnFilter) === normalizeText(filter));
        btn.classList.toggle('active', isActive);
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
        const card = createResultCard(item, index, viewItem);
        resultsGrid.appendChild(card);
    });

    const count = results.length;
    resultsCount.innerHTML = `<strong>${count}</strong> ${count === 1 ? 'resultado encontrado' : 'resultados encontrados'}`;

    container.style.display = 'block';
    setTimeout(() => {
        container.classList.add('show');
    }, 10);
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

const traduzirTipo = (tipo) => {
    return tipo === 'all' ? 'Todas' : tipo;
};

// Informa ao navegador que o item a ser editado está armazenado no sessionStorage e redireciona para a página de edição.
const editarItem = (id) => {
    const item = clientes.find(c => String(c.id) === String(id));

    if (item) {
        sessionStorage.setItem('itemEmEdicao', JSON.stringify(item));
    }
    window.location.href = `/pages/edit/?id=${encodeURIComponent(id)}`;
};

const deletarItem = (id) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmDeleteModal';

    overlay.innerHTML = confirmModal();

    document.body.appendChild(overlay);

    const fecharConfirmModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('[data-action="cancel-delete"]').addEventListener('click', fecharConfirmModal);

    const confirmButton = document.getElementById('confirmRealDelete');

    confirmButton.onclick = async () => {
        try {
            await deleteClienteApi(id);
            setClientes(clientes.filter(c => String(c.id) !== String(id)));
            atualizarEstatisticas();
            fecharConfirmModal();
            fecharModal();
            await carregarFiltrosDinamicos();
            executarBuscaEFiltro();

        } catch (error) {
            if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
                sair();
            } else {
                overlay.innerHTML = `
                <div class="modal-confirm-content">
                    <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
                    <h3>Erro na Exclusão</h3>
                    <p><span style="font-weight: bold;">Tente novamente mais tarde.</span></p>
                    <div class="confirm-buttons-group">
                        <button class="btn-confirm-delete-act" id="confirmErrorDelete">Fechar</button>
                    </div>
                </div>`;
                document.getElementById('confirmErrorDelete')?.addEventListener('click', fecharConfirmModal);
            }
        }
    };
};

const viewItem = (id, tipo) => {
    const item = clientes.find(c => String(c.id) === String(id));

    if (!item) {
        console.error(`[Erro] Item não encontrado: ID ${id}`);
        alert('Não foi possível carregar os dados do item. Tente novamente.');
        return;
    }
    viewItemModal(item, {
        tipoLegivel: traduzirTipo(item.tipo || tipo),
        onDelete: () => deletarItem(id),
        onEdit: () => editarItem(id)
    });
};

// --- INICIALIZAÇÃO (DOMContentLoaded) ---

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }
    const searchInput = document.getElementById('search');
    document.getElementById('addButton').addEventListener('click', adicionar);
    document.getElementById('consultButton').addEventListener('click', consultar);
    document.getElementById('configButton').addEventListener('click', config);
    document.getElementById('logoutButton').addEventListener('click', sair);
    document.getElementById('searchButton').addEventListener('click', buscar);
    searchInput.focus();

    try {
        showLoading(true);

        // Busca os dados da lista de clientes
        await carregarDados();

        // Carrega dinamicamente as categorias dos filtros
        await carregarFiltrosDinamicos();

        // Atualiza os cards estatísticos com os dados carregados
        atualizarEstatisticas();

        // Renderiza os itens na tela
        executarBuscaEFiltro(true);
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        showEmptyState('Erro ao carregar os dados. Verifique sua conexão e tente novamente.');
    } finally {
        showLoading(false);
    }

    searchInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        const delay = query.length === 0 ? 0 : 400;

        setSearchTimeout(setTimeout(() => {
            buscar();
        }, delay));
    });

    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            buscar();
        }
    });
});
