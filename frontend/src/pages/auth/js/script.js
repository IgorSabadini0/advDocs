const submit = document.getElementById("submit");

const API_URL = "http://192.168.0.150:3000";

const acess = async () => {
    const user = document.getElementById('user').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('status');

    const response = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password }) // Envia os dados de verdade
    });

    const data = await response.json();

    if (response.ok) {
        // O redirecionamento acontece aqui no cliente!
        window.location.href = data.redirectUrl;
    } else {
        status.innerText = data.mensagem;
    }
}