import { escapeHtml, formatDate, resolverSeloSincronizacao } from '../../../utils/utils.js';

// --- RENDERIZAÇÃO DOS CARDS ---
const createResultCard = (item, index, onViewClick) => {
    const card = document.createElement('div');
    card.className = 'result-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Ver detalhes de ${item.nome || 'pasta'}`);
    card.style.animationDelay = `${Math.min(index * 0.04, 0.4)}s`;

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

    const resolverStatusBadge = (status) => {
        switch (status) {
            case 'Ativo':
                return { cls: 'ativo', icon: 'fa-circle-check' };
            case 'Aguardando Documentos':
                return { cls: 'aguardando', icon: 'fa-file-circle-question' };
            case 'Arquivado':
                return { cls: 'arquivado', icon: 'fa-box-archive' };
            default:
                return { cls: 'parado', icon: 'fa-circle-pause' };
        }
    };

    const { cls: statusClass, icon: statusIcon } = resolverStatusBadge(item.status);
    const dataRegistro = item.data || item.created_at;
    const syncBadge = resolverSeloSincronizacao(item.status_sincronizacao, item.datajud_status);
    const naoLidas = Number(item.movimentacoes_nao_lidas || 0);

    card.innerHTML = `
        <div class="card-header">
            <div class="card-icon"><i class="fa-solid ${iconMap[item.tipo] || 'fa-folder-open'}"></i></div>
            <div class="card-title">
                <div class="card-title-top">
                    <span class="card-type">${escapeHtml(item.tipo || 'Geral')}${item.tribunal ? ` &bull; ${escapeHtml(item.tribunal)}` : ''}</span>
                    ${item.status ? `
                        <span class="card-status-pill ${statusClass}">
                            <i class="fa-solid ${statusIcon}"></i> ${escapeHtml(item.status)}
                        </span>
                    ` : ''}
                </div>
                <h3>${escapeHtml(item.nome)}</h3>
            </div>
        </div>
        <div class="card-body">
            <div class="card-info">
                ${item.acao ? `<div class="info-item"><i class="fa-solid fa-gavel"></i><span><strong>Ação:</strong> ${escapeHtml(item.acao)}</span></div>` : ''}
                ${item.numeroPasta ? `<div class="info-item"><i class="fa-solid fa-folder-open"></i><span><strong>Pasta:</strong> Nº ${escapeHtml(item.numeroPasta)}</span></div>` : ''}
                ${item.numeroProc ? `<div class="info-item"><i class="fa-solid fa-scale-balanced"></i><span class="proc-mono">${escapeHtml(item.numeroProc)}</span></div>` : `<div class="info-item muted"><i class="fa-solid fa-scale-balanced"></i><span>Caso extrajudicial / sem processo</span></div>`}
                ${(syncBadge || naoLidas > 0) ? `
                <div class="card-badges-row">
                    ${syncBadge ? `<span class="sync-status-badge ${syncBadge.cls}" title="${escapeHtml(item.datajud_mensagem || '')}"><i class="fa-solid ${syncBadge.icon}"></i> ${syncBadge.label}</span>` : ''}
                    ${naoLidas > 0 ? `<span class="unread-movs-pill" title="Novas movimentações processuais não lidas"><i class="fa-solid fa-bell"></i> ${naoLidas} nova(s)</span>` : ''}
                </div>` : ''}
            </div>
            ${item.descricao ? `<p class="card-desc">${escapeHtml(item.descricao)}</p>` : ''}
        </div>
        <div class="card-footer">
            <span class="card-date">
                ${dataRegistro ? `<i class="fa-regular fa-calendar"></i> ${formatDate(dataRegistro)}` : ''}
            </span>
            <button type="button" class="btn-view" data-action="view">
                Ver Detalhes <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    `;

    const triggerView = () => {
        if (typeof onViewClick === 'function') {
            onViewClick(item.id, item.tipo);
        }
    };

    card.addEventListener('click', triggerView);
    card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            triggerView();
        }
    });

    return card;
};

export { createResultCard };
