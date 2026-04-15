const API_URL = 'http://localhost:3000';

const excluirRegistro = async () => {
    const valorInput = document.getElementById('idInput').value.trim();

    if (!valorInput) {
        document.getElementById('mensagem').textContent = 'Por favor, insira um ID válido.';
        return;
    }

    try {
        const response = await fetch(`${API_URL}/delete/${valorInput}`, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (response.ok) {
            document.getElementById('idInput').value = '';
            const statusMessage = document.getElementById('response');
            statusMessage.textContent = '✅ Registro excluído com sucesso!';
            statusMessage.style.color = '#28a745';
        }
    } catch (error) {
        const statusMessage = document.getElementById('response');
        statusMessage.textContent = '❌ Erro ao excluir registro!';
        statusMessage.style.color = '#dc3545';
    }
};