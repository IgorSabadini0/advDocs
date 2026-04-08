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

    fetch(`${API_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registro)
    });
}