import { escapeHtml, apiFetch, normalizeText } from './utils.js';
import { FA_FULL_ICON_CATALOG } from './faFullCatalog.js';

export const ICONE_PADRAO_TIPO = 'fa-solid fa-folder';

/**
 * Biblioteca completa externa FontAwesome 6 Free (2.060 ícones em solid, regular e brands),
 * priorizando ícones jurídicos e administrativos no topo com tags bilíngues PT/EN.
 */
export const CATALOGO_ICONES_PROCESSO = FA_FULL_ICON_CATALOG;

const FALLBACK_POR_NOME = {
    'civil': 'fa-solid fa-scale-balanced',
    'previdenciario': 'fa-solid fa-person-cane',
    'trabalhista': 'fa-solid fa-briefcase',
    'inventario': 'fa-solid fa-scroll',
    'familia': 'fa-solid fa-people-roof',
    'consumidor': 'fa-solid fa-cart-shopping',
    'criminal': 'fa-solid fa-handcuffs',
    'santa casa': 'fa-solid fa-hospital',
    'justica gratuita': 'fa-solid fa-hand-holding-dollar',
    'arquivado': 'fa-solid fa-box-archive',
    'outro': 'fa-solid fa-file-lines'
};

const PREFIXOS_EXCLUSIVOS = new Set(['fa-solid', 'fa-regular', 'fa-brands']);

let tiposCache = [];

/**
 * Sanitiza uma classe FontAwesome garantindo formato seguro (`fa-solid fa-...`).
 */
export const sanitizarClasseIcone = (icone) => {
    if (!icone || typeof icone !== 'string') return ICONE_PADRAO_TIPO;
    const limpo = icone.trim().replace(/\s+/g, ' ');
    if (!limpo || limpo.length > 100) return ICONE_PADRAO_TIPO;

    if (/^fa-[a-z0-9-]+$/.test(limpo) && !PREFIXOS_EXCLUSIVOS.has(limpo)) {
        return `fa-solid ${limpo}`;
    }

    if (/^fa-(?:solid|regular|brands)\s+fa-[a-z0-9-]+$/.test(limpo)) {
        const segundaParte = limpo.split(' ')[1];
        if (segundaParte && !PREFIXOS_EXCLUSIVOS.has(segundaParte)) {
            return limpo;
        }
    }

    return ICONE_PADRAO_TIPO;
};

export const atualizarTiposCache = (tipos) => {
    if (!Array.isArray(tipos)) {
        tiposCache = [];
        return tiposCache;
    }

    tiposCache = tipos.map(t => ({
        ...t,
        icone: sanitizarClasseIcone(t?.icone)
    }));
    return tiposCache;
};

export const obterTiposCache = () => tiposCache;

export const buscarTiposProcesso = async ({ forceRefresh = false } = {}) => {
    if (!forceRefresh && tiposCache.length > 0) {
        return tiposCache;
    }

    const token = localStorage.getItem('token');
    if (!token) return tiposCache;

    const tipos = await apiFetch('/clientes/tipos');
    return atualizarTiposCache(Array.isArray(tipos) ? tipos : []);
};

/**
 * Resolve o ícone dinâmico de um Tipo de Processo combinando ícone explícito do backend,
 * cache carregado de `/clientes/tipos` e fallback seguro para registros antigos.
 */
export const resolverIconeTipo = (nomeOuId, iconeExplicito = null, listaTipos = null) => {
    const lista = Array.isArray(listaTipos) && listaTipos.length > 0 ? listaTipos : tiposCache;
    const chave = nomeOuId !== null && nomeOuId !== undefined ? String(nomeOuId).trim() : '';
    const chaveNorm = normalizeText(chave);

    const encontrado = chaveNorm
        ? lista.find(t => String(t.id) === chave || normalizeText(t.nome) === chaveNorm)
        : null;

    if (iconeExplicito) {
        const explicitoSeguro = sanitizarClasseIcone(iconeExplicito);
        if (explicitoSeguro !== ICONE_PADRAO_TIPO) {
            return explicitoSeguro;
        }
    }

    if (encontrado?.icone) {
        const doCache = sanitizarClasseIcone(encontrado.icone);
        if (doCache !== ICONE_PADRAO_TIPO) {
            return doCache;
        }
    }

    if (chaveNorm && FALLBACK_POR_NOME[chaveNorm]) {
        return FALLBACK_POR_NOME[chaveNorm];
    }

    if (iconeExplicito) {
        return sanitizarClasseIcone(iconeExplicito);
    }

    return ICONE_PADRAO_TIPO;
};

/**
 * Carrega a lista de tipos de processos da API e preenche um elemento <select>.
 */
export const carregarTiposSelect = async (selectElement, valorSelecionado = null, options = {}) => {
    if (!selectElement) return [];
    const token = localStorage.getItem('token');
    if (!token) return [];

    const valueField = options.valueField === 'id' ? 'id' : 'nome';

    const sincronizarIconeSelecionado = () => {
        const selectedOption = selectElement.options?.[selectElement.selectedIndex];
        const icone = selectedOption?.dataset?.icone
            ? sanitizarClasseIcone(selectedOption.dataset.icone)
            : ICONE_PADRAO_TIPO;

        if (options.iconTargetElement) {
            options.iconTargetElement.className = icone;
        }
        if (typeof options.onChangeIcone === 'function') {
            options.onChangeIcone(icone, selectedOption?.dataset?.nome || '');
        }
    };

    try {
        const data = await apiFetch('/clientes/tipos');
        const tipos = atualizarTiposCache(Array.isArray(data) ? data : []);

        const valorStr = valorSelecionado !== null && valorSelecionado !== undefined
            ? String(valorSelecionado)
            : '';

        let matchedValue = '';
        const optionsHtml = tipos.map(t => {
            const optionVal = valueField === 'id' ? String(t.id) : t.nome;
            const isSelected = valorStr !== '' && (
                valorStr === String(t.id) ||
                valorStr.toLowerCase() === String(t.nome).toLowerCase()
            );
            if (isSelected) matchedValue = optionVal;

            return `
                <option value="${escapeHtml(optionVal)}"
                        data-id="${escapeHtml(t.id)}"
                        data-nome="${escapeHtml(t.nome)}"
                        data-icone="${escapeHtml(t.icone)}"
                        ${isSelected ? 'selected' : ''}>
                    ${escapeHtml(t.nome)}
                </option>
            `;
        }).join('');

        selectElement.innerHTML = `
            <option value="" disabled ${matchedValue === '' ? 'selected' : ''} data-icone="${ICONE_PADRAO_TIPO}" hidden>Selecione o tipo...</option>
            ${optionsHtml}
        `;

        if (matchedValue !== '') {
            selectElement.value = matchedValue;
        }

        if (!selectElement.dataset.iconeListenerBound) {
            selectElement.addEventListener('change', sincronizarIconeSelecionado);
            selectElement.dataset.iconeListenerBound = '1';
        }
        sincronizarIconeSelecionado();

        return tipos;
    } catch (error) {
        console.error('Erro ao buscar tipos de processo:', error);
        return [];
    }
};

const abrirModalFormTipo = ({ modo = 'create', tipoInicial = null, onSuccess } = {}) => {
    const modalAntigo = document.getElementById('modalNovoTipo');
    if (modalAntigo) modalAntigo.remove();

    const isEdit = modo === 'edit' && tipoInicial?.id;
    const nomeInicial = isEdit ? String(tipoInicial.nome || '') : '';
    let iconeSelecionado = isEdit
        ? resolverIconeTipo(tipoInicial.nome, tipoInicial.icone)
        : CATALOGO_ICONES_PROCESSO[0].classe;

    const iconeEstaNoCatalogo = CATALOGO_ICONES_PROCESSO.some(i => i.classe === iconeSelecionado);
    const catalogoRenderizado = iconeEstaNoCatalogo
        ? CATALOGO_ICONES_PROCESSO
        : [{ classe: iconeSelecionado, nome: 'Ícone Atual', estilo: 'solid', juridico: true, tags: 'atual personalizado' }, ...CATALOGO_ICONES_PROCESSO];

    const totalJuridicos = catalogoRenderizado.filter(i => i.juridico).length;
    const totalSolid = catalogoRenderizado.filter(i => i.estilo === 'solid').length;
    const totalRegular = catalogoRenderizado.filter(i => i.estilo === 'regular').length;
    const totalBrands = catalogoRenderizado.filter(i => i.estilo === 'brands').length;
    const LOTE_RENDER = 120;

    let abaAtiva = 'all';
    let listaFiltrada = catalogoRenderizado;
    let indiceRenderizado = 0;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalNovoTipo';

    overlay.innerHTML = `
        <div class="modal-confirm-content modal-tipo-picker">
            <i class="${escapeHtml(iconeSelecionado)} modal-confirm-icon" id="modalTipoHeaderIcon"></i>
            <h3>${isEdit ? 'Editar Tipo de Processo' : 'Novo Tipo de Processo'}</h3>
            <p>${isEdit
                ? 'Atualize o nome e o ícone representativo desta categoria.'
                : 'Cadastre uma nova categoria e escolha entre mais de 2.000 ícones.'}</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="inputNomeTipo">Nome da Categoria</label>
                <input type="text" id="inputNomeTipo" class="modal-input-novo-tipo"
                       value="${escapeHtml(nomeInicial)}"
                       placeholder="Ex: Tributário, Ambiental, Bancário..."
                       maxlength="64" autofocus>
            </div>

            <div class="tipo-preview-bar" aria-live="polite">
                <span class="tipo-preview-label">Preview da etiqueta:</span>
                <span class="tipo-badge-preview" id="tipoBadgePreview">
                    <i class="${escapeHtml(iconeSelecionado)}" id="tipoPreviewIcon"></i>
                    <span id="tipoPreviewNome">${escapeHtml(nomeInicial || 'Nova Categoria')}</span>
                </span>
            </div>

            <div class="modal-form-left">
                <div class="icon-picker-header">
                    <label class="modal-field-label" for="inputFiltroIconeTipo">Biblioteca (${catalogoRenderizado.length.toLocaleString('pt-BR')} ícones)</label>
                    <span class="icon-picker-selected-name" id="iconPickerSelectedName"></span>
                </div>

                <div class="icon-picker-tabs" role="tablist" aria-label="Filtrar categoria de ícones">
                    <button type="button" class="icon-picker-tab active" data-tab="all" role="tab" aria-selected="true">
                        Todos (${catalogoRenderizado.length.toLocaleString('pt-BR')})
                    </button>
                    <button type="button" class="icon-picker-tab" data-tab="juridico" role="tab" aria-selected="false">
                        Jurídicos (${totalJuridicos})
                    </button>
                    <button type="button" class="icon-picker-tab" data-tab="solid" role="tab" aria-selected="false">
                        Sólidos (${totalSolid})
                    </button>
                    <button type="button" class="icon-picker-tab" data-tab="regular" role="tab" aria-selected="false">
                        Regulares (${totalRegular})
                    </button>
                    <button type="button" class="icon-picker-tab" data-tab="brands" role="tab" aria-selected="false">
                        Marcas (${totalBrands})
                    </button>
                </div>

                <div class="icon-picker-search-wrap">
                    <i class="fa-solid fa-magnifying-glass"></i>
                    <input type="text" id="inputFiltroIconeTipo" class="icon-picker-search"
                           placeholder="Buscar em PT/EN (ex: balança, dinheiro, gavel, law, banco, saúde)...">
                </div>
                <div class="icon-picker-grid" id="iconPickerGrid" role="radiogroup" aria-label="Selecionar ícone do tipo de processo"></div>
                <div class="icon-picker-footer-meta">
                    <span id="iconPickerCountLabel"></span>
                    <p id="iconPickerEmptyMsg" class="icon-picker-empty" style="display: none;">Nenhum ícone encontrado para este filtro.</p>
                </div>
            </div>

            <p id="msgErroTipo" style="color: var(--danger); font-size: 0.82rem; margin-top: 6px; margin-bottom: 14px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelarNovoTipo">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSalvarNovoTipo">${isEdit ? 'Salvar Alterações' : 'Cadastrar Tipo'}</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('inputNomeTipo');
    const filtroInput = document.getElementById('inputFiltroIconeTipo');
    const grid = document.getElementById('iconPickerGrid');
    const emptyMsg = document.getElementById('iconPickerEmptyMsg');
    const countLabel = document.getElementById('iconPickerCountLabel');
    const previewIcon = document.getElementById('tipoPreviewIcon');
    const headerIcon = document.getElementById('modalTipoHeaderIcon');
    const previewNome = document.getElementById('tipoPreviewNome');
    const selectedNameEl = document.getElementById('iconPickerSelectedName');
    const msgErro = document.getElementById('msgErroTipo');
    const btnSalvar = document.getElementById('btnSalvarNovoTipo');
    const btnCancelar = document.getElementById('btnCancelarNovoTipo');

    const atualizarSelecaoIcone = (novaClasse) => {
        iconeSelecionado = sanitizarClasseIcone(novaClasse);
        if (previewIcon) previewIcon.className = iconeSelecionado;
        if (headerIcon) headerIcon.className = `${iconeSelecionado} modal-confirm-icon`;

        grid?.querySelectorAll('.icon-picker-item').forEach(btn => {
            const ativo = btn.dataset.icon === iconeSelecionado;
            btn.classList.toggle('active', ativo);
            btn.setAttribute('aria-checked', ativo ? 'true' : 'false');
        });

        const itemCatalogo = catalogoRenderizado.find(i => i.classe === iconeSelecionado);
        if (selectedNameEl) {
            selectedNameEl.textContent = itemCatalogo?.nome || iconeSelecionado;
        }
    };

    const anexarProximoLote = () => {
        if (!grid || indiceRenderizado >= listaFiltrada.length) return;
        const fim = Math.min(indiceRenderizado + LOTE_RENDER, listaFiltrada.length);
        const fragment = document.createDocumentFragment();

        for (let i = indiceRenderizado; i < fim; i++) {
            const item = listaFiltrada[i];
            const ativo = item.classe === iconeSelecionado;
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = `icon-picker-item${ativo ? ' active' : ''}`;
            btn.dataset.icon = item.classe;
            btn.setAttribute('role', 'radio');
            btn.setAttribute('aria-checked', ativo ? 'true' : 'false');
            btn.setAttribute('aria-label', item.nome);
            btn.title = `${item.nome} (${item.classe})`;
            const iconEl = document.createElement('i');
            iconEl.className = item.classe;
            btn.appendChild(iconEl);
            fragment.appendChild(btn);
        }

        grid.appendChild(fragment);
        indiceRenderizado = fim;
    };

    const aplicarFiltroERenderizar = () => {
        const termos = normalizeText(filtroInput?.value || '')
            .split(/\s+/)
            .filter(Boolean);

        listaFiltrada = catalogoRenderizado.filter(item => {
            if (abaAtiva === 'juridico' && !item.juridico) return false;
            if (abaAtiva === 'solid' && item.estilo !== 'solid') return false;
            if (abaAtiva === 'regular' && item.estilo !== 'regular') return false;
            if (abaAtiva === 'brands' && item.estilo !== 'brands') return false;
            if (termos.length === 0) return true;
            return termos.every(t => item.tags.includes(t));
        });

        if (grid) {
            grid.innerHTML = '';
            grid.scrollTop = 0;
        }
        indiceRenderizado = 0;
        anexarProximoLote();

        if (emptyMsg) {
            emptyMsg.style.display = listaFiltrada.length === 0 ? 'block' : 'none';
        }
        if (countLabel) {
            countLabel.textContent = listaFiltrada.length === 0
                ? ''
                : `Exibindo ${listaFiltrada.length.toLocaleString('pt-BR')} ${listaFiltrada.length === 1 ? 'ícone' : 'ícones'}${listaFiltrada.length > LOTE_RENDER ? ' (role para carregar mais)' : ''}`;
        }
    };

    atualizarSelecaoIcone(iconeSelecionado);
    aplicarFiltroERenderizar();

    input?.addEventListener('input', () => {
        if (previewNome) {
            previewNome.textContent = input.value.trim() || 'Nova Categoria';
        }
    });

    overlay.querySelectorAll('.icon-picker-tab').forEach(tabBtn => {
        tabBtn.addEventListener('click', () => {
            abaAtiva = tabBtn.dataset.tab || 'all';
            overlay.querySelectorAll('.icon-picker-tab').forEach(b => {
                const sel = b === tabBtn;
                b.classList.toggle('active', sel);
                b.setAttribute('aria-selected', sel ? 'true' : 'false');
            });
            aplicarFiltroERenderizar();
        });
    });

    filtroInput?.addEventListener('input', aplicarFiltroERenderizar);

    grid?.addEventListener('scroll', () => {
        if (grid.scrollTop + grid.clientHeight >= grid.scrollHeight - 60) {
            anexarProximoLote();
        }
    });

    grid?.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-picker-item');
        if (btn?.dataset?.icon) {
            atualizarSelecaoIcone(btn.dataset.icon);
        }
    });

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancelar.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    const salvar = async () => {
        const nome = input.value.trim();
        msgErro.textContent = '';

        if (!nome) {
            msgErro.textContent = 'Informe o nome do tipo de processo.';
            input.focus();
            return;
        }

        btnSalvar.disabled = true;

        try {
            const endpoint = isEdit
                ? `/clientes/tipos/${encodeURIComponent(tipoInicial.id)}`
                : '/clientes/tipos';
            const method = isEdit ? 'PUT' : 'POST';

            const data = await apiFetch(endpoint, {
                method,
                body: JSON.stringify({ nome, icone: iconeSelecionado })
            });

            // Força atualização do cache local para refletir imediatamente o novo ícone
            tiposCache = [];
            fechar();
            if (typeof onSuccess === 'function') {
                onSuccess(data.nome, data.id, data.icone || iconeSelecionado);
            }
        } catch (err) {
            console.error('Erro ao salvar tipo de processo:', err);
            msgErro.textContent = err.data?.mensagem || 'Erro de conexão com o servidor.';
            btnSalvar.disabled = false;
        }
    };

    btnSalvar.addEventListener('click', salvar);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            salvar();
        }
    });

    setTimeout(() => {
        input?.focus();
        if (isEdit) input?.select();
    }, 100);
};

/**
 * Abre modal moderno para cadastrar um novo tipo de processo com Icon Picker.
 */
export const abrirModalNovoTipo = (onSuccess) => {
    abrirModalFormTipo({ modo: 'create', onSuccess });
};

/**
 * Abre modal moderno para editar nome e ícone de um tipo de processo existente.
 */
export const abrirModalEditarTipo = (tipo, onSuccess) => {
    abrirModalFormTipo({ modo: 'edit', tipoInicial: tipo, onSuccess });
};
