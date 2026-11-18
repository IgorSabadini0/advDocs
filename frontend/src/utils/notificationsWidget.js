import { escapeHtml, apiFetch, mostrarToast } from './utils.js';
import {
    getPushPermissionState,
    subscribeUserToPush,
    unsubscribeUserFromPush,
    sendTestPushNotification
} from './pushManager.js';

const SEEN_STORAGE_KEY = 'advdocs_seen_notif_ids';
const AWAITING_DATAJUD_KEY = 'advdocs_awaiting_datajud';

let pollingTimer = null;
let deleteConfirmTimer = null;
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

const resetDeleteAllConfirm = () => {
    if (deleteConfirmTimer) {
        clearTimeout(deleteConfirmTimer);
        deleteConfirmTimer = null;
    }
    const deleteAllBtn = document.getElementById('notifDeleteAllBtn');
    if (deleteAllBtn && deleteAllBtn.dataset.confirm === '1') {
        delete deleteAllBtn.dataset.confirm;
        deleteAllBtn.classList.remove('is-confirming');
        deleteAllBtn.innerHTML = '<i class="fa-solid fa-trash-can"></i> <span>Excluir todas</span>';
    }
};

const emitirToast = (mensagem, tipo = 'info') => {
    const tipoUi = tipo === 'sucesso' ? 'success' : tipo === 'erro' ? 'error' : tipo;
    if (typeof callbacksRef.onToast === 'function') {
        callbacksRef.onToast(mensagem, tipoUi);
    } else {
        mostrarToast(mensagem, tipoUi, 4500);
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

const HEADER_NOTIF_HTML = `
    <span class="notif-dropdown-title"><i class="fa-solid fa-bell"></i> Notificações</span>
    <div class="notif-header-actions">
        <button type="button" class="notif-mark-all-btn" id="notifMarkAllBtn" title="Marcar todas como lidas" disabled>
            <i class="fa-solid fa-check-double"></i> <span>Marcar lidas</span>
        </button>
        <button type="button" class="notif-clear-all-btn" id="notifDeleteAllBtn" title="Excluir todas as notificações" disabled>
            <i class="fa-solid fa-trash-can"></i> <span>Excluir todas</span>
        </button>
    </div>
`;

/**
 * Garante que o marcador `#notifWrapper` contenha o sino, badge e dropdown
 * e move o dropdown para `document.body` (Portal) evitando cortes por overflow/backdrop-filter.
 */
const garantirEstruturaNotificacoes = () => {
    const wrapper = document.getElementById('notifWrapper');
    if (!wrapper) return null;

    if (!document.getElementById('notificationBellBtn')) {
        wrapper.innerHTML = `
            <button type="button" class="btn-nav btn-notif-nav" id="notificationBellBtn" title="Notificações do Sistema" aria-haspopup="true" aria-expanded="false">
                <i class="fa-solid fa-bell"></i>
                <span class="notif-badge" id="notificationBadgeCount" style="display: none;">0</span>
            </button>
        `;
    }

    let dropdown = document.getElementById('notificationDropdown');
    if (!dropdown) {
        dropdown = document.createElement('div');
        dropdown.className = 'notif-dropdown';
        dropdown.id = 'notificationDropdown';
        dropdown.setAttribute('role', 'region');
        dropdown.setAttribute('aria-label', 'Central de Notificações');
        dropdown.innerHTML = `
            <div class="notif-dropdown-header">${HEADER_NOTIF_HTML}</div>
            <div class="notif-push-bar" id="notifPushBar"></div>
            <div class="notif-pending-banner" id="notifPendingBanner" style="display: none;">
                <i class="fa-solid fa-spinner fa-spin"></i>
                <span id="notifPendingText">Consultando DataJud em segundo plano...</span>
            </div>
            <div class="notif-list" id="notificationList">
                <div class="notif-empty">
                    <i class="fa-regular fa-bell-slash"></i>
                    <span>Nenhuma notificação no momento.</span>
                </div>
            </div>
        `;
        document.body.appendChild(dropdown);
    } else {
        if (dropdown.parentElement !== document.body) {
            document.body.appendChild(dropdown);
        }
        const headerEl = dropdown.querySelector('.notif-dropdown-header');
        if (headerEl && !dropdown.querySelector('#notifDeleteAllBtn')) {
            headerEl.innerHTML = HEADER_NOTIF_HTML;
        }
        if (headerEl && !dropdown.querySelector('#notifPushBar')) {
            const bar = document.createElement('div');
            bar.className = 'notif-push-bar';
            bar.id = 'notifPushBar';
            headerEl.insertAdjacentElement('afterend', bar);
        }
    }

    return {
        wrapper,
        bellBtn: document.getElementById('notificationBellBtn'),
        dropdown
    };
};

const atualizarBarraPushDropdown = async () => {
    const bar = document.getElementById('notifPushBar');
    if (!bar) return;

    const { state } = await getPushPermissionState();

    if (state === 'ios-requires-install') {
        bar.className = 'notif-push-bar is-ios-tip';
        bar.innerHTML = `
            <span class="notif-push-status">
                <i class="fa-solid fa-mobile-screen"></i>
                <span>No iPhone, instale na <strong>Tela de Início</strong> para receber Push.</span>
            </span>
        `;
        return;
    }

    if (state === 'unsupported') {
        bar.style.display = 'none';
        return;
    }
    bar.style.display = 'flex';

    if (state === 'denied') {
        bar.className = 'notif-push-bar is-blocked';
        bar.innerHTML = `
            <span class="notif-push-status">
                <i class="fa-solid fa-bell-slash"></i>
                <span>Push bloqueado nas permissões do navegador</span>
            </span>
        `;
        return;
    }

    if (state === 'subscribed') {
        bar.className = 'notif-push-bar is-active';
        bar.innerHTML = `
            <span class="notif-push-status">
                <i class="fa-solid fa-circle-check"></i>
                <span>Notificações Push ativas</span>
            </span>
            <div class="notif-push-actions">
                <button type="button" class="notif-push-mini-btn" id="notifPushTestBtn" title="Enviar alerta de teste">
                    <i class="fa-solid fa-paper-plane"></i> Testar
                </button>
                <button type="button" class="notif-push-mini-btn is-muted" id="notifPushOffBtn" title="Desativar neste aparelho">
                    Desativar
                </button>
            </div>
        `;
    } else {
        bar.className = 'notif-push-bar';
        bar.innerHTML = `
            <span class="notif-push-status">
                <i class="fa-regular fa-bell"></i>
                <span>Alertas nativos neste aparelho</span>
            </span>
            <button type="button" class="notif-push-enable-btn" id="notifPushEnableBtn">
                <i class="fa-solid fa-bolt"></i> Ativar Notificações
            </button>
        `;
    }

    bar.querySelector('#notifPushEnableBtn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Ativando...';
        try {
            const res = await subscribeUserToPush();
            emitirToast(res.mensagem || 'Push configurado.', res.ok ? 'sucesso' : 'erro');
        } catch (err) {
            emitirToast(err?.data?.mensagem || err?.message || 'Erro ao ativar notificações Push.', 'erro');
        } finally {
            await atualizarBarraPushDropdown();
        }
    });

    bar.querySelector('#notifPushTestBtn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const res = await sendTestPushNotification();
            emitirToast(res?.mensagem || 'Notificação de teste enviada!', 'sucesso');
        } catch (err) {
            emitirToast(err?.data?.mensagem || err?.message || 'Erro ao enviar teste.', 'erro');
        } finally {
            btn.disabled = false;
        }
    });

    bar.querySelector('#notifPushOffBtn')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
            const res = await unsubscribeUserFromPush();
            emitirToast(res?.mensagem || 'Notificações Push desativadas.', 'info');
        } catch (err) {
            emitirToast(err?.message || 'Erro ao desativar notificações.', 'erro');
        } finally {
            await atualizarBarraPushDropdown();
        }
    });
};

/**
 * Posiciona o dropdown em viewport fixa baseado nas coordenadas atuais do sino.
 */
const posicionarDropdown = () => {
    const bellBtn = document.getElementById('notificationBellBtn');
    const dropdown = document.getElementById('notificationDropdown');
    if (!bellBtn || !dropdown || !dropdown.classList.contains('open')) return;

    const rect = bellBtn.getBoundingClientRect();
    const margin = 12;

    if (window.innerWidth <= 560) {
        const topMobile = Math.min(Math.max(rect.bottom + 10, margin), Math.max(margin, window.innerHeight - 360));
        dropdown.style.top = `${topMobile}px`;
        dropdown.style.left = `${margin}px`;
        dropdown.style.right = `${margin}px`;
        dropdown.style.width = 'auto';
    } else {
        const panelWidth = Math.min(385, window.innerWidth - margin * 2);
        const maxLeft = window.innerWidth - panelWidth - margin;
        const preferredLeft = rect.right - panelWidth;
        const clampedLeft = Math.max(margin, Math.min(preferredLeft, maxLeft));
        const topDesktop = Math.min(Math.max(rect.bottom + 10, margin), Math.max(margin, window.innerHeight - 240));

        dropdown.style.width = `${panelWidth}px`;
        dropdown.style.right = 'auto';
        dropdown.style.left = `${clampedLeft}px`;
        dropdown.style.top = `${topDesktop}px`;
    }
};

const renderizarNotificacoes = (dados) => {
    const badge = document.getElementById('notificationBadgeCount');
    const bellBtn = document.getElementById('notificationBellBtn');
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    const deleteAllBtn = document.getElementById('notifDeleteAllBtn');
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
        markAllBtn.style.display = 'inline-flex';
        markAllBtn.disabled = naoLidas === 0;
    }

    if (deleteAllBtn) {
        resetDeleteAllConfirm();
        deleteAllBtn.style.display = 'inline-flex';
        deleteAllBtn.disabled = notificacoes.length === 0;
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
            <div class="notif-item ${n.lida ? '' : 'unread'}" data-notif-id="${n.id}">
                <button type="button" class="notif-item-main" data-notif-id="${n.id}">
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
                <button type="button" class="notif-item-delete" data-delete-id="${n.id}" title="Apagar notificação" aria-label="Apagar notificação">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
    }).join('');

    listEl.querySelectorAll('.notif-item-main').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const notifId = Number(btn.dataset.notifId);
            const notif = notificationsCache.find(item => Number(item.id) === notifId);
            if (!notif) return;

            if (!notif.lida) {
                try {
                    await apiFetch(`/notificacoes/${notifId}/lida`, { method: 'PATCH' });
                    notif.lida = true;
                    await carregarNotificacoes(true);
                } catch (err) {
                    console.error('Erro ao marcar notificação como lida:', err);
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

    listEl.querySelectorAll('.notif-item-delete').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const notifId = Number(btn.dataset.deleteId);
            if (!notifId || btn.disabled) return;

            btn.disabled = true;
            try {
                await apiFetch(`/notificacoes/${notifId}`, { method: 'DELETE' });
                await carregarNotificacoes(true);
                emitirToast('Notificação removida.', 'info');
            } catch (err) {
                console.error('Erro ao excluir notificação:', err);
                btn.disabled = false;
                emitirToast(err.message || 'Erro ao excluir notificação.', 'error');
            }
        });
    });

    posicionarDropdown();
};

const fecharDropdown = () => {
    resetDeleteAllConfirm();
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

    garantirEstruturaNotificacoes();
    atualizarBarraPushDropdown();

    if (initialized) {
        carregarNotificacoes(true);
        return;
    }
    initialized = true;

    window.addEventListener('advdocs:push-state-change', () => {
        atualizarBarraPushDropdown();
    });

    const bellBtn = document.getElementById('notificationBellBtn');
    const dropdown = document.getElementById('notificationDropdown');
    const markAllBtn = document.getElementById('notifMarkAllBtn');
    const deleteAllBtn = document.getElementById('notifDeleteAllBtn');
    const wrapper = document.getElementById('notifWrapper');

    if (bellBtn && dropdown) {
        bellBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const vaiAbrir = !dropdown.classList.contains('open');
            dropdown.classList.toggle('open', vaiAbrir);
            bellBtn.classList.toggle('active', vaiAbrir);
            bellBtn.setAttribute('aria-expanded', vaiAbrir ? 'true' : 'false');
            if (vaiAbrir) {
                posicionarDropdown();
                carregarNotificacoes(true);
            }
        });

        document.addEventListener('click', (e) => {
            const insideWrapper = wrapper && wrapper.contains(e.target);
            const insideDropdown = dropdown && dropdown.contains(e.target);
            if (!insideWrapper && !insideDropdown) {
                fecharDropdown();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && dropdown.classList.contains('open')) {
                fecharDropdown();
            }
        });

        window.addEventListener('resize', posicionarDropdown);
        window.addEventListener('scroll', posicionarDropdown, { passive: true });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (markAllBtn.disabled) return;

            markAllBtn.disabled = true;
            try {
                await apiFetch('/notificacoes/ler-todas', { method: 'PATCH' });
                await carregarNotificacoes(true);
                emitirToast('Todas as notificações foram marcadas como lidas.', 'info');
            } catch (err) {
                console.error('Erro ao marcar todas as notificações como lidas:', err);
                markAllBtn.disabled = false;
                emitirToast(err.message || 'Erro ao marcar notificações como lidas.', 'error');
            }
        });
    }

    if (deleteAllBtn) {
        deleteAllBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (deleteAllBtn.disabled) return;

            if (deleteAllBtn.dataset.confirm !== '1') {
                deleteAllBtn.dataset.confirm = '1';
                deleteAllBtn.classList.add('is-confirming');
                deleteAllBtn.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> <span>Confirmar?</span>';
                if (deleteConfirmTimer) clearTimeout(deleteConfirmTimer);
                deleteConfirmTimer = setTimeout(resetDeleteAllConfirm, 3500);
                return;
            }

            resetDeleteAllConfirm();
            deleteAllBtn.disabled = true;
            try {
                await apiFetch('/notificacoes', { method: 'DELETE' });
                await carregarNotificacoes(true);
                emitirToast('Todas as notificações foram excluídas.', 'info');
            } catch (err) {
                console.error('Erro ao excluir todas as notificações:', err);
                deleteAllBtn.disabled = false;
                emitirToast(err.message || 'Erro ao excluir notificações.', 'error');
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
