import { escapeHtml, formatDate, formatDateTime, mascaraProcessoCNJ, normalizeText, apiFetch } from '../../../utils/utils.js';

let processoAtual = null;
let instanciaSelecionadaIndex = 0;

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('btnConsultar');
    if (show) {
        loading.classList.add('show');
        btn.disabled = true;
    } else {
        loading.classList.remove('show');
        btn.disabled = false;
    }
};

const showEmpty = (mensagem) => {
    const emptyState = document.getElementById('emptyState');
    const emptyMessage = document.getElementById('emptyMessage');
    const resultadoContainer = document.getElementById('resultadoContainer');

    resultadoContainer.style.display = 'none';
    emptyMessage.textContent = mensagem;
    emptyState.style.display = 'flex';
};

const hideEmpty = () => {
    document.getElementById('emptyState').style.display = 'none';
};

const renderizarPastaVinculada = (pastaVinculada, numeroFormatado, classeProcessual, menorPastaDisponivel, autorProcesso) => {
    const container = document.getElementById('pastaVinculadaContainer');

    if (pastaVinculada) {
        container.innerHTML = `
            <div class="folder-banner linked">
                <div class="folder-banner-info">
                    <div class="folder-banner-icon">
                        <i class="fa-solid fa-folder-open"></i>
                    </div>
                    <div class="folder-banner-text">
                        <h3>Pasta Vinculada no Escritório: Nº ${escapeHtml(pastaVinculada.numeroPasta)} — ${escapeHtml(pastaVinculada.nome)}</h3>
                        <p>
                            <strong>Ação:</strong> ${escapeHtml(pastaVinculada.acao || 'N/A')} &bull;
                            <strong>Categoria:</strong> ${escapeHtml(pastaVinculada.tipo || 'N/A')} &bull;
                            <strong>Status:</strong> ${escapeHtml(pastaVinculada.status)}
                        </p>
                    </div>
                </div>
                <button class="btn-view" id="btnEditarPastaVinculada">
                    <i class="fa-solid fa-pen-to-square"></i> Editar Pasta
                </button>
            </div>
        `;

        document.getElementById('btnEditarPastaVinculada')?.addEventListener('click', () => {
            sessionStorage.setItem('itemEmEdicao', JSON.stringify(pastaVinculada));
            window.location.href = '/pages/edit/';
        });
    } else {
        const params = new URLSearchParams({
            proc: numeroFormatado,
            origem: 'consulta'
        });
        if (classeProcessual && classeProcessual !== 'Não informada') {
            params.set('acao', classeProcessual);
        }
        if (menorPastaDisponivel) {
            params.set('pasta', String(menorPastaDisponivel));
        }
        if (autorProcesso) {
            params.set('nome', autorProcesso);
        }

        container.innerHTML = `
            <div class="folder-banner">
                <div class="folder-banner-info">
                    <div class="folder-banner-icon">
                        <i class="fa-solid fa-folder-plus"></i>
                    </div>
                    <div class="folder-banner-text">
                        <h3>Processo ainda não vinculado a uma pasta</h3>
                        <p>Deseja cadastrar uma nova pasta no sistema com os dados deste processo?${menorPastaDisponivel ? ` (Pasta livre sugerida: <strong>Nº ${escapeHtml(menorPastaDisponivel)}</strong>)` : ''}</p>
                    </div>
                </div>
                <a href="/pages/register/?${params.toString()}" class="btn-view" style="text-decoration: none;">
                    <i class="fa-solid fa-plus"></i> Cadastrar Pasta
                </a>
            </div>
        `;
    }
};

const renderizarMovimentacoes = (movimentos, filtroTexto = '') => {
    const timelineList = document.getElementById('timelineList');
    if (!timelineList) return;

    const query = normalizeText(filtroTexto);
    const filtrados = movimentos.filter(m => {
        if (!query) return true;
        const matchNome = normalizeText(m.nome).includes(query);
        const matchComp = (m.complementos || []).some(c =>
            normalizeText(c.nome).includes(query) || normalizeText(c.descricao).includes(query)
        );
        return matchNome || matchComp;
    });

    if (filtrados.length === 0) {
        timelineList.innerHTML = `
            <div class="timeline-item">
                <span class="timeline-complementos">Nenhuma movimentação encontrada para o filtro informado.</span>
            </div>
        `;
        return;
    }

    timelineList.innerHTML = filtrados.map(mov => {
        const complementosHtml = (mov.complementos && mov.complementos.length > 0)
            ? `<div class="timeline-complementos">${mov.complementos.map(c => `${escapeHtml(c.nome)}${c.descricao ? `: ${escapeHtml(c.descricao)}` : ''}`).join(' | ')}</div>`
            : '';

        return `
            <div class="timeline-item">
                <div class="timeline-item-top">
                    <span class="timeline-title">${escapeHtml(mov.nome)}</span>
                    <span class="timeline-date">
                        <i class="fa-regular fa-clock"></i> ${escapeHtml(formatDateTime(mov.dataHora) || 'Data não informada')}
                    </span>
                </div>
                ${complementosHtml}
            </div>
        `;
    }).join('');
};

const renderizarDadosProcesso = (processo, aviso) => {
    const container = document.getElementById('dadosProcessoContainer');

    if (!processo) {
        container.innerHTML = `
            <div class="process-card">
                <p style="color: var(--text-secondary);">
                    ${escapeHtml(aviso || 'Este processo está cadastrado no escritório, mas não retornou registros públicos na base do DataJud.')}
                </p>
            </div>
        `;
        return;
    }

    const instancias = Array.isArray(processo.instancias) && processo.instancias.length > 0
        ? processo.instancias
        : [processo];

    const dadosAtivos = instancias[instanciaSelecionadaIndex] || processo;
    const numFormatado = mascaraProcessoCNJ(dadosAtivos.numeroProcesso);

    const tabsInstanciasHtml = instancias.length > 1
        ? `
            <div class="instancias-tabs">
                ${instancias.map((inst, idx) => `
                    <button type="button" class="instancia-btn ${idx === instanciaSelecionadaIndex ? 'active' : ''}" data-idx="${idx}">
                        ${escapeHtml(inst.grau || `${idx + 1}ª Instância`)} - ${escapeHtml(inst.orgaoJulgador)}
                    </button>
                `).join('')}
            </div>
        `
        : '';

    const assuntosHtml = (dadosAtivos.assuntos && dadosAtivos.assuntos.length > 0)
        ? dadosAtivos.assuntos.map(a => `<span class="assunto-tag">${escapeHtml(a)}</span>`).join('')
        : `<span class="assunto-tag">Assunto não informado</span>`;

    container.innerHTML = `
        <div class="process-card">
            ${tabsInstanciasHtml}

            <div class="process-header">
                <div class="process-title-group">
                    <h2>${escapeHtml(numFormatado)}</h2>
                    <p>${escapeHtml(dadosAtivos.classe)}</p>
                </div>
                <div class="process-badges">
                    <span class="proc-badge gold">${escapeHtml(dadosAtivos.tribunal)}</span>
                    <span class="proc-badge">Grau: ${escapeHtml(dadosAtivos.grau)}</span>
                    <span class="proc-badge">${escapeHtml(dadosAtivos.formato)}</span>
                </div>
            </div>

            <div class="process-grid">
                <div class="process-info-box">
                    <span class="label">Polo Ativo (Autor)</span>
                    <strong class="value">${escapeHtml(dadosAtivos.autor || 'Não divulgado na API pública (LGPD)')}</strong>
                </div>
                ${dadosAtivos.reu ? `
                <div class="process-info-box">
                    <span class="label">Polo Passivo (Réu)</span>
                    <strong class="value">${escapeHtml(dadosAtivos.reu)}</strong>
                </div>` : ''}
                <div class="process-info-box">
                    <span class="label">Órgão Julgador</span>
                    <strong class="value">${escapeHtml(dadosAtivos.orgaoJulgador)}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Data de Ajuizamento</span>
                    <strong class="value">${escapeHtml(formatDate(dadosAtivos.dataAjuizamento) || 'Não informada')}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Última Atualização</span>
                    <strong class="value">${escapeHtml(formatDateTime(dadosAtivos.dataHoraUltimaAtualizacao) || 'Não informada')}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Sistema Processual</span>
                    <strong class="value">${escapeHtml(dadosAtivos.sistema)}</strong>
                </div>
            </div>

            <div class="assuntos-section">
                <h3><i class="fa-solid fa-tags"></i> Assuntos do Processo</h3>
                <div class="assuntos-list">
                    ${assuntosHtml}
                </div>
            </div>

            <div class="timeline-section">
                <div class="timeline-header">
                    <h3>
                        <i class="fa-solid fa-list-check"></i>
                        Movimentações Processuais (${dadosAtivos.movimentos?.length || 0})
                    </h3>
                    <input type="text" id="filtroMovimentos" class="timeline-search" placeholder="Filtrar movimentações (ex: Sentença, Conclusos)...">
                </div>
                <div class="timeline-list" id="timelineList"></div>
            </div>
        </div>
    `;

    renderizarMovimentacoes(dadosAtivos.movimentos || []);

    const inputFiltroMov = document.getElementById('filtroMovimentos');
    if (inputFiltroMov) {
        inputFiltroMov.addEventListener('input', (e) => {
            renderizarMovimentacoes(dadosAtivos.movimentos || [], e.target.value);
        });
    }

    container.querySelectorAll('.instancia-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            instanciaSelecionadaIndex = Number(btn.dataset.idx);
            renderizarDadosProcesso(processo, aviso);
        });
    });
};

const restaurarConsultaEmCache = async (numeroFormatado) => {
    const numeroLimpo = numeroFormatado.replace(/\D/g, '');
    const cacheRaw = sessionStorage.getItem('ultimaConsultaDatajud');
    if (!cacheRaw) return false;

    try {
        const cache = JSON.parse(cacheRaw);
        if (cache.numeroLimpo !== numeroLimpo) return false;

        // Busca apenas o vínculo específico e a menor pasta disponível (evita baixar toda a tabela de clientes)
        const { pastaVinculada, menorPastaDisponivel } = await apiFetch(`/clientes/vinculo/${encodeURIComponent(numeroLimpo)}`);

        processoAtual = cache.processo;
        instanciaSelecionadaIndex = 0;

        renderizarPastaVinculada(
            pastaVinculada,
            numeroFormatado,
            cache.processo?.classe,
            menorPastaDisponivel,
            cache.processo?.autor
        );
        renderizarDadosProcesso(cache.processo, cache.aviso);
        document.getElementById('resultadoContainer').style.display = 'flex';
        return true;
    } catch (e) {
        console.error('Erro ao restaurar consulta em cache:', e);
        return false;
    }
};

const consultarProcesso = async (event) => {
    if (event) event.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }

    const inputProc = document.getElementById('numeroProcesso');
    const selectTribunal = document.getElementById('tribunalSelect');

    const numeroFormatado = mascaraProcessoCNJ(inputProc.value);
    inputProc.value = numeroFormatado;

    const numeroLimpo = numeroFormatado.replace(/\D/g, '');
    if (numeroLimpo.length !== 20) {
        showEmpty('Informe um número de processo válido com os 20 dígitos do padrão CNJ.');
        return;
    }

    hideEmpty();
    showLoading(true);
    document.getElementById('resultadoContainer').style.display = 'none';

    try {
        const queryParams = selectTribunal.value ? `?tribunal=${encodeURIComponent(selectTribunal.value)}` : '';
        const data = await apiFetch(`/clientes/consulta/${encodeURIComponent(numeroLimpo)}${queryParams}`);

        processoAtual = data.processo;
        instanciaSelecionadaIndex = 0;

        // Salva no sessionStorage para retorno rápido caso o usuário vá para a tela de cadastro e volte
        sessionStorage.setItem('ultimaConsultaDatajud', JSON.stringify({
            numeroLimpo,
            numeroFormatado,
            processo: data.processo,
            aviso: data.aviso
        }));

        renderizarPastaVinculada(
            data.pastaVinculada,
            numeroFormatado,
            data.processo?.classe,
            data.menorPastaDisponivel,
            data.processo?.autor
        );
        renderizarDadosProcesso(data.processo, data.aviso);

        document.getElementById('resultadoContainer').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao consultar processo:', error);
        if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
            return;
        }
        showEmpty(error.data?.mensagem || 'Não foi possível localizar o processo informado.');
    } finally {
        showLoading(false);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }

    const inputProc = document.getElementById('numeroProcesso');
    const form = document.getElementById('consultForm');

    inputProc.addEventListener('input', (e) => {
        e.target.value = mascaraProcessoCNJ(e.target.value);
    });

    form.addEventListener('submit', consultarProcesso);

    // Se vier um número de processo pela URL (?proc=...), restaura do cache se estiver retornando do cadastro ou executa a consulta
    const params = new URLSearchParams(window.location.search);
    const procInicial = params.get('proc');
    const retornouDoCadastro = params.get('retornou') === '1';

    if (procInicial) {
        const formatado = mascaraProcessoCNJ(procInicial);
        inputProc.value = formatado;

        if (retornouDoCadastro) {
            const restaurado = await restaurarConsultaEmCache(formatado);
            if (restaurado) return;
        }

        consultarProcesso();
    } else {
        inputProc.focus();
    }
});
