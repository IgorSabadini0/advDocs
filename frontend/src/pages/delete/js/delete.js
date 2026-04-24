const API_URL = "http://localhost:3000";

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
        const statusMessage = document.getElementById('response');
        const data = await response.json(); // Pegamos a mensagem enviada pelo back-end

        if (response.ok) {
            // Status 200 a 299
            document.getElementById('idInput').value = '';
            statusMessage.textContent = `✅ ${data.mensagem}`;
            statusMessage.style.color = '#28a745';
        } else {
            // Status 404, 400, 500, etc.
            statusMessage.textContent = `⚠️ ${data.mensagem || 'Erro ao excluir'}`;
            statusMessage.style.color = '#ffc107'; // Um amarelo/laranja para aviso
        }

    } catch (error) {
        // Erro de rede ou erro crítico
        const statusMessage = document.getElementById('response');
        statusMessage.textContent = '❌ Erro de conexão com o servidor!';
        statusMessage.style.color = '#dc3545';
    }
};