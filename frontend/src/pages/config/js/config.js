import { abrirModalNovoTipo } from '../../../utils/tiposService.js';
import { escapeHtml, apiFetch } from '../../../utils/utils.js';

let usuarioLogado = null;

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '../auth';
};

// --- 1. MEU PERFIL E ALTERAÇÃO DE SENHA / NOME ---

const carregarMeuPerfil = async () => {
    try {
        usuarioLogado = await apiFetch('/users/me');
        const userNameEl = document.getElementById('user-name');
        const userLoginEl = document.getElementById('user-login');

        if (userNameEl) userNameEl.textContent = usuarioLogado.name;
        if (userLoginEl) userLoginEl.textContent = `@${usuarioLogado.user}`;
    } catch (e) {
        console.error('Erro ao carregar dados do perfil:', e);
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
            await carregarUsuariosConfig();
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

// --- 3. GERENCIAMENTO DE USUÁRIOS DO ESCRITÓRIO ---

const carregarUsuariosConfig = async () => {
    const container = document.getElementById('usuariosListContainer');
    const btnNovoUsuario = document.getElementById('btnNovoUsuario');
    if (!container) return;

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

            const badgeVoce = u.is_current
                ? '<span class="status-badge-you">Você</span>'
                : '';

            const acoes = u.is_current
                ? `<span style="font-size: 0.75rem; color: var(--text-muted); font-style: italic;">Logado agora</span>`
                : `
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
                            <h4>${escapeHtml(u.name)} ${badgeVoce}</h4>
                            <span class="user-login-sub">@${escapeHtml(u.user)} &bull; ${badgeStatus}</span>
                        </div>
                    </div>
                    <div class="user-item-actions">
                        ${acoes}
                    </div>
                </div>
            `;
        }).join('');

        // Eventos dos botões de ação
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
            await carregarUsuariosConfig();
        } catch (e) {
            console.error('Erro ao excluir usuário:', e);
            msgErro.textContent = e.data?.mensagem || 'Erro de conexão com o servidor.';
            btnConfirm.disabled = false;
        }
    });
};

const abrirModalNovoUsuario = () => {
    const modalAntigo = document.getElementById('modalNovoUsuario');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalNovoUsuario';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-user-plus modal-confirm-icon"></i>
            <h3>Novo Usuário do Escritório</h3>
            <p>Cadastre um novo membro da equipe com acesso ao sistema.</p>

            <input type="text" id="inputNovoNomeUsuario" class="modal-input-novo-tipo" placeholder="Nome Completo (ex: Dra. Mariana)" maxlength="64" style="margin-bottom: 10px;" autofocus>
            <input type="text" id="inputNovoUserLogin" class="modal-input-novo-tipo" placeholder="Usuário para login (ex: mariana)" maxlength="64" style="margin-bottom: 10px;">
            <input type="password" id="inputNovaSenhaUsuario" class="modal-input-novo-tipo" placeholder="Senha Inicial (mín. 8 caracteres)" maxlength="72">
            
            <p id="msgErroNovoUser" style="color: var(--danger); font-size: 0.84rem; margin-top: -12px; margin-bottom: 16px; min-height: 18px;"></p>

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
    const msgErro = document.getElementById('msgErroNovoUser');
    const btnSave = document.getElementById('btnSaveNovoUser');
    const btnCancel = document.getElementById('btnCancelNovoUser');

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

        btnSave.disabled = true;

        try {
            await apiFetch('/users', {
                method: 'POST',
                body: JSON.stringify({ name, user, password })
            });

            fechar();
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

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutButton').addEventListener('click', sair);
    const token = localStorage.getItem('token');

    if (!token) {
        sair();
        return;
    }

    // Carrega dados da tela
    carregarMeuPerfil();
    carregarTiposConfig();
    carregarUsuariosConfig();

    // Ações do perfil
    document.getElementById('btnEditarNome')?.addEventListener('click', abrirModalEditarNome);
    document.getElementById('btnAbrirModalSenha')?.addEventListener('click', abrirModalAlterarSenha);

    // Adicionar tipo e novo usuário
    document.getElementById('btnNovoTipoConfig')?.addEventListener('click', () => {
        abrirModalNovoTipo(() => {
            carregarTiposConfig();
        });
    });

    document.getElementById('btnNovoUsuario')?.addEventListener('click', abrirModalNovoUsuario);
});
