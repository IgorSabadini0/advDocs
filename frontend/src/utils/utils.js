// Utiliza o DOM para realizar o escape de forma segura.
const escapeHtml = (text) => {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
};

const formatDate = (dateString) => new Date(dateString).toLocaleDateString('pt-BR');

const normalizeText = (str) => {
    if (!str) return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export { escapeHtml, formatDate, normalizeText };