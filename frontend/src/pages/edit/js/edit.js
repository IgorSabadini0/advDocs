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
    const acao = document.getElementById('acao').value;
    const nome = document.getElementById('nome').value;
    const numeroPasta = document.getElementById('numeroPasta').value;
    const tipo = document.getElementById('tipo').value;
    const numeroProc = document.getElementById('numeroProc').value;
    const status = document.getElementById('status').value;
    const descricao = document.getElementById('descricao').value;

    const edicao = {
        acao,
        nome,
        numeroPasta,
        tipo,
        numeroProc,
        status,
        descricao
    };

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/clientes/${idEdicao}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify(edicao)
        });

        if (response.ok) {
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = '✅ Edição salva com sucesso!';
            statusMessage.style.color = '#28a745';

            showLoading(true);
            setTimeout(() => {
                showLoading(false);
            }, 300);

        } else {
            const statusMessage = document.getElementById('response');
            statusMessage.style.color = '#dc3545';

            if (response.status === 400) {
                const data = await response.json();
                statusMessage.textContent = data.mensagem;
            } else {
                statusMessage.textContent = '❌ Erro ao editar. Tente novamente.';
            }
        }
    } catch (error) {
        console.error('Erro ao editar:', error);
    }
}