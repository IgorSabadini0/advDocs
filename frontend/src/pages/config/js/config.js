import { abrirModalNovoTipo } from '../../../utils/tiposService.js';
import { escapeHtml, normalizeText, apiFetch, mostrarToast } from '../../../utils/utils.js';
import { initThemeManager, getSavedTheme, applyTheme, resolveTheme } from '../../../utils/themeManager.js';
import { initNotificationsWidget } from '../../../utils/notificationsWidget.js';

initThemeManager();

let usuarioLogado = null;
let gruposCache = [];
let politicasCache = [];
let usuariosCache = [];

const isUsuarioAdmin = () => Boolean(usuarioLogado && (usuarioLogado.is_admin || usuarioLogado.role === 'admin'));

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '../auth';
};

// --- NOTIFICAÇÕES TOAST & UX HELPERS ---

const gerarSlugChave = (texto) => {
    return normalizeText(texto)
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 64);
};

// --- NAVEGAÇÃO ENTRE PAINÉIS (SIDEBAR) ---

const MAPA_HASH_PAINEL = {
    '#perfil': 'panel-perfil',
    '#tipos': 'panel-tipos',
    '#rbac': 'panel-rbac',
    '#usuarios': 'panel-usuarios'
};

const MAPA_PAINEL_HASH = {
    'panel-perfil': '#perfil',
    'panel-tipos': '#tipos',
    'panel-rbac': '#rbac',
    'panel-usuarios': '#usuarios'
};

const alternarPainel = (targetId, atualizarHash = true) => {
    const adminOnlyPanels = ['panel-rbac', 'panel-usuarios'];
    if (adminOnlyPanels.includes(targetId) && !isUsuarioAdmin()) {
        targetId = 'panel-perfil';
    }

    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });

    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === targetId);
    });

    if (atualizarHash && MAPA_PAINEL_HASH[targetId]) {
        history.replaceState(null, '', MAPA_PAINEL_HASH[targetId]);
    }
};

// Fecha o modal ativo ao pressionar ESC
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const modaisAbertos = document.querySelectorAll('.modal-overlay.show');
        if (modaisAbertos.length > 0) {
            const ultimoModal = modaisAbertos[modaisAbertos.length - 1];
            ultimoModal.classList.remove('show');
            setTimeout(() => ultimoModal.remove(), 250);
        }
    }
});

// --- 1. MEU PERFIL E ALTERAÇÃO DE SENHA / NOME ---

const carregarMeuPerfil = async () => {
    try {
        usuarioLogado = await apiFetch('/users/me');
        const userNameEl = document.getElementById('user-name');
        const userLoginEl = document.getElementById('user-login');
        const sidebarNameEl = document.getElementById('sidebar-user-name');
        const sidebarLoginEl = document.getElementById('sidebar-user-login');
        const userGrupoBadge = document.getElementById('user-grupo-badge');
        const minhasPoliticasContainer = document.getElementById('minhasPoliticasContainer');
        const minhasPoliticasCount = document.getElementById('minhasPoliticasCount');

        const sidebarGroupAdmin = document.getElementById('sidebarGroupAdmin');
        const navItemRbac = document.getElementById('navItemRbac');
        const navItemUsuarios = document.getElementById('navItemUsuarios');
        const btnNovoUsuario = document.getElementById('btnNovoUsuario');

        if (userNameEl) userNameEl.textContent = usuarioLogado.name;
        if (userLoginEl) userLoginEl.textContent = `@${usuarioLogado.user}`;
        if (sidebarNameEl) sidebarNameEl.textContent = usuarioLogado.name;
        if (sidebarLoginEl) sidebarLoginEl.textContent = `@${usuarioLogado.user}`;

        if (userGrupoBadge) {
            const nomeGrupo = usuarioLogado.grupo_nome || (usuarioLogado.is_admin ? 'Administrador' : 'Operacional');
            userGrupoBadge.className = `status-badge-grupo ${usuarioLogado.is_admin ? 'admin' : ''}`;
            userGrupoBadge.innerHTML = `<i class="fa-solid ${usuarioLogado.is_admin ? 'fa-shield-halved' : 'fa-user-tag'}"></i> ${escapeHtml(nomeGrupo)}`;
        }

        const politicas = Array.isArray(usuarioLogado.politicas) ? usuarioLogado.politicas : [];
        if (minhasPoliticasCount) {
            minhasPoliticasCount.textContent = `${politicas.length} ${politicas.length === 1 ? 'política ativa' : 'políticas ativas'}`;
        }

        if (minhasPoliticasContainer) {
            minhasPoliticasContainer.innerHTML = politicas.length > 0
                ? politicas.map(p => `
                    <span class="politica-tag" title="${escapeHtml(p.descricao || p.nome)}">
                        <i class="fa-solid fa-check"></i> ${escapeHtml(p.nome)}
                        <code>${escapeHtml(p.chave)}</code>
                    </span>
                `).join('')
                : '<span class="sem-politicas-msg">Nenhuma política vinculada ao seu grupo atual.</span>';
        }

        const admin = isUsuarioAdmin();
        if (sidebarGroupAdmin) sidebarGroupAdmin.style.display = admin ? 'flex' : 'none';
        if (navItemRbac) navItemRbac.style.display = admin ? 'flex' : 'none';
        if (navItemUsuarios) navItemUsuarios.style.display = admin ? 'flex' : 'none';
        if (btnNovoUsuario) btnNovoUsuario.style.display = admin ? 'inline-flex' : 'none';

        if (!admin) {
            const painelAtivo = document.querySelector('.settings-panel.active');
            if (painelAtivo && painelAtivo.dataset.adminOnly === 'true') {
                alternarPainel('panel-perfil');
            }
        }

        return usuarioLogado;
    } catch (e) {
        console.error('Erro ao carregar dados do perfil:', e);
        return null;
    }
};

const abrirModalEditarNome = () => {
    const modalAntigo = document.getElementById('modalEditarNome');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalEditarNome';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-user-pen modal-confirm-icon"></i>
            <h3>Editar Nome de Exibição</h3>
            <p>Atualize como seu nome aparece nos registros do escritório.</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="inputNovoNome">Nome Completo</label>
                <input type="text" id="inputNovoNome" class="modal-input-novo-tipo" value="${escapeHtml(usuarioLogado?.name || '')}" placeholder="Seu nome completo" maxlength="64" autofocus>
            </div>
            <p id="msgErroNome" style="color: var(--danger); font-size: 0.84rem; margin-top: -10px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelEditNome">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSaveEditNome">Salvar Nome</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('inputNovoNome');
    const msgErro = document.getElementById('msgErroNome');
    const btnSave = document.getElementById('btnSaveEditNome');
    const btnCancel = document.getElementById('btnCancelEditNome');

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    const salvar = async () => {
        const name = input.value.trim();
        msgErro.textContent = '';

        if (!name || name.length < 2) {
            msgErro.textContent = 'Informe um nome com pelo menos 2 caracteres.';
            input.focus();
            return;
        }

        btnSave.disabled = true;

        try {
            await apiFetch('/users/me', {
                method: 'PUT',
                body: JSON.stringify({ name })
            });

            fechar();
            mostrarToast('Nome de exibição atualizado com sucesso!');
            await carregarMeuPerfil();
            if (isUsuarioAdmin()) {
                await carregarUsuariosConfig();
            }
        } catch (e) {
            console.error('Erro ao atualizar nome:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnSave.disabled = false;
        }
    };

    btnSave.addEventListener('click', salvar);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') salvar();
    });
};

const abrirModalAlterarSenha = () => {
    const modalAntigo = document.getElementById('modalAlterarSenha');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalAlterarSenha';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-key modal-confirm-icon"></i>
            <h3>Alterar Minha Senha</h3>
            <p>Informe sua senha atual e escolha uma nova senha segura.</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="inputSenhaAtual">Senha Atual</label>
                <input type="password" id="inputSenhaAtual" class="modal-input-novo-tipo" placeholder="Digite sua senha atual" maxlength="72" style="margin-bottom: 10px;" autofocus>

                <label class="modal-field-label" for="inputNovaSenha">Nova Senha</label>
                <input type="password" id="inputNovaSenha" class="modal-input-novo-tipo" placeholder="Mínimo de 8 caracteres" maxlength="72" style="margin-bottom: 10px;">

                <label class="modal-field-label" for="inputConfirmarSenha">Confirmar Nova Senha</label>
                <input type="password" id="inputConfirmarSenha" class="modal-input-novo-tipo" placeholder="Repita a nova senha" maxlength="72">
            </div>
            
            <p id="msgErroSenha" style="color: var(--danger); font-size: 0.84rem; margin-top: -10px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelSenha">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSaveSenha">Atualizar Senha</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputAtual = document.getElementById('inputSenhaAtual');
    const inputNova = document.getElementById('inputNovaSenha');
    const inputConfirmar = document.getElementById('inputConfirmarSenha');
    const msgErro = document.getElementById('msgErroSenha');
    const btnSave = document.getElementById('btnSaveSenha');
    const btnCancel = document.getElementById('btnCancelSenha');

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    const salvar = async () => {
        const senhaAtual = inputAtual.value;
        const novaSenha = inputNova.value;
        const confirmarSenha = inputConfirmar.value;
        msgErro.textContent = '';

        if (!senhaAtual) {
            msgErro.textContent = 'Informe sua senha atual.';
            inputAtual.focus();
            return;
        }

        if (!novaSenha || novaSenha.length < 8 || novaSenha.length > 72) {
            msgErro.textContent = 'A nova senha deve ter entre 8 e 72 caracteres.';
            inputNova.focus();
            return;
        }

        if (novaSenha !== confirmarSenha) {
            msgErro.textContent = 'A confirmação de senha não confere.';
            inputConfirmar.focus();
            return;
        }

        btnSave.disabled = true;

        try {
            await apiFetch('/users/me/password', {
                method: 'PUT',
                body: JSON.stringify({ senhaAtual, novaSenha })
            });

            fechar();
            mostrarToast('Sua senha de acesso foi alterada com sucesso!');
        } catch (e) {
            console.error('Erro ao alterar senha:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnSave.disabled = false;
        }
    };

    btnSave.addEventListener('click', salvar);
};

// --- 2. GESTÃO DE TIPOS DE PROCESSOS ---

const confirmarExclusaoTipo = (id, nome) => {
    const modalAntigo = document.getElementById('modalConfirmDeleteTipo');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalConfirmDeleteTipo';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon danger"></i>
            <h3>Remover Tipo de Processo</h3>
            <p>Deseja realmente remover a categoria <strong style="color: var(--brand-gold);">${escapeHtml(nome)}</strong>?</p>
            <p id="msgErroDeleteTipo" style="color: var(--danger); font-size: 0.85rem; margin-top: -16px; margin-bottom: 20px; min-height: 18px;"></p>
            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelDeleteTipo">Cancelar</button>
                <button type="button" class="btn-confirm-delete-act" id="btnConfirmDeleteTipo">Remover</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    const btnCancel = document.getElementById('btnCancelDeleteTipo');
    const btnConfirm = document.getElementById('btnConfirmDeleteTipo');
    const msgErro = document.getElementById('msgErroDeleteTipo');

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    btnConfirm.addEventListener('click', async () => {
        btnConfirm.disabled = true;
        msgErro.textContent = '';

        try {
            await apiFetch(`/clientes/tipos/${id}`, {
                method: 'DELETE'
            });

            fechar();
            mostrarToast(`Categoria "${nome}" removida com sucesso!`);
            await carregarTiposConfig();
        } catch (e) {
            console.error('Erro ao excluir tipo de processo:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnConfirm.disabled = false;
        }
    });
};

const carregarTiposConfig = async () => {
    const container = document.getElementById('tiposListContainer');
    const badgeCountTipos = document.getElementById('badgeCountTipos');
    const tiposTotalLabel = document.getElementById('tiposTotalLabel');
    if (!container) return;

    try {
        const tipos = await apiFetch('/clientes/tipos');
        const total = Array.isArray(tipos) ? tipos.length : 0;

        if (badgeCountTipos) badgeCountTipos.textContent = total;
        if (tiposTotalLabel) tiposTotalLabel.textContent = `${total} ${total === 1 ? 'categoria' : 'categorias'}`;

        if (total === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum tipo cadastrado.</span>';
            return;
        }

        container.innerHTML = tipos.map(t => `
            <span class="tipo-badge">
                <i class="fa-solid fa-tag tipo-badge-icon"></i>
                <span>${escapeHtml(t.nome)}</span>
                <button type="button" class="btn-delete-tipo" data-id="${t.id}" data-nome="${escapeHtml(t.nome)}" title="Remover categoria ${escapeHtml(t.nome)}">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </span>
        `).join('');

        container.querySelectorAll('.btn-delete-tipo').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                confirmarExclusaoTipo(btn.dataset.id, btn.dataset.nome);
            });
        });
    } catch (e) {
        console.error('Erro ao listar tipos de processos na config:', e);
    }
};

// --- 3. CONTROLE DE ACESSO RBAC (GRUPOS E POLÍTICAS) ---

const carregarDadosRBAC = async () => {
    if (!isUsuarioAdmin()) return;

    const container = document.getElementById('gruposListContainer');
    if (!container) return;

    try {
        const [grupos, politicas] = await Promise.all([
            apiFetch('/rbac/grupos'),
            apiFetch('/rbac/politicas')
        ]);

        gruposCache = Array.isArray(grupos) ? grupos : [];
        politicasCache = Array.isArray(politicas) ? politicas : [];

        const badgeCountGrupos = document.getElementById('badgeCountGrupos');
        const gruposTotalLabel = document.getElementById('gruposTotalLabel');
        const politicasTotalLabel = document.getElementById('politicasTotalLabel');

        if (badgeCountGrupos) badgeCountGrupos.textContent = gruposCache.length;
        if (gruposTotalLabel) {
            gruposTotalLabel.textContent = `${gruposCache.length} ${gruposCache.length === 1 ? 'grupo' : 'grupos'}`;
        }
        if (politicasTotalLabel) {
            politicasTotalLabel.textContent = `${politicasCache.length} ${politicasCache.length === 1 ? 'política' : 'políticas'}`;
        }

        renderizarGruposRBAC();
        renderizarCatalogoPoliticas();
    } catch (e) {
        console.error('Erro ao carregar dados RBAC:', e);
        container.innerHTML = '<span style="color: var(--danger); font-size: 0.85rem;">Erro ao carregar grupos e políticas de acesso.</span>';
    }
};

const renderizarCatalogoPoliticas = () => {
    const container = document.getElementById('politicasCatalogoContainer');
    if (!container) return;

    if (politicasCache.length === 0) {
        container.innerHTML = '<span class="sem-politicas-msg">Nenhuma política cadastrada no sistema.</span>';
        return;
    }

    container.innerHTML = politicasCache.map(p => {
        const isEssencial = p.chave === 'manage_acl';
        return `
            <div class="catalogo-politica-card ${isEssencial ? 'is-core' : ''}">
                <div class="catalogo-politica-top">
                    <strong>
                        <i class="fa-solid ${isEssencial ? 'fa-shield-halved' : 'fa-key'}"></i>
                        ${escapeHtml(p.nome)}
                    </strong>
                    <code>${escapeHtml(p.chave)}</code>
                </div>
                <p>${escapeHtml(p.descricao || 'Sem descrição cadastrada.')}</p>
                <div class="catalogo-politica-footer">
                    <span><i class="fa-solid fa-layer-group"></i> Em ${p.total_grupos ?? 0} grupo(s)</span>
                    ${isEssencial ? '<span class="core-badge">Política Base</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
};

const renderizarGruposRBAC = () => {
    const container = document.getElementById('gruposListContainer');
    if (!container) return;

    if (gruposCache.length === 0) {
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum grupo cadastrado.</span>';
        return;
    }

    container.innerHTML = gruposCache.map(g => {
        const isGrupoPadraoAdmin = String(g.nome || '').trim().toLowerCase() === 'administrador';
        const badgeTipoGrupo = g.is_admin_group
            ? '<span class="status-badge-admin"><i class="fa-solid fa-shield-halved"></i> Acesso Admin</span>'
            : '<span class="status-badge-padrao"><i class="fa-solid fa-layer-group"></i> Grupo Padrão</span>';

        const politicasHtml = (g.politicas && g.politicas.length > 0)
            ? g.politicas.map(p => `
                <span class="politica-tag" title="${escapeHtml(p.descricao || p.nome)}">
                    <i class="fa-solid fa-check"></i> ${escapeHtml(p.nome)}
                    <code>${escapeHtml(p.chave)}</code>
                </span>
            `).join('')
            : '<span class="sem-politicas-msg">Nenhuma política vinculada a este grupo</span>';

        const btnExcluirHtml = isGrupoPadraoAdmin
            ? ''
            : `
                <button type="button" class="btn-sm-action danger" data-action="delete-grupo" data-id="${g.id}" data-nome="${escapeHtml(g.nome)}" title="Excluir grupo">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;

        return `
            <div class="grupo-item ${g.is_admin_group ? 'is-admin-group' : ''}">
                <div class="grupo-item-top">
                    <div class="grupo-item-header">
                        <h4>
                            ${escapeHtml(g.nome)}
                            ${badgeTipoGrupo}
                            <span class="grupo-count-users" title="Usuários vinculados a este grupo">
                                <i class="fa-solid fa-users"></i> ${g.total_usuarios} ${g.total_usuarios === 1 ? 'membro' : 'membros'}
                            </span>
                        </h4>
                        <p class="grupo-item-desc">${escapeHtml(g.descricao || 'Sem descrição cadastrada.')}</p>
                    </div>
                    <div class="grupo-item-actions">
                        <button type="button" class="btn-sm-action" data-action="edit-grupo" data-id="${g.id}" title="Editar grupo e vincular políticas">
                            <i class="fa-solid fa-sliders"></i> Políticas / Editar
                        </button>
                        ${btnExcluirHtml}
                    </div>
                </div>
                <div class="grupo-politicas-badges">
                    ${politicasHtml}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="edit-grupo"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const grupo = gruposCache.find(g => String(g.id) === String(btn.dataset.id));
            if (grupo) abrirModalGrupo(grupo);
        });
    });

    container.querySelectorAll('[data-action="delete-grupo"]').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmarExclusaoGrupo(btn.dataset.id, btn.dataset.nome);
        });
    });
};

const abrirModalGrupo = (grupoEdicao = null) => {
    if (!isUsuarioAdmin()) return;

    const modalAntigo = document.getElementById('modalGrupoRBAC');
    if (modalAntigo) modalAntigo.remove();

    const isEdit = Boolean(grupoEdicao && grupoEdicao.id);
    const isGrupoPadraoAdmin = isEdit && String(grupoEdicao.nome || '').trim().toLowerCase() === 'administrador';
    const idsVinculados = new Set((grupoEdicao?.politicas || []).map(p => Number(p.id)));

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalGrupoRBAC';

    const checklistHtml = politicasCache.length === 0
        ? '<p style="font-size: 0.82rem; color: var(--text-muted); margin: 0;">Nenhuma política cadastrada. Crie políticas primeiro.</p>'
        : politicasCache.map(pol => {
            const obrigatoriaAdmin = isGrupoPadraoAdmin && pol.chave === 'manage_acl';
            const checked = idsVinculados.has(Number(pol.id)) || obrigatoriaAdmin;

            return `
                <label class="politica-check-item ${checked ? 'checked' : ''}" data-pol-id="${pol.id}">
                    <input
                        type="checkbox"
                        name="politicaGrupoCheck"
                        value="${pol.id}"
                        ${checked ? 'checked' : ''}
                        ${obrigatoriaAdmin ? 'disabled' : ''}
                    >
                    <div class="politica-check-text">
                        <div class="politica-check-title">
                            <span>${escapeHtml(pol.nome)}</span>
                            <code>${escapeHtml(pol.chave)}</code>
                        </div>
                        <span class="politica-check-desc">
                            ${escapeHtml(pol.descricao || 'Sem descrição.')}
                            ${obrigatoriaAdmin ? ' (Obrigatória no grupo Administrador)' : ''}
                        </span>
                    </div>
                </label>
            `;
        }).join('');

    overlay.innerHTML = `
        <div class="modal-confirm-content modal-lg-rbac">
            <i class="fa-solid fa-layer-group modal-confirm-icon"></i>
            <h3>${isEdit ? `Editar Grupo: ${escapeHtml(grupoEdicao.nome)}` : 'Novo Grupo de Permissões'}</h3>
            <p>Defina a identificação do grupo e marque as políticas de acesso vinculadas.</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="inputNomeGrupo">Nome do Grupo</label>
                <input
                    type="text"
                    id="inputNomeGrupo"
                    class="modal-input-novo-tipo"
                    value="${escapeHtml(grupoEdicao?.nome || '')}"
                    placeholder="Ex: Financeiro, Paralegal, Sócio..."
                    maxlength="64"
                    style="margin-bottom: 10px;"
                    ${isGrupoPadraoAdmin ? 'readonly title="O nome do grupo padrão Administrador não pode ser alterado"' : 'autofocus'}
                >

                <label class="modal-field-label" for="inputDescGrupo">Descrição</label>
                <input
                    type="text"
                    id="inputDescGrupo"
                    class="modal-input-novo-tipo"
                    value="${escapeHtml(grupoEdicao?.descricao || '')}"
                    placeholder="Breve descrição das atribuições deste grupo"
                    maxlength="255"
                    style="margin-bottom: 14px;"
                >

                <div class="modal-field-header">
                    <label class="modal-field-label" style="margin-bottom: 0;">Políticas Vinculadas (<span id="countPolSelecionadas">0</span>/${politicasCache.length})</label>
                    <button type="button" class="btn-link-gold" id="btnToggleAllPoliticas">Selecionar todas</button>
                </div>
                <div class="politicas-checklist" id="checklistPoliticasGrupo">
                    ${checklistHtml}
                </div>
            </div>

            <p id="msgErroGrupoRBAC" style="color: var(--danger); font-size: 0.84rem; margin-top: 8px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelGrupoRBAC">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSaveGrupoRBAC">
                    ${isEdit ? 'Salvar Alterações' : 'Criar Grupo'}
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputNome = document.getElementById('inputNomeGrupo');
    const inputDesc = document.getElementById('inputDescGrupo');
    const msgErro = document.getElementById('msgErroGrupoRBAC');
    const btnCancel = document.getElementById('btnCancelGrupoRBAC');
    const btnSave = document.getElementById('btnSaveGrupoRBAC');
    const btnToggleAll = document.getElementById('btnToggleAllPoliticas');
    const countPolEl = document.getElementById('countPolSelecionadas');

    const atualizarContadorCheckboxes = () => {
        const todos = Array.from(overlay.querySelectorAll('input[name="politicaGrupoCheck"]'));
        const marcados = todos.filter(c => c.checked).length;
        if (countPolEl) countPolEl.textContent = marcados;
        if (btnToggleAll) {
            btnToggleAll.textContent = marcados === todos.length ? 'Desmarcar opcionais' : 'Selecionar todas';
        }
    };

    atualizarContadorCheckboxes();

    overlay.querySelectorAll('.politica-check-item input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', () => {
            chk.closest('.politica-check-item')?.classList.toggle('checked', chk.checked);
            atualizarContadorCheckboxes();
        });
    });

    btnToggleAll?.addEventListener('click', () => {
        const editaveis = Array.from(overlay.querySelectorAll('input[name="politicaGrupoCheck"]:not(:disabled)'));
        const todosMarcados = editaveis.every(c => c.checked);
        editaveis.forEach(c => {
            c.checked = !todosMarcados;
            c.closest('.politica-check-item')?.classList.toggle('checked', c.checked);
        });
        atualizarContadorCheckboxes();
    });

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    const salvar = async () => {
        const nome = inputNome.value.trim();
        const descricao = inputDesc.value.trim();
        msgErro.textContent = '';

        if (!nome || nome.length < 2) {
            msgErro.textContent = 'Informe um nome válido para o grupo (mín. 2 caracteres).';
            inputNome.focus();
            return;
        }

        const politicaIds = Array.from(
            overlay.querySelectorAll('input[name="politicaGrupoCheck"]:checked')
        ).map(el => Number(el.value));

        btnSave.disabled = true;

        try {
            if (isEdit) {
                await apiFetch(`/rbac/grupos/${grupoEdicao.id}`, {
                    method: 'PUT',
                    body: JSON.stringify({ nome, descricao, politicaIds })
                });
                mostrarToast(`Grupo "${nome}" atualizado com sucesso!`);
            } else {
                await apiFetch('/rbac/grupos', {
                    method: 'POST',
                    body: JSON.stringify({ nome, descricao, politicaIds })
                });
                mostrarToast(`Grupo "${nome}" criado com sucesso!`);
            }

            fechar();
            await carregarMeuPerfil();
            await carregarDadosRBAC();
            await carregarUsuariosConfig();
        } catch (e) {
            console.error('Erro ao salvar grupo RBAC:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro ao salvar grupo de permissões.';
            btnSave.disabled = false;
        }
    };

    btnSave.addEventListener('click', salvar);
};

const confirmarExclusaoGrupo = (id, nome) => {
    if (!isUsuarioAdmin()) return;

    const modalAntigo = document.getElementById('modalConfirmDeleteGrupo');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalConfirmDeleteGrupo';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon danger"></i>
            <h3>Excluir Grupo de Permissões</h3>
            <p>Deseja realmente excluir o grupo <strong style="color: var(--brand-gold);">${escapeHtml(nome)}</strong>?</p>
            <p id="msgErroDeleteGrupo" style="color: var(--danger); font-size: 0.85rem; margin-top: -16px; margin-bottom: 20px; min-height: 18px;"></p>
            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelDeleteGrupo">Cancelar</button>
                <button type="button" class="btn-confirm-delete-act" id="btnConfirmDeleteGrupo">Excluir Grupo</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    const btnCancel = document.getElementById('btnCancelDeleteGrupo');
    const btnConfirm = document.getElementById('btnConfirmDeleteGrupo');
    const msgErro = document.getElementById('msgErroDeleteGrupo');

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    btnConfirm.addEventListener('click', async () => {
        btnConfirm.disabled = true;
        msgErro.textContent = '';

        try {
            await apiFetch(`/rbac/grupos/${id}`, {
                method: 'DELETE'
            });
            fechar();
            mostrarToast(`Grupo "${nome}" excluído com sucesso!`);
            await carregarDadosRBAC();
        } catch (e) {
            console.error('Erro ao excluir grupo:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro ao excluir grupo.';
            btnConfirm.disabled = false;
        }
    });
};

const abrirModalGerenciarPoliticas = () => {
    if (!isUsuarioAdmin()) return;

    const modalAntigo = document.getElementById('modalGerenciarPoliticas');
    if (modalAntigo) modalAntigo.remove();

    let politicaEmEdicaoId = null;
    let chaveEditadaManualmente = false;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalGerenciarPoliticas';

    overlay.innerHTML = `
        <div class="modal-confirm-content modal-lg-rbac">
            <i class="fa-solid fa-key modal-confirm-icon"></i>
            <h3>Gerenciar Políticas de Acesso</h3>
            <p>Crie ou edite políticas de permissão para vincular aos grupos do escritório.</p>

            <div class="nova-politica-box">
                <div class="nova-politica-box-header">
                    <span id="tituloFormPolitica">Nova Política de Permissão</span>
                    <button type="button" class="btn-link-gold" id="btnCancelarEdicaoPol" style="display: none;">Cancelar edição</button>
                </div>
                <div class="nova-politica-grid">
                    <div>
                        <label class="modal-field-label" for="inputNomePolitica">Nome da Política</label>
                        <input type="text" id="inputNomePolitica" class="modal-input-novo-tipo" placeholder="Ex: Exportar Relatórios" maxlength="64" style="margin-bottom: 8px;">
                    </div>
                    <div>
                        <label class="modal-field-label" for="inputChavePolitica">Chave Técnica (slug)</label>
                        <input type="text" id="inputChavePolitica" class="modal-input-novo-tipo" placeholder="Ex: exportar_relatorios" maxlength="64" style="margin-bottom: 8px;">
                    </div>
                </div>
                <label class="modal-field-label" for="inputDescPolitica">Descrição da Permissão</label>
                <div class="nova-politica-row">
                    <input type="text" id="inputDescPolitica" class="modal-input-novo-tipo" placeholder="Ex: Permite gerar e baixar relatórios em PDF/CSV" maxlength="255" style="margin-bottom: 0;">
                    <button type="button" class="btn-confirm-edit-act" id="btnCriarPoliticaModal">
                        <i class="fa-solid fa-plus"></i> <span id="textoBtnSalvarPol">Adicionar</span>
                    </button>
                </div>
            </div>

            <p id="msgErroPoliticaModal" style="color: var(--danger); font-size: 0.84rem; margin-top: 8px; margin-bottom: 10px; min-height: 18px;"></p>

            <div class="modal-form-left">
                <label class="modal-field-label">Políticas Cadastradas (${politicasCache.length})</label>
                <div class="politicas-manage-list" id="listaPoliticasModal"></div>
            </div>

            <div class="confirm-buttons-group" style="margin-top: 18px;">
                <button type="button" class="btn-cancel-modal" id="btnFecharPoliticasModal">Concluir</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputNome = document.getElementById('inputNomePolitica');
    const inputChave = document.getElementById('inputChavePolitica');
    const inputDesc = document.getElementById('inputDescPolitica');
    const tituloFormPol = document.getElementById('tituloFormPolitica');
    const textoBtnSalvarPol = document.getElementById('textoBtnSalvarPol');
    const btnCancelarEdicaoPol = document.getElementById('btnCancelarEdicaoPol');
    const msgErro = document.getElementById('msgErroPoliticaModal');
    const btnCriar = document.getElementById('btnCriarPoliticaModal');
    const btnFechar = document.getElementById('btnFecharPoliticasModal');

    const resetarFormPolitica = () => {
        politicaEmEdicaoId = null;
        chaveEditadaManualmente = false;
        inputNome.value = '';
        inputChave.value = '';
        inputChave.readOnly = false;
        inputDesc.value = '';
        if (tituloFormPol) tituloFormPol.textContent = 'Nova Política de Permissão';
        if (textoBtnSalvarPol) textoBtnSalvarPol.textContent = 'Adicionar';
        if (btnCancelarEdicaoPol) btnCancelarEdicaoPol.style.display = 'none';
        msgErro.textContent = '';
    };

    inputNome.addEventListener('input', () => {
        if (!politicaEmEdicaoId && !chaveEditadaManualmente) {
            inputChave.value = gerarSlugChave(inputNome.value);
        }
    });

    inputChave.addEventListener('input', () => {
        chaveEditadaManualmente = inputChave.value.trim().length > 0;
        inputChave.value = inputChave.value.toLowerCase().replace(/\s+/g, '_');
    });

    btnCancelarEdicaoPol?.addEventListener('click', resetarFormPolitica);

    const renderConteudoPoliticas = () => {
        const listaEl = document.getElementById('listaPoliticasModal');
        if (!listaEl) return;

        if (politicasCache.length === 0) {
            listaEl.innerHTML = '<span style="color: var(--text-muted); font-size: 0.84rem;">Nenhuma política cadastrada.</span>';
            return;
        }

        listaEl.innerHTML = politicasCache.map(p => {
            const isEssencial = p.chave === 'manage_acl';
            return `
                <div class="politica-manage-item">
                    <div class="politica-manage-info">
                        <div class="politica-manage-title">
                            <strong>${escapeHtml(p.nome)}</strong>
                            <code>${escapeHtml(p.chave)}</code>
                            <span class="politica-grupos-badge">${p.total_grupos ?? 0} grupo(s)</span>
                        </div>
                        <span class="politica-manage-desc">${escapeHtml(p.descricao || 'Sem descrição.')}</span>
                    </div>
                    <div class="politica-manage-actions">
                        <button type="button" class="btn-sm-action" data-action="edit-politica" data-id="${p.id}" title="Editar política">
                            <i class="fa-solid fa-pen"></i>
                        </button>
                        ${isEssencial
                            ? '<span class="politica-protected-tag" title="Política base do sistema"><i class="fa-solid fa-lock"></i> Base</span>'
                            : `<button type="button" class="btn-sm-action danger" data-action="del-politica" data-id="${p.id}" data-nome="${escapeHtml(p.nome)}" title="Excluir política">
                                <i class="fa-solid fa-trash"></i>
                               </button>`
                        }
                    </div>
                </div>
            `;
        }).join('');

        listaEl.querySelectorAll('[data-action="edit-politica"]').forEach(btn => {
            btn.addEventListener('click', () => {
                const pol = politicasCache.find(item => String(item.id) === String(btn.dataset.id));
                if (!pol) return;

                politicaEmEdicaoId = pol.id;
                chaveEditadaManualmente = true;
                inputNome.value = pol.nome || '';
                inputChave.value = pol.chave || '';
                inputChave.readOnly = pol.chave === 'manage_acl';
                inputDesc.value = pol.descricao || '';
                if (tituloFormPol) tituloFormPol.textContent = `Editando Política: ${pol.nome}`;
                if (textoBtnSalvarPol) textoBtnSalvarPol.textContent = 'Salvar';
                if (btnCancelarEdicaoPol) btnCancelarEdicaoPol.style.display = 'inline-block';
                inputNome.focus();
            });
        });

        listaEl.querySelectorAll('[data-action="del-politica"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const polId = btn.dataset.id;
                const polNome = btn.dataset.nome;
                btn.disabled = true;
                msgErro.textContent = '';

                try {
                    await apiFetch(`/rbac/politicas/${polId}`, {
                        method: 'DELETE'
                    });
                    if (String(politicaEmEdicaoId) === String(polId)) {
                        resetarFormPolitica();
                    }
                    mostrarToast(`Política "${polNome}" excluída!`);
                    await carregarMeuPerfil();
                    await carregarDadosRBAC();
                    renderConteudoPoliticas();
                } catch (e) {
                    msgErro.textContent = e.data?.mensagem || 'Erro ao excluir política.';
                    btn.disabled = false;
                }
            });
        });
    };

    renderConteudoPoliticas();

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnFechar.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    btnCriar.addEventListener('click', async () => {
        const nome = inputNome.value.trim();
        const chave = inputChave.value.trim().toLowerCase();
        const descricao = inputDesc.value.trim();
        msgErro.textContent = '';

        if (!nome || nome.length < 2) {
            msgErro.textContent = 'Informe o nome da política (mín. 2 caracteres).';
            inputNome.focus();
            return;
        }

        if (!chave || !/^[a-z0-9_.-]{2,64}$/.test(chave)) {
            msgErro.textContent = 'Informe uma chave válida (apenas letras, números, "_", "." ou "-").';
            inputChave.focus();
            return;
        }

        btnCriar.disabled = true;

        try {
            if (politicaEmEdicaoId) {
                await apiFetch(`/rbac/politicas/${politicaEmEdicaoId}`, {
                    method: 'PUT',
                    body: JSON.stringify({ nome, chave, descricao })
                });
                mostrarToast(`Política "${nome}" atualizada!`);
            } else {
                await apiFetch('/rbac/politicas', {
                    method: 'POST',
                    body: JSON.stringify({ nome, chave, descricao })
                });
                mostrarToast(`Política "${nome}" criada com sucesso!`);
            }

            resetarFormPolitica();
            await carregarMeuPerfil();
            await carregarDadosRBAC();
            renderConteudoPoliticas();
        } catch (e) {
            console.error('Erro ao salvar política:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro ao salvar política de acesso.';
        } finally {
            btnCriar.disabled = false;
        }
    });
};

// --- 4. GERENCIAMENTO DE USUÁRIOS DO ESCRITÓRIO ---

const renderizarResumoGrupoSelect = (grupoId, containerEl) => {
    if (!containerEl) return;
    const grupo = gruposCache.find(g => String(g.id) === String(grupoId));
    if (!grupo) {
        containerEl.innerHTML = '';
        return;
    }

    const politicasTags = (grupo.politicas && grupo.politicas.length > 0)
        ? grupo.politicas.map(p => `<span class="politica-tag-mini">${escapeHtml(p.nome)}</span>`).join('')
        : '<span style="font-size: 0.75rem; color: var(--text-muted);">Sem políticas associadas</span>';

    containerEl.innerHTML = `
        <div class="grupo-select-preview ${grupo.is_admin_group ? 'is-admin' : ''}">
            <div class="grupo-select-preview-top">
                <strong>
                    <i class="fa-solid ${grupo.is_admin_group ? 'fa-shield-halved' : 'fa-user-tag'}"></i>
                    ${escapeHtml(grupo.nome)}
                </strong>
                <span>${grupo.is_admin_group ? 'Acesso Administrativo' : 'Acesso Operacional'}</span>
            </div>
            <p>${escapeHtml(grupo.descricao || 'Grupo de permissões do sistema.')}</p>
            <div class="grupo-select-preview-tags">${politicasTags}</div>
        </div>
    `;
};

const renderizarListaUsuarios = () => {
    const container = document.getElementById('usuariosListContainer');
    const searchInput = document.getElementById('searchUsuariosInput');
    const usuariosTotalLabel = document.getElementById('usuariosTotalLabel');
    const badgeCountUsuarios = document.getElementById('badgeCountUsuarios');
    if (!container) return;

    if (badgeCountUsuarios) badgeCountUsuarios.textContent = usuariosCache.length;

    const termo = normalizeText(searchInput?.value || '');
    const filtrados = usuariosCache.filter(u => {
        if (!termo) return true;
        return (
            normalizeText(u.name).includes(termo) ||
            normalizeText(u.user).includes(termo) ||
            normalizeText(u.grupo_nome).includes(termo)
        );
    });

    if (usuariosTotalLabel) {
        usuariosTotalLabel.textContent = `${filtrados.length} ${filtrados.length === 1 ? 'usuário' : 'usuários'}`;
    }

    if (filtrados.length === 0) {
        container.innerHTML = `<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum usuário encontrado${termo ? ` para "${escapeHtml(searchInput.value)}"` : ''}.</span>`;
        return;
    }

    container.innerHTML = filtrados.map(u => {
        const badgeStatus = u.is_active
            ? '<span class="status-badge-active">Ativo</span>'
            : '<span class="status-badge-inactive">Inativo</span>';

        const nomeGrupo = u.grupo_nome || (u.is_admin ? 'Administrador' : 'Operacional');
        const badgeGrupo = `
            <span class="status-badge-grupo ${u.is_admin ? 'admin' : ''}" title="Grupo de Permissões">
                <i class="fa-solid ${u.is_admin ? 'fa-shield-halved' : 'fa-user-tag'}"></i>
                ${escapeHtml(nomeGrupo)}
            </span>
        `;

        const badgeVoce = u.is_current
            ? '<span class="status-badge-you">Você</span>'
            : '';

        const acoes = u.is_current
            ? `<span class="current-session-pill"><i class="fa-solid fa-circle-dot"></i> Sessão Atual</span>`
            : `
                <button type="button" class="btn-sm-action" data-action="edit-user-grupo" data-id="${u.id}" title="Alterar grupo de permissões">
                    <i class="fa-solid fa-user-shield"></i> Grupo
                </button>
                <button type="button" class="btn-sm-action" data-action="toggle-status" data-id="${u.id}" data-active="${u.is_active}" title="${u.is_active ? 'Desativar acesso' : 'Reativar acesso'}">
                    <i class="fa-solid ${u.is_active ? 'fa-user-slash' : 'fa-user-check'}"></i> ${u.is_active ? 'Desativar' : 'Ativar'}
                </button>
                <button type="button" class="btn-sm-action danger" data-action="delete-user" data-id="${u.id}" data-name="${escapeHtml(u.name)}" title="Excluir usuário">
                    <i class="fa-solid fa-trash"></i>
                </button>
            `;

        return `
            <div class="user-item">
                <div class="user-item-info">
                    <div class="user-item-avatar"><i class="fa-solid fa-circle-user"></i></div>
                    <div class="user-item-details">
                        <h4>${escapeHtml(u.name)} ${badgeGrupo} ${badgeVoce}</h4>
                        <span class="user-login-sub">@${escapeHtml(u.user)} &bull; ${badgeStatus}</span>
                    </div>
                </div>
                <div class="user-item-actions">
                    ${acoes}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('[data-action="edit-user-grupo"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const alvo = usuariosCache.find(u => String(u.id) === String(btn.dataset.id));
            if (alvo) abrirModalEditarGrupoUsuario(alvo);
        });
    });

    container.querySelectorAll('[data-action="toggle-status"]').forEach(btn => {
        btn.addEventListener('click', () => {
            const id = btn.dataset.id;
            const currentlyActive = btn.dataset.active === 'true';
            toggleStatusUsuario(id, !currentlyActive);
        });
    });

    container.querySelectorAll('[data-action="delete-user"]').forEach(btn => {
        btn.addEventListener('click', () => {
            confirmarExclusaoUsuario(btn.dataset.id, btn.dataset.name);
        });
    });
};

const carregarUsuariosConfig = async () => {
    const container = document.getElementById('usuariosListContainer');
    const btnNovoUsuario = document.getElementById('btnNovoUsuario');
    if (!container) return;

    if (!isUsuarioAdmin()) {
        if (btnNovoUsuario) btnNovoUsuario.style.display = 'none';
        container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Apenas administradores podem gerenciar usuários, grupos e políticas do escritório.</span>';
        return;
    }

    try {
        const users = await apiFetch('/users');
        usuariosCache = Array.isArray(users) ? users : [];
        renderizarListaUsuarios();
    } catch (e) {
        if (e.status === 403) {
            if (btnNovoUsuario) btnNovoUsuario.style.display = 'none';
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Apenas administradores podem gerenciar usuários do escritório.</span>';
            return;
        }
        console.error('Erro ao listar usuários:', e);
    }
};

const abrirModalEditarGrupoUsuario = async (usuarioAlvo) => {
    if (!isUsuarioAdmin()) return;

    if (gruposCache.length === 0) {
        await carregarDadosRBAC();
    }

    const modalAntigo = document.getElementById('modalEditarGrupoUsuario');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalEditarGrupoUsuario';

    const opcoesHtml = gruposCache.map(g => `
        <option value="${g.id}" ${Number(usuarioAlvo.grupo_id) === Number(g.id) ? 'selected' : ''}>
            ${escapeHtml(g.nome)}
        </option>
    `).join('');

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-user-shield modal-confirm-icon"></i>
            <h3>Alterar Grupo do Usuário</h3>
            <p>Selecione o grupo de permissões para <strong style="color: var(--brand-gold);">${escapeHtml(usuarioAlvo.name)}</strong> (@${escapeHtml(usuarioAlvo.user)}).</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="selectEditarGrupoUsuario">Grupo de Permissões</label>
                <select id="selectEditarGrupoUsuario" class="modal-select-grupo">
                    ${opcoesHtml}
                </select>
                <div id="previewGrupoEdicaoUsuario"></div>
            </div>

            <p id="msgErroEditarGrupoUser" style="color: var(--danger); font-size: 0.84rem; margin-top: 8px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelEditGrupoUser">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSaveEditGrupoUser">Salvar Grupo</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const selectGrupo = document.getElementById('selectEditarGrupoUsuario');
    const previewEl = document.getElementById('previewGrupoEdicaoUsuario');
    const msgErro = document.getElementById('msgErroEditarGrupoUser');
    const btnCancel = document.getElementById('btnCancelEditGrupoUser');
    const btnSave = document.getElementById('btnSaveEditGrupoUser');

    renderizarResumoGrupoSelect(selectGrupo.value, previewEl);
    selectGrupo.addEventListener('change', () => {
        renderizarResumoGrupoSelect(selectGrupo.value, previewEl);
    });

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    btnSave.addEventListener('click', async () => {
        const grupo_id = Number(selectGrupo.value);
        msgErro.textContent = '';

        if (!grupo_id) {
            msgErro.textContent = 'Selecione um grupo válido.';
            return;
        }

        btnSave.disabled = true;

        try {
            const resp = await apiFetch(`/users/${usuarioAlvo.id}/grupo`, {
                method: 'PATCH',
                body: JSON.stringify({ grupo_id })
            });

            fechar();
            mostrarToast(resp.mensagem || 'Grupo do usuário atualizado!');
            await carregarDadosRBAC();
            await carregarUsuariosConfig();
        } catch (e) {
            console.error('Erro ao atualizar grupo do usuário:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro ao atualizar grupo do usuário.';
            btnSave.disabled = false;
        }
    });
};

const toggleStatusUsuario = async (id, novoStatus) => {
    try {
        const resp = await apiFetch(`/users/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: Boolean(novoStatus) })
        });
        mostrarToast(resp.mensagem || `Usuário ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`);
        await carregarUsuariosConfig();
    } catch (e) {
        console.error('Erro ao alternar status do usuário:', e);
        mostrarToast(e.data?.mensagem || 'Erro ao alterar status do usuário.', 'error');
    }
};

const confirmarExclusaoUsuario = (id, nome) => {
    const modalAntigo = document.getElementById('modalConfirmDeleteUser');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalConfirmDeleteUser';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-user-xmark modal-confirm-icon danger"></i>
            <h3>Excluir Usuário</h3>
            <p>Deseja realmente apagar o usuário <strong style="color: var(--brand-gold);">${escapeHtml(nome)}</strong> do sistema?</p>
            <p id="msgErroDeleteUser" style="color: var(--danger); font-size: 0.85rem; margin-top: -16px; margin-bottom: 20px; min-height: 18px;"></p>
            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelDeleteUser">Cancelar</button>
                <button type="button" class="btn-confirm-delete-act" id="btnConfirmDeleteUser">Excluir Agora</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    const btnCancel = document.getElementById('btnCancelDeleteUser');
    const btnConfirm = document.getElementById('btnConfirmDeleteUser');
    const msgErro = document.getElementById('msgErroDeleteUser');

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    btnConfirm.addEventListener('click', async () => {
        btnConfirm.disabled = true;
        msgErro.textContent = '';

        try {
            await apiFetch(`/users/${id}`, {
                method: 'DELETE'
            });

            fechar();
            mostrarToast(`Usuário "${nome}" excluído com sucesso!`);
            await carregarDadosRBAC();
            await carregarUsuariosConfig();
        } catch (e) {
            console.error('Erro ao excluir usuário:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnConfirm.disabled = false;
        }
    });
};

const abrirModalNovoUsuario = async () => {
    if (!isUsuarioAdmin()) {
        return;
    }

    if (gruposCache.length === 0) {
        await carregarDadosRBAC();
    }

    const modalAntigo = document.getElementById('modalNovoUsuario');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalNovoUsuario';

    const grupoPadrao = gruposCache.find(g => String(g.nome).toLowerCase() === 'operacional') || gruposCache[0];
    const opcoesGrupoHtml = gruposCache.map(g => `
        <option value="${g.id}" ${grupoPadrao && Number(g.id) === Number(grupoPadrao.id) ? 'selected' : ''}>
            ${escapeHtml(g.nome)}
        </option>
    `).join('');

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-user-plus modal-confirm-icon"></i>
            <h3>Novo Usuário do Escritório</h3>
            <p>Cadastre um novo membro da equipe e selecione seu grupo de permissões.</p>

            <div class="modal-form-left">
                <label class="modal-field-label" for="inputNovoNomeUsuario">Nome Completo</label>
                <input type="text" id="inputNovoNomeUsuario" class="modal-input-novo-tipo" placeholder="Ex: Dra. Mariana" maxlength="64" style="margin-bottom: 10px;" autofocus>

                <label class="modal-field-label" for="inputNovoUserLogin">Usuário de Acesso</label>
                <input type="text" id="inputNovoUserLogin" class="modal-input-novo-tipo" placeholder="Ex: mariana" maxlength="64" style="margin-bottom: 10px;">

                <label class="modal-field-label" for="inputNovaSenhaUsuario">Senha Inicial</label>
                <input type="password" id="inputNovaSenhaUsuario" class="modal-input-novo-tipo" placeholder="Mínimo 8 caracteres" maxlength="72" style="margin-bottom: 12px;">

                <label class="modal-field-label" for="selectGrupoNovoUsuario">Grupo de Permissões</label>
                <select id="selectGrupoNovoUsuario" class="modal-select-grupo">
                    ${opcoesGrupoHtml}
                </select>
                <div id="previewGrupoNovoUsuario"></div>
            </div>

            <p id="msgErroNovoUser" style="color: var(--danger); font-size: 0.84rem; margin-top: 8px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelNovoUser">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSaveNovoUser">Cadastrar Usuário</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const inputNome = document.getElementById('inputNovoNomeUsuario');
    const inputLogin = document.getElementById('inputNovoUserLogin');
    const inputSenha = document.getElementById('inputNovaSenhaUsuario');
    const selectGrupo = document.getElementById('selectGrupoNovoUsuario');
    const previewGrupoEl = document.getElementById('previewGrupoNovoUsuario');
    const msgErro = document.getElementById('msgErroNovoUser');
    const btnSave = document.getElementById('btnSaveNovoUser');
    const btnCancel = document.getElementById('btnCancelNovoUser');

    if (selectGrupo) {
        renderizarResumoGrupoSelect(selectGrupo.value, previewGrupoEl);
        selectGrupo.addEventListener('change', () => {
            renderizarResumoGrupoSelect(selectGrupo.value, previewGrupoEl);
        });
    }

    const fechar = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    btnCancel.addEventListener('click', fechar);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) fechar();
    });

    const salvar = async () => {
        const name = inputNome.value.trim();
        const user = inputLogin.value.trim().toLowerCase();
        const password = inputSenha.value;
        const grupo_id = Number(selectGrupo?.value);
        msgErro.textContent = '';

        if (!name || name.length < 2) {
            msgErro.textContent = 'Informe o nome completo do membro.';
            inputNome.focus();
            return;
        }

        if (!user || user.length < 3) {
            msgErro.textContent = 'O usuário para login deve ter pelo menos 3 caracteres.';
            inputLogin.focus();
            return;
        }

        if (!password || password.length < 8 || password.length > 72) {
            msgErro.textContent = 'A senha inicial deve ter entre 8 e 72 caracteres.';
            inputSenha.focus();
            return;
        }

        if (!grupo_id || isNaN(grupo_id)) {
            msgErro.textContent = 'Selecione um grupo de permissões para o usuário.';
            selectGrupo?.focus();
            return;
        }

        btnSave.disabled = true;

        try {
            await apiFetch('/users', {
                method: 'POST',
                body: JSON.stringify({ name, user, password, grupo_id })
            });

            fechar();
            mostrarToast(`Usuário "${name}" cadastrado com sucesso!`);
            await carregarDadosRBAC();
            await carregarUsuariosConfig();
        } catch (e) {
            console.error('Erro ao cadastrar usuário:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnSave.disabled = false;
        }
    };

    btnSave.addEventListener('click', salvar);
};

// --- APARÊNCIA E SELETOR DE TEMA ---

const LABELS_TEMA = {
    light: 'Modo Claro',
    dark: 'Modo Escuro',
    system: 'Conforme o Sistema'
};

const atualizarUIThemeSelector = () => {
    const preferencia = getSavedTheme();
    const resolvido = resolveTheme(preferencia);

    document.querySelectorAll('.theme-option-card[data-theme-option]').forEach(btn => {
        const ativo = btn.dataset.themeOption === preferencia;
        btn.classList.toggle('active', ativo);
        btn.setAttribute('aria-checked', ativo ? 'true' : 'false');
    });

    const statusLabel = document.getElementById('themeStatusLabel');
    if (statusLabel) {
        const nomeResolvido = resolvido === 'dark' ? 'Escuro' : 'Claro';
        statusLabel.textContent = preferencia === 'system'
            ? `Sistema (${nomeResolvido})`
            : LABELS_TEMA[preferencia] || nomeResolvido;
    }
};

const inicializarSeletorTema = () => {
    atualizarUIThemeSelector();

    document.querySelectorAll('.theme-option-card[data-theme-option]').forEach(btn => {
        btn.addEventListener('click', () => {
            const opcao = btn.dataset.themeOption;
            if (!opcao || opcao === getSavedTheme()) return;

            const { preference, resolved } = applyTheme(opcao, { persist: true });
            atualizarUIThemeSelector();

            const nomeResolvido = resolved === 'dark' ? 'Escuro' : 'Claro';
            const msg = preference === 'system'
                ? `Tema definido para Conforme o Sistema (${nomeResolvido}).`
                : `Tema alterado para ${LABELS_TEMA[preference]}.`;
            mostrarToast(msg, 'info');
        });
    });

    window.addEventListener('advdocs:theme-change', atualizarUIThemeSelector);
};

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', async () => {
    inicializarSeletorTema();
    document.getElementById('logoutButton').addEventListener('click', sair);
    const token = localStorage.getItem('token');

    if (!token) {
        sair();
        return;
    }

    initNotificationsWidget({ onToast: mostrarToast });

    // Carrega perfil primeiro para determinar permissões RBAC
    await carregarMeuPerfil();

    // Restaura aba da URL hash caso exista e o usuário tenha permissão
    const painelInicial = MAPA_HASH_PAINEL[window.location.hash];
    if (painelInicial) {
        alternarPainel(painelInicial, false);
    }

    carregarTiposConfig();

    if (isUsuarioAdmin()) {
        await carregarDadosRBAC();
    }
    await carregarUsuariosConfig();

    // Navegação da Barra Lateral (Sidebar)
    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.dataset.target) {
                alternarPainel(btn.dataset.target);
            }
        });
    });

    // Filtro de busca de usuários em tempo real
    document.getElementById('searchUsuariosInput')?.addEventListener('input', () => {
        renderizarListaUsuarios();
    });

    // Ações do perfil
    document.getElementById('btnEditarNome')?.addEventListener('click', abrirModalEditarNome);
    document.getElementById('btnAbrirModalSenha')?.addEventListener('click', abrirModalAlterarSenha);

    // Adicionar tipo
    document.getElementById('btnNovoTipoConfig')?.addEventListener('click', () => {
        abrirModalNovoTipo((novoNome) => {
            mostrarToast(`Categoria "${novoNome}" cadastrada com sucesso!`);
            carregarTiposConfig();
        });
    });

    // Ações RBAC e Usuários (restritas a Administradores)
    document.getElementById('btnNovoGrupo')?.addEventListener('click', () => abrirModalGrupo(null));
    document.getElementById('btnGerenciarPoliticas')?.addEventListener('click', abrirModalGerenciarPoliticas);
    document.getElementById('btnNovoUsuario')?.addEventListener('click', abrirModalNovoUsuario);
});
