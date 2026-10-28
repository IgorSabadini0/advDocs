import { escapeHtml, apiFetch } from './utils.js';

/**
 * Carrega a lista de tipos de processos da API e preenche um elemento <select>.
 */
export const carregarTiposSelect = async (selectElement, valorSelecionado = null) => {
    if (!selectElement) return [];
    const token = localStorage.getItem('token');
    if (!token) return [];

    try {
        const tipos = await apiFetch('/clientes/tipos');

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

        btnSalvar.disabled = true;

        try {
            const data = await apiFetch('/clientes/tipos', {
                method: 'POST',
                body: JSON.stringify({ nome })
            });

            fechar();
            if (typeof onSuccess === 'function') {
                onSuccess(data.nome);
            }
        } catch (err) {
            console.error('Erro ao criar tipo de processo:', err);
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

    setTimeout(() => input.focus(), 100);
};
