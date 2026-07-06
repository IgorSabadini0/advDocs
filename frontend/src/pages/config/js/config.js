const API_URL = window.location.origin;

const sair = () => {
    localStorage.removeItem('token');
    window.location.href = '../auth';
};

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('logoutButton').addEventListener('click', sair);
    const token = localStorage.getItem('token');

    // Rota protegida: se não houver token, envia para o login
    if (!token) {
        sair();
        return;
    }

    // Decodifica o JWT token para encontrar o nome do usuário
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));

        const payload = JSON.parse(jsonPayload);
        const userNameElement = document.getElementById('user-name');
        if (userNameElement && payload.nome) {
            userNameElement.textContent = payload.nome;
        }
    } catch (e) {
        console.error('Erro ao ler dados da sessão:', e);
    }
});
