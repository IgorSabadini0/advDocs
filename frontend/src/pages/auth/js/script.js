const API_URL = window.location.origin;

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    const submitBtn = document.getElementById("submit"); // Referência ao botão

    if (show) {
        loading.classList.add('show');
        submitBtn.disabled = true; // Desativa para evitar cliques duplos
        submitBtn.style.opacity = "0.5"; // Feedback visual opcional
    } else {
        loading.classList.remove('show');
        submitBtn.disabled = false;
        submitBtn.style.opacity = "1";
    }
};

const acess = async (event) => {
    // Evita comportamentos padrão se for usado dentro de um form
    if (event) event.preventDefault();

    const user = document.getElementById('user').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('status');

    // Limpa a mensagem de erro anterior ao tentar novamente
    status.innerText = '';

    if (!user || !password) {
        status.innerText = 'Preencha todos os campos.';
        return;
    }

    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/auth`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user, password })
        });

        // Verifica se a resposta é JSON antes de parsear
        const contentType = response.headers.get("content-type");
        let data = {};
        if (contentType && contentType.indexOf("application/json") !== -1) {
            data = await response.json();
        }

        if (response.ok) {
            localStorage.setItem('token', data.token);
            // Pequeno delay opcional para o usuário ver que deu certo
            window.location.href = data.redirectUrl;
        } else {
            status.innerText = data.mensagem || 'Usuário ou senha inválidos.';
            showLoading(false); // Só paramos o loading se houver erro, pois no sucesso mudamos de página
        }

    } catch (error) {
        console.error('Erro de rede ou servidor:', error);
        status.innerText = 'Erro de conexão. Verifique sua internet.';
        showLoading(false);
    }
}

// Escuta o clique no botão
submit.addEventListener('click', acess);

// Permite dar "Enter" nos campos de input
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') acess();
});