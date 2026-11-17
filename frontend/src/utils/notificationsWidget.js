import { escapeHtml, apiFetch } from './utils.js';

const SEEN_STORAGE_KEY = 'advdocs_seen_notif_ids';
const AWAITING_DATAJUD_KEY = 'advdocs_awaiting_datajud';

let pollingTimer = null;
let initialized = false;
let notificationsCache = [];
let callbacksRef = {
    onNotificationClick: null,
    onDatajudUpdate: null,
    onToast: null
};

const getSeenIds = () => {
    try {
        const raw = sessionStorage.getItem(SEEN_STORAGE_KEY);
        const arr = raw ? JSON.parse(raw) : [];
        return Array.isArray(arr) ? arr : [];
    } catch {
        return [];
    }
};

const saveSeenIds = (ids) => {
    try {
        sessionStorage.setItem(SEEN_STORAGE_KEY, JSON.stringify(ids.slice(-100)));
    } catch {
        // Ignora erro de quota
    }
};

const formatarTempoRelativo = (dataIso) => {
    if (!dataIso) return '';
    const data = new Date(dataIso);
    if (isNaN(data.getTime())) return '';

    const diffSeg = Math.max(0, Math.floor((Date.now() - data.getTime()) / 1000));
    if (diffSeg < 15) return 'agora mesmo';
    if (diffSeg < 60) return `há ${diffSeg}s`;
    const diffMin = Math.floor(diffSeg / 60);
    if (diffMin < 60) return `há ${diffMin} min`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `há ${diffHoras}h`;
    const diffDias = Math.floor(diffHoras / 24);
    if (diffDias === 1) return 'ontem';
    if (diffDias < 7) return `há ${diffDias} dias`;
    return data.toLocaleDateString('pt-BR');
};

const exibirToastFallback = (mensagem, tipo = 'info') => {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipo}`;
    const icone = tipo === 'error'
        ? 'fa-circle-exclamation'
        : tipo === 'success'
            ? 'fa-circle-check'
            : 'fa-circle-info';

    toast.innerHTML = `
        <i class="fa-solid ${icone} toast-icon"></i>
        <span class="toast-text">${escapeHtml(mensagem)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 4500);
};

const emitirToast = (mensagem, tipo = 'info') => {
    const tipoUi = tipo === 'sucesso' ? 'success' : tipo === 'erro' ? 'error' : tipo;
    if (typeof callbacksRef.onToast === 'function') {
        callbacksRef.onToast(mensagem, tipoUi);
    } else {
        exibirToastFallback(mensagem, tipoUi);
    }
};

/**
 * Sinaliza que uma consulta DataJud foi disparada em segundo plano
 * para acelerar o polling e notificar com Toast assim que terminar.
 */
export const notificarConsultaPendente = () => {
    try {
        sessionStorage.setItem(AWAITING_DATAJUD_KEY, '1');
    } catch {
        // Ignora
    }
    if (initialized) {
        agendarProximoPoll(1500);
    }
};

const renderizarNotificacoes = (dados) => {
    const badge = document.getElementById('notificationBadgeCount');
    const bellBtn = document.getElementById('notificationBellBtn');
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    const pendingBanner = document.getElementById('notifPendingBanner');
    const pendingText = document.getElementById('notifPendingText');
    const listEl = document.getElementById('notificationList');

    const { notificacoes = [], naoLidas = 0, consultasPendentes = 0 } = dados;

    if (badge) {
        badge.textContent = naoLidas > 99 ? '99+' : String(naoLidas);
        badge.style.display = naoLidas > 0 ? 'inline-flex' : 'none';
        badge.classList.toggle('is-pending', consultasPendentes > 0);
    }

    if (bellBtn) {
        bellBtn.title = naoLidas > 0
            ? `${naoLidas} notificação(ões) não lida(s)`
            : 'Notificações do Sistema';
    }

    if (markAllBtn) {
        markAllBtn.style.display = naoLidas > 0 ? 'inline-flex' : 'none';
    }

    if (pendingBanner && pendingText) {
        if (consultasPendentes > 0) {
            pendingBanner.style.display = 'flex';
            pendingText.textContent = consultasPendentes === 1
                ? '1 consulta DataJud em segundo plano...'
                : `${consultasPendentes} consultas DataJud em segundo plano...`;
        } else {
            pendingBanner.style.display = 'none';
        }
    }

    if (!listEl) return;

    if (notificacoes.length === 0) {
        listEl.innerHTML = `
            <div class="notif-empty">
                <i class="fa-regular fa-bell-slash"></i>
                <span>Nenhuma notificação no momento.</span>
            </div>
        `;
        return;
    }

    listEl.innerHTML = notificacoes.map(n => {
        const iconClass = n.tipo === 'sucesso'
            ? 'fa-circle-check'
            : n.tipo === 'erro'
                ? 'fa-triangle-exclamation'
                : 'fa-circle-info';

        return `
            <button type="button" class="notif-item ${n.lida ? '' : 'unread'}" data-notif-id="${n.id}">
                <span class="notif-item-icon ${escapeHtml(n.tipo)}">
                    <i class="fa-solid ${iconClass}"></i>
                </span>
                <span class="notif-item-content">
                    <span class="notif-item-top">
                        <strong class="notif-item-title">${escapeHtml(n.titulo)}</strong>
                        ${n.lida ? '' : '<span class="notif-unread-dot" title="Não lida"></span>'}
                    </span>
                    <span class="notif-item-msg">${escapeHtml(n.mensagem)}</span>
                    <span class="notif-item-time">
                        <i class="fa-regular fa-clock"></i> ${escapeHtml(formatarTempoRelativo(n.criada_em))}
                        ${n.pasta_numero ? ` &bull; Pasta Nº ${escapeHtml(n.pasta_numero)}` : ''}
                    </span>
                </span>
            </button>
        `;
    }).join('');

    listEl.querySelectorAll('.notif-item').forEach(btn => {
        btn.addEventListener('click', async () => {
            const notifId = Number(btn.dataset.notifId);
            const notif = notificationsCache.find(item => Number(item.id) === notifId);
            if (!notif) return;

            if (!notif.lida) {
                try {
                    await apiFetch(`/notificacoes/${notifId}/lida`, { method: 'PATCH' });
                    notif.lida = true;
                    await carregarNotificacoes(true);
                } catch (e) {
                    console.error('Erro ao marcar notificação como lida:', e);
                }
            }

            fecharDropdown();

            if (typeof callbacksRef.onNotificationClick === 'function') {
                callbacksRef.onNotificationClick(notif);
            } else if (notif.cliente_id) {
                window.location.href = `/pages/main/?openPasta=${encodeURIComponent(notif.cliente_id)}`;
            } else if (notif.numero_processo) {
                window.location.href = `/pages/consult/?proc=${encodeURIComponent(notif.numero_processo)}`;
            }
        });
    });
};

const fecharDropdown = () => {
    const dropdown = document.getElementById('notificationDropdown');
    const bellBtn = document.getElementById('notificationBellBtn');
    dropdown?.classList.remove('open');
    bellBtn?.classList.remove('active');
    bellBtn?.setAttribute('aria-expanded', 'false');
};

const agendarProximoPoll = (ms) => {
    if (pollingTimer) {
        clearTimeout(pollingTimer);
    }
    pollingTimer = setTimeout(() => {
        carregarNotificacoes(false);
    }, ms);
};

export const carregarNotificacoes = async (silencioso = false) => {
    const token = localStorage.getItem('token');
    if (!token) return null;

    try {
        const dados = await apiFetch('/notificacoes');
        const lista = Array.isArray(dados.notificacoes) ? dados.notificacoes : [];
        notificationsCache = lista;

        const seenIds = getSeenIds();
        const isFirstBoot = seenIds.length === 0;
        const awaiting = (() => {
            try { return sessionStorage.getItem(AWAITING_DATAJUD_KEY) === '1'; } catch { return false; }
        })();

        const naoLidasNovas = lista.filter(n => !n.lida && !seenIds.includes(n.id));

        if (!silencioso && naoLidasNovas.length > 0) {
            if (!isFirstBoot) {
                for (const n of naoLidasNovas.slice(0, 2)) {
                    emitirToast(`${n.titulo}: ${n.mensagem}`, n.tipo);
                    if (typeof callbacksRef.onDatajudUpdate === 'function') {
                        callbacksRef.onDatajudUpdate(n);
                    }
                    window.dispatchEvent(new CustomEvent('advdocs:datajud-updated', { detail: n }));
                }
            } else if (awaiting) {
                const recentes = naoLidasNovas.filter(n => {
                    const t = new Date(n.criada_em).getTime();
                    return !isNaN(t) && (Date.now() - t) < 30000;
                });
                for (const n of recentes.slice(0, 2)) {
                    emitirToast(`${n.titulo}: ${n.mensagem}`, n.tipo);
                    if (typeof callbacksRef.onDatajudUpdate === 'function') {
                        callbacksRef.onDatajudUpdate(n);
                    }
                }
            }
        }

        if (dados.consultasPendentes === 0 && awaiting) {
            try { sessionStorage.removeItem(AWAITING_DATAJUD_KEY); } catch {}
        }

        const novosIds = [...new Set([...seenIds, ...lista.map(n => n.id)])];
        saveSeenIds(novosIds);

        renderizarNotificacoes(dados);

        const proximoIntervalo = (dados.consultasPendentes > 0 || awaiting) ? 2500 : 20000;
        agendarProximoPoll(proximoIntervalo);

        return dados;
    } catch (error) {
        if (error.message !== 'UNAUTHORIZED' && error.message !== 'TOKEN_MISSING') {
            console.error('Erro ao buscar notificações:', error);
            agendarProximoPoll(20000);
        }
        return null;
    }
};

export const initNotificationsWidget = (options = {}) => {
    callbacksRef = {
        ...callbacksRef,
        ...options
    };

    if (initialized) {
        carregarNotificacoes(true);
        return;
    }
    initialized = true;

    const bellBtn = document.getElementById('notificationBellBtn');
    const dropdown = document.getElementById('notificationDropdown');
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    const wrapper = document.getElementById('notifWrapper');

    if (bellBtn && dropdown) {
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const vaiAbrir = !dropdown.classList.contains('open');
            dropdown.classList.toggle('open', vaiAbrir);
            bellBtn.classList.toggle('active', vaiAbrir);
            bellBtn.setAttribute('aria-expanded', vaiAbrir ? 'true' : 'false');
            if (vaiAbrir) {
                carregarNotificacoes(true);
            }
        });

        document.addEventListener('click', (e) => {
            if (wrapper && !wrapper.contains(e.target)) {
                fecharDropdown();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                fecharDropdown();
            }
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            try {
                await apiFetch('/notificacoes/ler-todas', { method: 'PATCH' });
                await carregarNotificacoes(true);
                emitirToast('Todas as notificações foram marcadas como lidas.', 'info');
            } catch (err) {
                console.error('Erro ao marcar todas como lidas:', err);
            }
        });
    }

    window.addEventListener('focus', () => {
        if (localStorage.getItem('token')) {
            carregarNotificacoes(false);
        }
    });

    carregarNotificacoes(false);
};
