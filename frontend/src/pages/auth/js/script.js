const API_URL = window.location.origin;

// Verifica se o usuário já possui sessão ativa e válida antes de qualquer interação
const verificarSessaoAtiva = () => {
    try {
        const token = localStorage.getItem('token');
        if (token) {
            const parts = token.split('.');
            if (parts.length === 3) {
                const payload = JSON.parse(atob(parts[1]));
                if (payload && payload.exp && (payload.exp * 1000 > Date.now())) {
                    window.location.replace('/pages/main/');
                    return true;
                }
            }
            localStorage.removeItem('token');
        }
    } catch (_) {
        localStorage.removeItem('token');
    }
    return false;
};

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    const submitBtn = document.getElementById("submit");

    if (show) {
        loading?.classList.add('show');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = "0.5";
        }
    } else {
        loading?.classList.remove('show');
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = "1";
        }
    }
};

const acess = async (event) => {
    event?.preventDefault();
    const user = document.getElementById('user').value;
    const password = document.getElementById('password').value;
    const status = document.getElementById('status');

    // Limpa a mensagem de erro anterior ao tentar novamente
    if (status) status.innerText = '';

    if (!user || !password) {
        if (status) status.innerText = 'Preencha todos os campos.';
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
            window.location.replace(data.redirectUrl || '/pages/main/');
        } else {
            if (status) status.innerText = data.mensagem || 'Usuário ou senha inválidos.';
            showLoading(false);
        }

    } catch (error) {
        console.error('Erro de rede ou servidor:', error);
        if (status) status.innerText = 'Erro de conexão. Verifique sua internet.';
        showLoading(false);
    }
};

if (!verificarSessaoAtiva()) {
    // Escuta o clique no botão sem depender de uma variável global criada pelo id.
    const submitButton = document.getElementById('submit');
    if (submitButton) {
        submitButton.addEventListener('click', acess);
    }

    // Permite dar "Enter" nos campos de input apenas quando o botão não estiver desabilitado
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && submitButton && !submitButton.disabled) {
            acess(e);
        }
    });
}
