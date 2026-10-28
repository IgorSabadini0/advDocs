// Utiliza o DOM para realizar o escape de forma segura.
const escapeHtml = (text) => {
    if (text === null || text === undefined) return '';
    const div = document.createElement('div');
    div.textContent = String(text);
    return div.innerHTML;
};

const parseDateSafe = (dateString) => {
    if (!dateString) return null;
    const str = String(dateString).trim();

    // Suporte ao formato compacto do DataJud (YYYYMMDDHHmmss ou YYYYMMDD)
    if (/^\d{14}$/.test(str)) {
        const iso = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T${str.slice(8, 10)}:${str.slice(10, 12)}:${str.slice(12, 14)}`;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{8}$/.test(str)) {
        const iso = `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}T00:00:00`;
        const d = new Date(iso);
        return isNaN(d.getTime()) ? null : d;
    }

    const d = new Date(str);
    return isNaN(d.getTime()) ? null : d;
};

const formatDate = (dateString) => {
    const d = parseDateSafe(dateString);
    return d ? d.toLocaleDateString('pt-BR') : '';
};

const formatDateTime = (dateString) => {
    const d = parseDateSafe(dateString);
    return d
        ? d.toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        })
        : '';
};

const normalizeText = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
};

const mascaraProcessoCNJ = (valor) => {
    let v = String(valor || '').replace(/\D/g, '');

    v = v.replace(/(\d{7})(\d)/, '$1-$2');
    v = v.replace(/(\d{7}-\d{2})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2})(\d)/, '$1.$2');

    return v.substring(0, 25);
};

/**
 * Helper centralizado para requisições HTTP autenticadas à API.
 */
const apiFetch = async (endpoint, options = {}) => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        const err = new Error('TOKEN_MISSING');
        err.status = 401;
        throw err;
    }

    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;

    const response = await fetch(`${window.location.origin}${endpoint}`, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': authHeader,
            ...(options.headers || {})
        }
    });

    if (response.status === 401) {
        localStorage.removeItem('token');
        window.location.href = '/pages/auth/';
        const err = new Error('UNAUTHORIZED');
        err.status = 401;
        throw err;
    }

    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json')
        ? await response.json().catch(() => ({}))
        : {};

    if (!response.ok) {
        const error = new Error(data.mensagem || `Erro HTTP ${response.status}`);
        error.status = response.status;
        error.data = data;
        throw error;
    }

    return data;
};

export { escapeHtml, formatDate, formatDateTime, normalizeText, mascaraProcessoCNJ, apiFetch };
