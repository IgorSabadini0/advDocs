const API_URL = window.location.origin;

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

    document.getElementById('saveButton').addEventListener('click', salvarRegistro);

    // Pré-preenchimento a partir de parâmetros da URL (vindo da página de consulta)
    const urlParams = new URLSearchParams(window.location.search);
    const procParam = urlParams.get('proc');
    const acaoParam = urlParams.get('acao');
    if (procParam && inputProcesso) {
        inputProcesso.value = mascaraProcessoCNJ(procParam);
    }
    if (acaoParam && document.getElementById('acao')) {
        document.getElementById('acao').value = acaoParam;
    }
});

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    if (show) loading.classList.add('show');
    else loading.classList.remove('show');
};

const salvarRegistro = async () => {
    const acao = document.getElementById('acao').value;
    const nome = document.getElementById('nome').value;
    const numeroPasta = document.getElementById('numeroPasta').value;
    const tipo = document.getElementById('tipo').value;
    const numeroProc = document.getElementById('numeroProc').value;
    const status = document.getElementById('status').value;
    const descricao = document.getElementById('descricao').value;
    const consultarProcesso = document.getElementById('consultarProcesso').checked; // Propriedade checked para verificar status do checkbox, return true ou false (boolean)

    const registro = {
        acao,
        nome,
        numeroPasta,
        tipo,
        numeroProc,
        status,
        consultarProcesso,
        descricao
    };

    const token = localStorage.getItem('token');

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify(registro) // Envia informações da variável registro como JSON no corpo da requisição
        });

        if (response.ok) {
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = ''; // caso tenha algo escrito no statusMessage, limpa para não acumular mensagens
            statusMessage.style.color = '#28a745'; // verde para sucesso

            showLoading(true);
            setTimeout(() => {
                document.getElementById('acao').value = ''; // Resetando o campo de ação para vazio
                document.getElementById('numeroPasta').value = '';
                document.getElementById('nome').value = '';
                document.getElementById('tipo').value = '';
                document.getElementById('numeroProc').value = '';
                document.getElementById('status').value = '';
                document.getElementById('consultarProcesso').checked = false; // Resetando o checkbox para desmarcado
                document.getElementById('descricao').value = '';

                showLoading(false);

                statusMessage.textContent = '✅ Registro salvo com sucesso!';
            }, 300);

        } else {
            const statusMessage = document.getElementById('response');
            statusMessage.style.color = '#dc3545';

            if (response.status === 400) {
                const data = await response.json();
                statusMessage.innerHTML = data.mensagem; // não é necessário usar o textContent = '' porque a mensgem é subscrita aqui
            } else {
                statusMessage.innerHTML = '❌ Erro ao salvar registro. Tente novamente.';
            }
        }
    } catch (error) {
        console.error('Erro ao salvar registro:', error);
    }
}
