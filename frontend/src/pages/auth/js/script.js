const API_URL = window.location.origin; // usa a URL atual como base para as requisições. Ex: https://minhaapi.com/api/v1 a URL base será https://minhaapi.com

const submit = document.getElementById("submit");

const acess = async () => {
    const user = document.getElementById('user').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('status');

    const response = await fetch(`${API_URL}/auth`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user, password })
    });

    const data = await response.json();

    if (response.ok) {
        window.location.href = data.redirectUrl;
    } else {
        status.innerText = data.mensagem;
    }
}

submit.addEventListener('click', acess);