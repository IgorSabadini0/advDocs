import { escapeHtml, formatDate } from '../../../utils/utils.js';

// --- RENDERIZAÇÃO DOS CARDS COM AS NOVAS VARIÁVEIS ---
const createResultCard = (item, index, onViewClick) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.style.animationDelay = `${index * 0.05}s`;

    // Mapeia os ícones conforme o tipo de processo
    const iconMap = {
        'Civil': 'fa-scale-balanced',
        'Previdenciário': 'fa-person-cane',
        'Trabalhista': 'fa-briefcase',
        'Inventário': 'fa-scroll',
        'Família': 'fa-people-roof',
        'Consumidor': 'fa-cart-shopping',
        'Criminal': 'fa-handcuffs',
        'Santa Casa': 'fa-hospital',
        'Justiça Gratuita': 'fa-hand-holding-usd',
        'Arquivado': 'fa-box-archive',
        'Outro': 'fa-file'
    };

    // Verifica o status e define a classe do ícone correspondente
    const statusIcon = item.status === 'Ativo' ? 'fa-circle-check' : 'fa-circle-xmark';
    const dataRegistro = item.data || item.created_at;

    card.innerHTML = `
        <div class="card-header">
            <div class="card-icon"><i class="fa-solid ${iconMap[item.tipo] || 'fa-folder-open'}"></i></div>
            <div class="card-title">
                <h3>${escapeHtml(item.nome)}</h3>
                <span class="card-type">${escapeHtml(item.tipo || 'Geral')}</span>
            </div>
        </div>
        <div class="card-body">
            <div class="card-info">
                ${item.numeroPasta ? `<div class="info-item"><i class="fa-solid fa-folder-open"></i><span>Pasta: ${escapeHtml(item.numeroPasta)}</span></div>` : ''}
                ${item.numeroProc ? `<div class="info-item"><i class="fa-solid fa-scale-balanced"></i><span>Proc: ${escapeHtml(item.numeroProc)}</span></div>` : ''}
                ${item.nome ? `<div class="info-item"><i class="fa-solid fa-user-tie"></i><span>${escapeHtml(item.nome)}</span></div>` : ''}
                ${dataRegistro ? `<div class="info-item"><i class="fa-solid fa-calendar"></i><span>${formatDate(dataRegistro)}</span></div>` : ''}
                ${item.status ? `<div class="info-item"><i class="fa-solid ${statusIcon}"></i><span>${escapeHtml(item.status)}</span></div>` : ''}
            </div>
            ${item.descricao ? `<p style="margin-top: 15px; font-size: 0.9rem; color: var(--text-light); line-height: 1.4;">${escapeHtml(item.descricao)}</p>` : ''}
        </div>
        <div class="card-footer">
            <span class="card-date">${dataRegistro ? formatDate(dataRegistro) : ''}</span>
            <button class="btn-view" data-action="view">Ver Detalhes <i class="fa-solid fa-arrow-right"></i></button>
        </div>
    `;

    card.onmouseenter = () => card.style.transform = 'translateY(-5px)';
    card.onmouseleave = () => card.style.transform = 'translateY(0)';
    card.querySelector('[data-action="view"]').addEventListener('click', () => {
        if (typeof onViewClick === 'function') onViewClick(item.id, item.tipo);
    });

    return card;
};

export { createResultCard };
