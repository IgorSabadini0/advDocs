const API_URL = 'http://localhost:3000';

const salvarRegistro = async () => {
    const titulo = document.getElementById('titulo').value;
    const nome = document.getElementById('nome').value;
    const tipo = document.getElementById('tipo').value;
    const numero = document.getElementById('numero').value;
    const status = document.getElementById('status').value;
    const descricao = document.getElementById('descricao').value;

    const registro = {
        tipo,
        titulo,
        nome,
        numero,
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
            titulo = '';
            nome = '';
            tipo = '';
            numero = '';
            status = '';
            descricao = '';
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = 'Registro salvo com sucesso!';
            statusMessage.style.color = '#28a745';
        } else {
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = 'Erro ao salvar registro. Tente novamente.';
            statusMessage.style.color = '#dc3545';
        }
    } catch (error) {
        console.error('Erro ao salvar registro:', error);
    }
}