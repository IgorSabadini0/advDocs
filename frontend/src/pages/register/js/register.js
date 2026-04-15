const API_URL = 'http://localhost:3000';

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
});

const salvarRegistro = async () => {
    const titulo = document.getElementById('titulo').value;
    const nome = document.getElementById('nome').value;
    const numeroPasta = document.getElementById('numeroPasta').value;
    const tipo = document.getElementById('tipo').value;
    const numeroProc = document.getElementById('numeroProc').value;
    const status = document.getElementById('status').value;
    const descricao = document.getElementById('descricao').value;

    const registro = {
        titulo,
        nome,
        numeroPasta,
        tipo,
        numeroProc,
        status,
        descricao
    };

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(registro)
        });

        if (response.ok) {
            document.getElementById('titulo').value = '';
            document.getElementById('numeroPasta').value = '';
            document.getElementById('nome').value = '';
            document.getElementById('tipo').value = '';
            document.getElementById('numeroProc').value = '';
            document.getElementById('status').value = '';
            document.getElementById('descricao').value = '';
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = '✅ Registro salvo com sucesso!';
            statusMessage.style.color = '#28a745';
        } else {
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = '❌ Erro ao salvar registro. Tente novamente.';
            statusMessage.style.color = '#dc3545';
        }
    } catch (error) {
        console.error('Erro ao salvar registro:', error);
    }
}