import { mascaraProcessoCNJ, apiFetch } from '../../../utils/utils.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';

let idEdicao = null;

// Aguarda o DOM carregar para selecionar o elemento
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../auth';
        return;
    }

    const inputProcesso = document.getElementById('numeroProc');
    const selectTipo = document.getElementById('tipo');

    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            e.target.value = mascaraProcessoCNJ(e.target.value);
        });
    }

    document.getElementById('saveButton').addEventListener('click', salvarEdicao);

    // Pega os dados salvos no sessionStorage e preenche os campos do formulário
    const dadosItem = sessionStorage.getItem("itemEmEdicao");
    if (!dadosItem) {
        document.getElementById('response').textContent = "Nenhuma pasta selecionada para edição.";
        window.location.href = "../main";
        return;
    }

    const item = JSON.parse(dadosItem);
    idEdicao = item.id;

    // Carrega dinamicamente os tipos do banco e já seleciona o tipo do item
    await carregarTiposSelect(selectTipo, item.tipo || "");

    // Modal para criar novo tipo de processo
    document.getElementById('btnNovoTipo')?.addEventListener('click', () => {
        abrirModalNovoTipo((novoTipoNome) => {
            carregarTiposSelect(selectTipo, novoTipoNome);
        });
    });

    document.getElementById('acao').value = item.acao || "";
    document.getElementById('nome').value = item.nome || "";
    document.getElementById('numeroPasta').value = item.numeroPasta || "";
    document.getElementById('numeroProc').value = item.numeroProc || "";
    document.getElementById('status').value = item.status || "";
    document.getElementById('descricao').value = item.descricao || "";
});

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    if (show) loading.classList.add('show');
    else loading.classList.remove('show');
};

const salvarEdicao = async () => {
    const modalAntigo = document.getElementById('confirmEditModal');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmEditModal';

    const destruirModal = () => {
        overlay.remove();
    };

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
            <h3>Confirmar Edição</h3>
            <p>Esta ação salvará as alterações feitas na pasta. <span style="font-weight: bold; color: white;">Deseja continuar?</span></p>
            <div class="confirm-buttons-group">
                <button class="btn-cancel-modal" id="cancelarEditBtn">Cancelar</button>
                <button class="btn-confirm-edit-act" id="confirmRealEdit">Salvar Alterações</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const confirmButton = document.getElementById('confirmRealEdit');
    const cancelarButton = document.getElementById('cancelarEditBtn');

    cancelarButton.addEventListener('click', () => {
        destruirModal();
    });

    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;

        const edicao = {
            acao: document.getElementById('acao').value,
            nome: document.getElementById('nome').value,
            numeroPasta: document.getElementById('numeroPasta').value,
            tipo: document.getElementById('tipo').value,
            numeroProc: document.getElementById('numeroProc').value,
            status: document.getElementById('status').value,
            descricao: document.getElementById('descricao').value
        };

        const statusMessage = document.getElementById('response');

        try {
            await apiFetch(`/clientes/${idEdicao}`, {
                method: 'PUT',
                body: JSON.stringify(edicao)
            });

            statusMessage.textContent = '';
            statusMessage.style.color = '#28a745';

            showLoading(true);
            destruirModal();

            sessionStorage.removeItem("itemEmEdicao");

            setTimeout(() => {
                showLoading(false);

                let countdown = 2;
                statusMessage.textContent = `✅ Edição salva com sucesso! Redirecionando em ${countdown}...`;
                countdown--;

                const countdownInterval = setInterval(() => {
                    if (countdown <= 0) {
                        clearInterval(countdownInterval);
                        window.location.href = '/pages/main/';
                    } else {
                        statusMessage.textContent = `✅ Edição salva com sucesso! Redirecionando em ${countdown}...`;
                        countdown--;
                    }
                }, 1000);
            }, 400);
        } catch (error) {
            console.error('Erro ao editar:', error);
            confirmButton.disabled = false;
            destruirModal();

            if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
                return;
            }

            statusMessage.style.color = '#dc3545';
            statusMessage.textContent = error.data?.mensagem || '❌ Erro ao editar registro. Verifique os dados ou sua conexão.';
        }
    }, { once: true });
};
