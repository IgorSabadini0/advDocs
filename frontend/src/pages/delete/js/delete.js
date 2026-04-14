const API_URL = 'http://192.168.0.150:3000';

const excluirRegistro = async () => {
    const valorInput = document.getElementById('idInput').value;

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
            document.getElementById('mensagem').textContent = 'Registro excluído com sucesso!';
        } else {
            document.getElementById('mensagem').textContent = 'Erro ao excluir registro.';
        }
    } catch (error) {
        console.error('Erro ao excluir registro:', error);
        document.getElementById('mensagem').textContent = 'Erro ao excluir registro.';
    }
};