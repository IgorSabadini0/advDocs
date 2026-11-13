// --- ESTADO DA APLICAÇÃO ---
import {
    currentFilter,
    setCurrentFilter,
    currentStatusFilter,
    setCurrentStatusFilter,
    currentSort,
    setCurrentSort,
    searchTimeout,
    setSearchTimeout,
    clientes,
    setClientes,
    setTiposProcesso,
    setPermissoesUsuario,
    temPolitica
} from './state.js';
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

// --- NOTIFICAÇÕES TOAST ---
const mostrarToast = (mensagem, tipo = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipo}`;

    const icone = tipo === 'error'
        ? 'fa-circle-exclamation'
        : tipo === 'info'
            ? 'fa-circle-info'
            : 'fa-circle-check';

    toast.innerHTML = `
        <i class="fa-solid ${icone} toast-icon"></i>
        <span class="toast-text">${escapeHtml(mensagem)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// --- PERFIL E RBAC NA NAVBAR ---
const carregarPerfilNavbar = async () => {
    try {
        const user = await apiFetch('/users/me');
        const isAdmin = user.is_admin === true || user.is_admin === 1;
        const politicas = Array.isArray(user.politicas) ? user.politicas.map(p => p.chave) : [];

        setPermissoesUsuario({ isAdmin, politicas });

        const navName = document.getElementById('navUserName');
        const navGroup = document.getElementById('navUserGroup');
        if (navName) navName.textContent = user.nome || user.usuario || 'Usuário';
        if (navGroup) navGroup.textContent = user.grupo_nome || (isAdmin ? 'Administrador' : 'Membro');

        const addButton = document.getElementById('addButton');
        if (addButton) {
            addButton.style.display = temPolitica('create_records') ? 'flex' : 'none';
        }
    } catch (error) {
        console.error('Erro ao carregar perfil na navbar:', error);
    }
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
    const duration = 600; // ms
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

    const contarPorTipo = (nomeTipo) => {
        return clientes.filter(c => c.tipo && normalizeText(c.tipo) === normalizeText(nomeTipo)).length;
    };

    container.innerHTML = `
        <button class="filter-btn ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
            <span>Todos</span>
            <span class="filter-count-pill">${clientes.length}</span>
        </button>
        ${listaTipos.map(nome => {
            const qtd = contarPorTipo(nome);
            return `
                <button class="filter-btn ${normalizeText(currentFilter) === normalizeText(nome) ? 'active' : ''}" data-filter="${escapeHtml(nome)}">
                    <span>${escapeHtml(nome)}</span>
                    <span class="filter-count-pill">${qtd}</span>
                </button>
            `;
        }).join('')}
    `;

    container.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => filterResults(btn.dataset.filter));
    });
};

const atualizarEstadoBotaoReset = () => {
    const searchInput = document.getElementById('search');
    const clearBtn = document.getElementById('clearSearchBtn');
    const resetBtn = document.getElementById('resetFiltersBtn');

    const query = (searchInput?.value || '').trim();
    if (clearBtn) {
        clearBtn.style.display = query.length > 0 ? 'inline-flex' : 'none';
    }

    const temFiltroAtivo = query.length > 0 || currentFilter !== 'all' || currentStatusFilter !== 'all';
    if (resetBtn) {
        resetBtn.style.display = temFiltroAtivo ? 'inline-flex' : 'none';
    }
};

// --- ORDENAÇÃO DOS RESULTADOS ---
const ordenarResultados = (lista) => {
    const copia = [...lista];
    switch (currentSort) {
        case 'pasta_asc':
            return copia.sort((a, b) => (Number(a.numeroPasta) || 999999) - (Number(b.numeroPasta) || 999999));
        case 'pasta_desc':
            return copia.sort((a, b) => (Number(b.numeroPasta) || 0) - (Number(a.numeroPasta) || 0));
        case 'nome_asc':
            return copia.sort((a, b) => String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR'));
        case 'recentes':
        default:
            return copia.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    }
};

// --- LÓGICA CENTRAL UNIFICADA DE BUSCA E FILTRAGEM ---
const executarBuscaEFiltro = () => {
    const searchInput = document.getElementById('search');
    const query = normalizeText(searchInput?.value || '');
    const queryDigits = query.replace(/\D/g, '');
    const isNumericQuery = /^\d+$/.test(query);

    atualizarEstadoBotaoReset();

    try {
        const filtrados = clientes.filter(item => {
            // Filtro por categoria/tipo
            const matchTipo = (currentFilter === 'all') ||
                (item.tipo && normalizeText(item.tipo) === normalizeText(currentFilter));

            // Filtro por status (Ativo / Parado)
            const matchStatus = (currentStatusFilter === 'all') ||
                (item.status && normalizeText(item.status) === normalizeText(currentStatusFilter));

            if (!matchTipo || !matchStatus) return false;
            if (query === '') return true;

            const numPastaStr = String(item.numeroPasta ?? '');
            const numProcStr = String(item.numeroProc ?? '');
            const numProcDigits = numProcStr.replace(/\D/g, '');

            // Se digitou apenas 1 caractere numérico (ex: "1"), prioriza número da pasta exato ou que comece com ele
            if (query.length === 1 && isNumericQuery) {
                return numPastaStr === query || numPastaStr.startsWith(query);
            }

            return (
                normalizeText(item.acao).includes(query) ||
                normalizeText(item.nome).includes(query) ||
                numPastaStr.includes(query) ||
                numProcStr.includes(query) ||
                (queryDigits !== '' && numProcDigits.includes(queryDigits)) ||
                normalizeText(item.descricao).includes(query)
            );
        });

        const resultados = ordenarResultados(filtrados);

        if (resultados.length > 0) {
            hideEmptyState();
            displayResults(resultados);
        } else {
            hideResults();
            const nomeFiltro = traduzirTipo(currentFilter);
            const sufixoStatus = currentStatusFilter !== 'all' ? ` com status "${escapeHtml(currentStatusFilter)}"` : '';
            if (query) {
                showEmptyState(`
                    <strong class="empty-title">Nenhum resultado para "${escapeHtml(searchInput.value.trim())}" na categoria "${escapeHtml(nomeFiltro)}"${sufixoStatus}.</strong>
                    <span class="empty-sub">Tente selecionar outra categoria acima ou limpar os filtros ativos.</span>
                `);
            } else {
                showEmptyState(`
                    <strong class="empty-title">Nenhum item encontrado na categoria "${escapeHtml(nomeFiltro)}"${sufixoStatus}.</strong>
                    <span class="empty-sub">Cadastre uma nova pasta ou altere os filtros selecionados.</span>
                `);
            }
        }
    } catch (error) {
        console.error('Erro na busca:', error);
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

const filterByStatus = (status) => {
    // Se clicar novamente no mesmo status ativo (exceto 'all'), volta para 'all'
    const novoStatus = (currentStatusFilter === status && status !== 'all') ? 'all' : status;
    setCurrentStatusFilter(novoStatus);

    document.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
        card.classList.toggle('active-stat', card.dataset.statusFilter === novoStatus);
    });

    executarBuscaEFiltro();
};

const limparTodosFiltros = () => {
    const searchInput = document.getElementById('search');
    if (searchInput) searchInput.value = '';
    setCurrentFilter('all');
    setCurrentStatusFilter('all');

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.filter === 'all');
    });
    document.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
        card.classList.toggle('active-stat', card.dataset.statusFilter === 'all');
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
    const statusLabel = currentStatusFilter !== 'all' ? ` (${escapeHtml(currentStatusFilter)}s)` : '';
    resultsCount.innerHTML = `Exibindo <strong>${count}</strong> ${count === 1 ? 'pasta encontrada' : 'pastas encontradas'}${statusLabel}`;

    container.style.display = 'block';
    requestAnimationFrame(() => {
        container.classList.add('show');
    });
};

// --- HELPERS E UTILITÁRIOS ---
const showLoading = (show) => {
    const loading = document.getElementById('loading');
    if (!loading) return;
    if (show) loading.classList.add('show');
    else loading.classList.remove('show');
};

const hideResults = () => {
    const container = document.getElementById('resultsContainer');
    if (!container) return;
    container.classList.remove('show');
    container.style.display = 'none';
};

const showEmptyState = (messageHTML) => {
    const emptyState = document.getElementById('emptyState');
    if (!emptyState) return;
    const p = emptyState.querySelector('p');

    if (p) p.innerHTML = messageHTML;

    emptyState.style.display = 'flex';
    requestAnimationFrame(() => emptyState.classList.add('show'));
};

const hideEmptyState = () => {
    const emptyState = document.getElementById('emptyState');
    if (!emptyState) return;
    emptyState.classList.remove('show');
    emptyState.style.display = 'none';
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
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fecharConfirmModal();
    });

    const confirmButton = document.getElementById('confirmRealDelete');

    confirmButton.onclick = async () => {
        confirmButton.disabled = true;
        try {
            await deleteClienteApi(id);
            setClientes(clientes.filter(c => String(c.id) !== String(id)));
            atualizarEstatisticas();
            fecharConfirmModal();
            fecharModal();
            await carregarFiltrosDinamicos();
            executarBuscaEFiltro();
            mostrarToast('Pasta removida com sucesso!', 'success');
        } catch (error) {
            if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
                sair();
            } else {
                const msgErro = error.data?.mensagem || 'Não foi possível excluir esta pasta. Verifique suas permissões.';
                overlay.innerHTML = `
                <div class="modal-confirm-content">
                    <i class="fa-solid fa-triangle-exclamation modal-confirm-icon danger"></i>
                    <h3>Erro na Exclusão</h3>
                    <p>${escapeHtml(msgErro)}</p>
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
        mostrarToast('Não foi possível carregar os dados desta pasta.', 'error');
        return;
    }
    viewItemModal(item, {
        tipoLegivel: traduzirTipo(item.tipo || tipo),
        canEdit: temPolitica('edit_records'),
        canDelete: temPolitica('delete_records'),
        onToast: mostrarToast,
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
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const sortSelect = document.getElementById('sortSelect');
    const navUserChip = document.getElementById('navUserChip');

    document.getElementById('addButton')?.addEventListener('click', adicionar);
    document.getElementById('consultButton')?.addEventListener('click', consultar);
    document.getElementById('configButton')?.addEventListener('click', config);
    document.getElementById('logoutButton')?.addEventListener('click', sair);
    document.getElementById('searchButton')?.addEventListener('click', buscar);
    navUserChip?.addEventListener('click', config);

    clearSearchBtn?.addEventListener('click', () => {
        if (searchInput) {
            searchInput.value = '';
            searchInput.focus();
            executarBuscaEFiltro();
        }
    });

    resetFiltersBtn?.addEventListener('click', limparTodosFiltros);

    sortSelect?.addEventListener('change', (e) => {
        setCurrentSort(e.target.value);
        executarBuscaEFiltro();
    });

    // Clique nos cards de estatísticas para filtrar por status
    document.querySelectorAll('.stat-card[data-status-filter]').forEach(card => {
        card.addEventListener('click', () => filterByStatus(card.dataset.statusFilter));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                filterByStatus(card.dataset.statusFilter);
            }
        });
    });

    // Atalho global Esc para fechar modais abertos
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const confirmOverlay = document.getElementById('confirmDeleteModal');
            if (confirmOverlay) {
                confirmOverlay.classList.remove('show');
                setTimeout(() => confirmOverlay.remove(), 300);
                return;
            }
            fecharModal();
        }
    });

    try {
        showLoading(true);

        await Promise.all([
            carregarPerfilNavbar(),
            carregarDados()
        ]);

        await carregarFiltrosDinamicos();
        atualizarEstatisticas();
        executarBuscaEFiltro();
    } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        showEmptyState('Erro ao carregar os dados. Verifique sua conexão e tente novamente.');
    } finally {
        showLoading(false);
    }

    searchInput?.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        const query = searchInput.value.trim();
        const delay = query.length === 0 ? 0 : 180;

        setSearchTimeout(setTimeout(() => {
            buscar();
        }, delay));
    });

    searchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            clearTimeout(searchTimeout);
            buscar();
        }
    });
});
