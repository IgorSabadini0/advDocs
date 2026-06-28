const API_URL = window.location.origin;
let idEdicao = null;

const mascaraProcessoCNJ = (valor) => {
    let v = valor.replace(/\D/g, "");

    // Aplica a formatação progressivamente
    v = v.replace(/(\d{7})(\d)/, "$1-$2");                       // NNNNNNN-DD...
    v = v.replace(/(\d{7}-\d{2})(\d)/, "$1.$2");                 // NNNNNNN-DD.AAAA...
    v = v.replace(/(\d{7}-\d{2}\.\d{4})(\d)/, "$1.$2");          // NNNNNNN-DD.AAAA.J...
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1})(\d)/, "$1.$2");   // NNNNNNN-DD.AAAA.J.TR...
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2})(\d)/, "$1.$2"); // NNNNNNN-DD.AAAA.J.TR.OO...

    return v.substring(0, 25);
};

// Aguarda o DOM carregar para selecionar o elemento
document.addEventListener('DOMContentLoaded', () => {
    const inputProcesso = document.getElementById('numeroProc');

    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            // Pega o valor atual, passa na máscara e devolve para o input
            e.target.value = mascaraProcessoCNJ(e.target.value);
        });
    }

    // Pega os dados salvos no localStorage e preenche os campos do formulário

    const dadosItem = sessionStorage.getItem("itemEmEdicao");
    if (!dadosItem) {
        document.getElementById('response').textContent = "Nenhuma pasta selecionada para edição.";
        window.location.href = "../main";
        return;
    }

    const item = JSON.parse(dadosItem);
    idEdicao = item.id;

    // Prencher os inputs com os valores coletados e se não houver valor, preencher com uma string vazia "".

    document.getElementById('acao').value = item.acao || "";
    document.getElementById('nome').value = item.nome || "";
    document.getElementById('numeroPasta').value = item.numeroPasta || "";
    document.getElementById('tipo').value = item.tipo || "";
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
    // 1. Remove o modal anterior se por acaso ele já existir no DOM (evita lixo no HTML)
    const modalAntigo = document.getElementById('confirmEditModal');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmEditModal';

    // Função interna para destruir o modal e limpar o DOM
    const destruirModal = () => {
        overlay.remove();
    };

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
            <h3 class="">Confirmar Edição</h3>
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

    // Fechar ao clicar em cancelar
    cancelarButton.addEventListener('click', () => {
        destruirModal();
        if (typeof fecharConfirmacao === 'function') fecharConfirmacao(); // Mantém sua função antiga se necessário
    });

    // Evento de confirmação (usando { once: true } para garantir que só execute UMA vez)
    confirmButton.addEventListener('click', async () => {
        // Desabilita o botão para evitar cliques repetidos enquanto processa
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

        const token = localStorage.getItem('token');

        try {
            const response = await fetch(`${API_URL}/clientes/${idEdicao}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': token // Lembre-se de tratar no backend se precisa do prefixo "Bearer "
                },
                body: JSON.stringify(edicao)
            });

            const statusMessage = document.getElementById('response');

            if (response.ok) {
                statusMessage.textContent = '✅ Edição salva com sucesso!';
                statusMessage.style.color = '#28a745';

                showLoading(true);
                destruirModal(); // Fecha o modal de confirmação já que deu certo

                setTimeout(() => {
                    showLoading(false);
                    // Aqui você pode redirecionar o usuário ou atualizar a tabela/lista
                }, 300);

            } else {
                statusMessage.style.color = '#dc3545';
                confirmButton.disabled = false; // Reativa o botão se deu erro para ele tentar de novo

                if (response.status === 400) {
                    const data = await response.json();
                    statusMessage.textContent = data.mensagem;
                } else {
                    statusMessage.textContent = '❌ Erro ao editar. Tente novamente.';
                }
                destruirModal(); // Fecha o modal para o usuário ver o erro na tela principal
            }
        } catch (error) {
            console.error('Erro ao editar:', error);
            confirmButton.disabled = false;
            destruirModal();
        }
    }, { once: true }); // O { once: true } remove o listener automaticamente após o clique
}