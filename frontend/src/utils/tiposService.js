import { escapeHtml } from './utils.js';

const API_URL = window.location.origin;

/**
 * Carrega a lista de tipos de processos da API e preenche um elemento <select>.
 */
export const carregarTiposSelect = async (selectElement, valorSelecionado = null) => {
    if (!selectElement) return [];
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        const response = await fetch(`${API_URL}/clientes/tipos`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            }
        });

        if (!response.ok) {
            console.error('Erro ao carregar tipos de processo:', response.status);
            return [];
        }

        const tipos = await response.json();

        selectElement.innerHTML = `
            <option value="" disabled ${!valorSelecionado ? 'selected' : ''} hidden>Selecione o tipo...</option>
            ${tipos.map(t => `
                <option value="${escapeHtml(t.nome)}" ${valorSelecionado === t.nome ? 'selected' : ''}>
                    ${escapeHtml(t.nome)}
                </option>
            `).join('')}
        `;

        if (valorSelecionado) {
            selectElement.value = valorSelecionado;
        }

        return tipos;
    } catch (error) {
        console.error('Erro ao buscar tipos de processo:', error);
        return [];
    }
};

/**
 * Abre um modal moderno para cadastrar um novo tipo de processo em tempo real.
 */
export const abrirModalNovoTipo = (onSuccess) => {
    const modalAntigo = document.getElementById('modalNovoTipo');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'modalNovoTipo';

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-tags modal-confirm-icon"></i>
            <h3>Novo Tipo de Processo</h3>
            <p>Cadastre uma nova categoria de processo para organizar as pastas do escritório.</p>
            
            <input type="text" id="inputNomeTipo" class="modal-input-novo-tipo" placeholder="Ex: Tributário, Ambiental, etc." maxlength="64" autofocus>
            <p id="msgErroTipo" style="color: var(--danger); font-size: 0.82rem; margin-top: -12px; margin-bottom: 16px; min-height: 18px;"></p>

            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="btnCancelarNovoTipo">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="btnSalvarNovoTipo">Cadastrar Tipo</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const input = document.getElementById('inputNomeTipo');
    const msgErro = document.getElementById('msgErroTipo');
    const btnSalvar = document.getElementById('btnSalvarNovoTipo');
    const btnCancelar = document.getElementById('btnCancelarNovoTipo');

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

        const token = localStorage.getItem('token');
        btnSalvar.disabled = true;

        try {
            const resp = await fetch(`${API_URL}/clientes/tipos`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token
                },
                body: JSON.stringify({ nome })
            });

            const data = await resp.json();

            if (resp.ok) {
                fechar();
                if (typeof onSuccess === 'function') {
                    onSuccess(data.nome);
                }
            } else {
                msgErro.textContent = data.mensagem || 'Erro ao cadastrar tipo.';
                btnSalvar.disabled = false;
            }
        } catch (err) {
            console.error('Erro ao criar tipo de processo:', err);
            msgErro.textContent = 'Erro de conexão com o servidor.';
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

    setTimeout(() => input.focus(), 100);
};
