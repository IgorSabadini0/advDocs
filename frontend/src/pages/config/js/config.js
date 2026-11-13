import { abrirModalNovoTipo } from '../../../utils/tiposService.js';
import { escapeHtml, apiFetch } from '../../../utils/utils.js';

let usuarioLogado = null;
let gruposCache = [];
let politicasCache = [];

const isUsuarioAdmin = () => Boolean(usuarioLogado && (usuarioLogado.is_admin || usuarioLogado.role === 'admin'));

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '../auth';
};

const alternarPainel = (targetId) => {
    const adminOnlyPanels = ['panel-rbac', 'panel-usuarios'];
    if (adminOnlyPanels.includes(targetId) && !isUsuarioAdmin()) {
        return;
    }

    document.querySelectorAll('.sidebar-nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === targetId);
    });

    document.querySelectorAll('.settings-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === targetId);
    });
};

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

        if (minhasPoliticasContainer) {
            const politicas = Array.isArray(usuarioLogado.politicas) ? usuarioLogado.politicas : [];
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

            <input type="text" id="inputNovoNome" class="modal-input-novo-tipo" value="${escapeHtml(usuarioLogado?.name || '')}" placeholder="Seu nome completo" maxlength="64" autofocus>
            <p id="msgErroNome" style="color: var(--danger); font-size: 0.84rem; margin-top: -12px; margin-bottom: 16px; min-height: 18px;"></p>

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
            <p>Informe sua senha atual e escolha uma nova senha de acesso.</p>

            <input type="password" id="inputSenhaAtual" class="modal-input-novo-tipo" placeholder="Senha Atual" maxlength="72" style="margin-bottom: 10px;" autofocus>
            <input type="password" id="inputNovaSenha" class="modal-input-novo-tipo" placeholder="Nova Senha (mín. 8 caracteres)" maxlength="72" style="margin-bottom: 10px;">
            <input type="password" id="inputConfirmarSenha" class="modal-input-novo-tipo" placeholder="Confirmar Nova Senha" maxlength="72">
            
            <p id="msgErroSenha" style="color: var(--danger); font-size: 0.84rem; margin-top: -12px; margin-bottom: 16px; min-height: 18px;"></p>

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

            overlay.querySelector('.modal-confirm-content').innerHTML = `
                <i class="fa-solid fa-circle-check modal-confirm-icon" style="color: var(--success);"></i>
                <h3>Senha Alterada!</h3>
                <p>Sua senha de acesso foi atualizada com sucesso.</p>
                <div class="confirm-buttons-group">
                    <button type="button" class="btn-confirm-edit-act" id="btnOkSenha">Concluir</button>
                </div>
            `;
            document.getElementById('btnOkSenha')?.addEventListener('click', fechar);
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
    if (!container) return;

    try {
        const tipos = await apiFetch('/clientes/tipos');

        if (tipos.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum tipo cadastrado.</span>';
            return;
        }

        container.innerHTML = tipos.map(t => `
            <span class="tipo-badge">
                <span>${escapeHtml(t.nome)}</span>
                <button type="button" class="btn-delete-tipo" data-id="${t.id}" data-nome="${escapeHtml(t.nome)}" title="Remover tipo ${escapeHtml(t.nome)}">
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

        renderizarGruposRBAC();
    } catch (e) {
        console.error('Erro ao carregar dados RBAC:', e);
        container.innerHTML = '<span style="color: var(--danger); font-size: 0.85rem;">Erro ao carregar grupos e políticas de acesso.</span>';
    }
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
            : '<span class="status-badge-padrao"><i class="fa-solid fa-layer-group"></i> Grupo</span>';

        const politicasHtml = (g.politicas && g.politicas.length > 0)
            ? g.politicas.map(p => `
                <span class="politica-tag" title="${escapeHtml(p.descricao || p.nome)}">
                    <i class="fa-solid fa-check"></i> ${escapeHtml(p.nome)}
                    <code>${escapeHtml(p.chave)}</code>
                </span>
            `).join('')
            : '<span class="sem-politicas-msg">Nenhuma política vinculada</span>';

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
                                <i class="fa-solid fa-users"></i> ${g.total_usuarios}
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
            <p>Defina os dados do grupo e selecione as políticas de acesso vinculadas a ele.</p>

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
                    <label class="modal-field-label">Políticas Vinculadas ao Grupo</label>
                    <span class="modal-field-hint">Relação N:N</span>
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

    overlay.querySelectorAll('.politica-check-item input[type="checkbox"]').forEach(chk => {
        chk.addEventListener('change', () => {
            chk.closest('.politica-check-item')?.classList.toggle('checked', chk.checked);
        });
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
            } else {
                await apiFetch('/rbac/grupos', {
                    method: 'POST',
                    body: JSON.stringify({ nome, descricao, politicaIds })
                });
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

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalGerenciarPoliticas';

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
                    ${isEssencial
                        ? '<span class="politica-protected-tag" title="Política base do sistema"><i class="fa-solid fa-lock"></i> Sistema</span>'
                        : `<button type="button" class="btn-sm-action danger" data-action="del-politica" data-id="${p.id}" data-nome="${escapeHtml(p.nome)}" title="Excluir política">
                            <i class="fa-solid fa-trash"></i>
                           </button>`
                    }
                </div>
            `;
        }).join('');

        listaEl.querySelectorAll('[data-action="del-politica"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                const polId = btn.dataset.id;
                const msgErro = document.getElementById('msgErroPoliticaModal');
                btn.disabled = true;
                if (msgErro) msgErro.textContent = '';

                try {
                    await apiFetch(`/rbac/politicas/${polId}`, {
                        method: 'DELETE'
                    });
                    await carregarDadosRBAC();
                    renderConteudoPoliticas();
                } catch (e) {
                    if (msgErro) msgErro.textContent = e.data?.mensagem || 'Erro ao excluir política.';
                    btn.disabled = false;
                }
            });
        });
    };

    overlay.innerHTML = `
        <div class="modal-confirm-content modal-lg-rbac">
            <i class="fa-solid fa-key modal-confirm-icon"></i>
            <h3>Políticas de Permissão</h3>
            <p>Cadastre novas políticas de acesso para vincular aos grupos do escritório.</p>

            <div class="nova-politica-box">
                <div class="nova-politica-grid">
                    <div>
                        <label class="modal-field-label" for="inputNomePolitica">Nome da Política</label>
                        <input type="text" id="inputNomePolitica" class="modal-input-novo-tipo" placeholder="Ex: Exportar Relatórios" maxlength="64" style="margin-bottom: 8px;">
                    </div>
                    <div>
                        <label class="modal-field-label" for="inputChavePolitica">Chave Técnica (identificador)</label>
                        <input type="text" id="inputChavePolitica" class="modal-input-novo-tipo" placeholder="Ex: export_reports" maxlength="64" style="margin-bottom: 8px;">
                    </div>
                </div>
                <label class="modal-field-label" for="inputDescPolitica">Descrição da Permissão</label>
                <div class="nova-politica-row">
                    <input type="text" id="inputDescPolitica" class="modal-input-novo-tipo" placeholder="Ex: Permite gerar e baixar relatórios em PDF/CSV" maxlength="255" style="margin-bottom: 0;">
                    <button type="button" class="btn-confirm-edit-act" id="btnCriarPoliticaModal">
                        <i class="fa-solid fa-plus"></i> Adicionar
                    </button>
                </div>
            </div>

            <p id="msgErroPoliticaModal" style="color: var(--danger); font-size: 0.84rem; margin-top: 8px; margin-bottom: 10px; min-height: 18px;"></p>

            <div class="modal-form-left">
                <label class="modal-field-label">Políticas Cadastradas</label>
                <div class="politicas-manage-list" id="listaPoliticasModal"></div>
            </div>

            <div class="confirm-buttons-group" style="margin-top: 18px;">
                <button type="button" class="btn-cancel-modal" id="btnFecharPoliticasModal">Fechar</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
    renderConteudoPoliticas();

    const inputNome = document.getElementById('inputNomePolitica');
    const inputChave = document.getElementById('inputChavePolitica');
    const inputDesc = document.getElementById('inputDescPolitica');
    const msgErro = document.getElementById('msgErroPoliticaModal');
    const btnCriar = document.getElementById('btnCriarPoliticaModal');
    const btnFechar = document.getElementById('btnFecharPoliticasModal');

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
            await apiFetch('/rbac/politicas', {
                method: 'POST',
                body: JSON.stringify({ nome, chave, descricao })
            });

            inputNome.value = '';
            inputChave.value = '';
            inputDesc.value = '';

            await carregarDadosRBAC();
            renderConteudoPoliticas();
        } catch (e) {
            console.error('Erro ao criar política:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro ao criar política de acesso.';
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
                <span>${grupo.is_admin_group ? 'Acesso Administrativo' : 'Acesso Padrão'}</span>
            </div>
            <p>${escapeHtml(grupo.descricao || 'Grupo de permissões do sistema.')}</p>
            <div class="grupo-select-preview-tags">${politicasTags}</div>
        </div>
    `;
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

        if (users.length === 0) {
            container.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">Nenhum usuário cadastrado.</span>';
            return;
        }

        container.innerHTML = users.map(u => {
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
                ? `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Logado agora</span>`
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
                const alvo = users.find(u => String(u.id) === String(btn.dataset.id));
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
            await apiFetch(`/users/${usuarioAlvo.id}/grupo`, {
                method: 'PATCH',
                body: JSON.stringify({ grupo_id })
            });

            fechar();
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
        await apiFetch(`/users/${id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ is_active: Boolean(novoStatus) })
        });
        await carregarUsuariosConfig();
    } catch (e) {
        console.error('Erro ao alternar status do usuário:', e);
        alert(e.data?.mensagem || 'Erro ao alterar status do usuário.');
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

// --- INICIALIZAÇÃO ---

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('logoutButton').addEventListener('click', sair);
    const token = localStorage.getItem('token');

    if (!token) {
        sair();
        return;
    }

    // Carrega perfil primeiro para determinar permissões RBAC
    await carregarMeuPerfil();
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

    // Ações do perfil
    document.getElementById('btnEditarNome')?.addEventListener('click', abrirModalEditarNome);
    document.getElementById('btnAbrirModalSenha')?.addEventListener('click', abrirModalAlterarSenha);

    // Adicionar tipo
    document.getElementById('btnNovoTipoConfig')?.addEventListener('click', () => {
        abrirModalNovoTipo(() => {
            carregarTiposConfig();
        });
    });

    // Ações RBAC e Usuários (restritas a Administradores)
    document.getElementById('btnNovoGrupo')?.addEventListener('click', () => abrirModalGrupo(null));
    document.getElementById('btnGerenciarPoliticas')?.addEventListener('click', abrirModalGerenciarPoliticas);
    document.getElementById('btnNovoUsuario')?.addEventListener('click', abrirModalNovoUsuario);
});
