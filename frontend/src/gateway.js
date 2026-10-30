// Gateway de roteamento raiz: valida sessão no navegador sem violar Content Security Policy (CSP)
(function () {
    try {
        var token = localStorage.getItem('token');
        if (token) {
            var parts = token.split('.');
            if (parts.length === 3) {
                var payload = JSON.parse(atob(parts[1]));
                if (payload && payload.exp && (payload.exp * 1000 > Date.now())) {
                    window.location.replace('/pages/main/');
                    return;
                }
            }
            localStorage.removeItem('token');
        }
    } catch (e) {
        try { localStorage.removeItem('token'); } catch (_) {}
    }
    window.location.replace('/pages/auth/');
})();
