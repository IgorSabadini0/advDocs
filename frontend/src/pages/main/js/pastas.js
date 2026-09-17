// --- ESTADO DA APLICAÇÃO ---
import { currentFilter, setCurrentFilter, mapFiltroParaDB, searchTimeout, setSearchTimeout, clientes, setClientes } from './state.js';
import { deleteClienteApi, carregarDados } from '../api/clientsApi.js';
import { createResultCard } from '../components/cardComponent.js';
import { viewItemModal, fecharModal } from '../components/modalComponent.js';
import { confirmModal } from '../../../components/confirmModal.js';

const adicionar = () => {
    window.location.href = '/pages/register';
}

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '/pages/auth';
}

const config = () => {
    window.location.href = '/pages/config';
}

// --- ESTATÍSTICAS DO PAINEL ---
const atualizarEstatisticas = () => {
    const totalEl = document.getElementById('stat-total');
    const ativosEl = document.getElementById('stat-ativos');
    const paradosEl = document.getElementById('stat-parados');

    if (totalEl && ativosEl && paradosEl) {
        const total = clientes.length;
        const ativos = clientes.filter(c => c.status === 'Ativo').length;
        const parados = clientes.filter(c => c.status === 'Parado').length;

        // Animate counter values
        animateCounter(totalEl, total);
        animateCounter(ativosEl, ativos);
        animateCounter(paradosEl, parados);
    }
};

const animateCounter = (element, target) => {
    let start = 0;
    const duration = 800; // ms
    const startTime = performance.now();

    const update = (now) => {
        const elapsed = now - startTime;
        const progress = Math.min(elapsed / duration, 1);
        // Easing function outQuad
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

const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
        buscar();
    }
};

// --- BUSCAR DADOS DO BANCO ---
// carregarDados().then(() => { // o .then() é chamado após a função carregarDados() ser concluída com sucesso e espera a função atualizarEstatisticas()
//     atualizarEstatisticas();
// }).catch((error) => {
//     console.error('Erro ao carregar dados da API:', error);
// });

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
    setCurrentFilter(filter);

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

// Converte caracteres especiais em entidades HTML para evitar ataques de XSS.

const traduzirTipo = (tipo) => {
    return mapFiltroParaDB[tipo] || tipo;
};

// Informa ao navegador que o item a ser editado está armazenado no sessionStorage e redireciona para a página de edição.
const editarItem = (id, tipo) => {
    const item = clientes.find(c => String(c.id) === String(id) && c.tipo === tipo);

    if (!item) {
        alert('Não foi possível carregar os dados para edição.');
        return;
    }

    sessionStorage.setItem('itemEmEdicao', JSON.stringify(item));
    window.location.href = '/pages/edit';
};

const deletarItem = (id) => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmDeleteModal';

    overlay.innerHTML = confirmModal();

    document.body.appendChild(overlay); // Adiciona o modal de confirmação ao DOM

    const fecharConfirmModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 300);
    };

    overlay.querySelector('[data-action="cancel-delete"]').addEventListener('click', fecharConfirmModal);

    //pega o botão de confirmação como uma variável
    const confirmButton = document.getElementById('confirmRealDelete');

    confirmButton.onclick = async () => {
        try {
            await deleteClienteApi(id);
            setClientes(clientes.filter(c => String(c.id) !== String(id))); // caso o id seja um number passa para um String
            atualizarEstatisticas();
            fecharConfirmModal();
            fecharModal();
            executarBuscaEFiltro();

        } catch (error) {
            // Verificação dos erros retornados da função deleteClienteApi()

            if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
                sair();
            } else {
                overlay.innerHTML = `
                <div class="modal-confirm-content">
                    <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
                    <h3 class>Erro na Exclusão</h3>
                    <p><span style="font-weight: bold;">Tente novamente mais tarde.</span></p>
                    <div class="confirm-buttons-group">
                        <button class="btn-confirm-delete-act" id="confirmErrorDelete">Fechar</button>
                    </div>
                </div>`;
                document.getElementById('confirmErrorDelete')?.addEventListener('click', fecharConfirmModal);
            }
        }
    }
};

const viewItem = (id, tipo) => {
    const item = clientes.find(c => String(c.id) === String(id) && c.tipo === tipo);

    if (!item) {
        console.error(`[Erro] Item não encontrado: ID ${id} | Tipo: ${tipo}`);
        alert('Não foi possível carregar os dados do item. Tente novamente.');
        return;
    }
    viewItemModal(item, {
        tipoLegivel: traduzirTipo(tipo),
        onDelete: () => deletarItem(id),
        onEdit: () => editarItem(id, tipo)
    });
}

// --- INICIALIZAÇÃO (DOMContentLoaded) ---

document.addEventListener('DOMContentLoaded', async () => {
    const searchInput = document.getElementById('search');
    document.getElementById('addButton').addEventListener('click', adicionar);
    document.getElementById('configButton').addEventListener('click', config);
    document.getElementById('logoutButton').addEventListener('click', sair);
    document.getElementById('searchButton').addEventListener('click', buscar);
    document.querySelectorAll('.filter-btn').forEach((button) => {
        button.addEventListener('click', () => filterResults(button.dataset.filter));
    });
    searchInput.focus();

    try {
        showLoading(true);

        // Busca os dados (se carregarDados retornar a lista, use: const dados = await carregarDados(); setClientes(dados);)
        await carregarDados();

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
        const delay = query.length === 0 ? 0 : 500;

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
