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
    let v = String(valor || '').replace(/\D/g, '').slice(0, 20);

    v = v.replace(/(\d{7})(\d)/, '$1-$2');
    v = v.replace(/(\d{7}-\d{2})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1})(\d)/, '$1.$2');
    v = v.replace(/(\d{7}-\d{2}\.\d{4}\.\d{1}\.\d{2})(\d)/, '$1.$2');

    return v.substring(0, 25);
};

const mascaraCpfCnpj = (valor) => {
    const digits = String(valor || '').replace(/\D/g, '').slice(0, 14);
    if (digits.length <= 11) {
        return digits
            .replace(/^(\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3}\.\d{3})(\d)/, '$1.$2')
            .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, '$1-$2');
    }
    return digits
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3})(\d)/, '$1.$2')
        .replace(/^(\d{2}\.\d{3}\.\d{3})(\d)/, '$1/$2')
        .replace(/^(\d{2}\.\d{3}\.\d{3}\/\d{4})(\d)/, '$1-$2');
};

const mascaraTelefone = (valor) => {
    const digits = String(valor || '').replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 10) {
        return digits
            .replace(/^(\d{2})(\d)/, '($1) $2')
            .replace(/^(\(\d{2}\)\s\d{4})(\d)/, '$1-$2');
    }
    return digits
        .replace(/^(\d{2})(\d)/, '($1) $2')
        .replace(/^(\(\d{2}\)\s\d{5})(\d)/, '$1-$2');
};

/**
 * Exibe notificação flutuante (Toast) reutilizável em todas as páginas.
 */
const mostrarToast = (mensagem, tipo = 'success', duracao = 3500) => {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        container.setAttribute('aria-live', 'polite');
        document.body.appendChild(container);
    }

    const tipoUi = tipo === 'sucesso' ? 'success' : tipo === 'erro' ? 'error' : tipo;
    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipoUi}`;

    const icone = tipoUi === 'error'
        ? 'fa-circle-exclamation'
        : tipoUi === 'info'
            ? 'fa-circle-info'
            : 'fa-circle-check';

    toast.innerHTML = `
        <i class="fa-solid ${icone} toast-icon"></i>
        <span class="toast-text">${escapeHtml(mensagem)}</span>
    `;

    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, duracao);
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
    const { timeoutMs = 90000, signal: externalSignal, headers: customHeaders, ...fetchOptions } = options;

    const controller = new AbortController();
    let timeoutId = null;

    if (externalSignal) {
        if (externalSignal.aborted) {
            controller.abort(externalSignal.reason);
        } else {
            externalSignal.addEventListener('abort', () => controller.abort(externalSignal.reason), { once: true });
        }
    }

    if (timeoutMs > 0) {
        timeoutId = setTimeout(() => {
            controller.abort(new Error('REQUEST_TIMEOUT'));
        }, timeoutMs);
    }

    let response;
    try {
        response = await fetch(`${window.location.origin}${endpoint}`, {
            ...fetchOptions,
            signal: controller.signal,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': authHeader,
                ...(customHeaders || {})
            }
        });
    } catch (err) {
        if (err?.name === 'AbortError' || err?.message === 'REQUEST_TIMEOUT') {
            const timeoutErr = new Error('A requisição excedeu o tempo limite ou foi cancelada. Tente novamente.');
            timeoutErr.status = 408;
            timeoutErr.code = 'REQUEST_TIMEOUT';
            timeoutErr.data = { mensagem: timeoutErr.message };
            throw timeoutErr;
        }
        throw err;
    } finally {
        if (timeoutId) clearTimeout(timeoutId);
    }

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

/**
 * Resolve o selo visual unificado de sincronização (ATUALIZADO, SINCRONIZANDO, PENDENTE, ERRO).
 */
const resolverSeloSincronizacao = (statusSync, datajudStatus = null) => {
    const norm = statusSync ? String(statusSync).trim().toUpperCase() : '';
    switch (norm) {
        case 'ATUALIZADO':
            return { cls: 'atualizado', icon: 'fa-circle-check', label: 'ATUALIZADO' };
        case 'SINCRONIZANDO':
            return { cls: 'sincronizando', icon: 'fa-spinner fa-spin', label: 'SINCRONIZANDO' };
        case 'PENDENTE':
            return { cls: 'pendente', icon: 'fa-clock', label: 'PENDENTE' };
        case 'AGUARDANDO_CREDENCIAL':
            return { cls: 'erro', icon: 'fa-key', label: 'AGUARDANDO_CREDENCIAL' };
        case 'ERRO':
            return { cls: 'erro', icon: 'fa-triangle-exclamation', label: 'ERRO' };
        default: {
            if (datajudStatus === 'concluido') return { cls: 'atualizado', icon: 'fa-circle-check', label: 'ATUALIZADO' };
            if (datajudStatus === 'pendente') return { cls: 'sincronizando', icon: 'fa-spinner fa-spin', label: 'SINCRONIZANDO' };
            if (datajudStatus === 'erro') return { cls: 'erro', icon: 'fa-triangle-exclamation', label: 'ERRO' };
            return null;
        }
    }
};

/**
 * Abre/baixa arquivo PDF autenticado via header Bearer evitando exposição de JWT em URL.
 */
const abrirPdfDocumentoAutenticado = async (processoId, docId, onToast = mostrarToast) => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }

    const authHeader = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
    const url = `${window.location.origin}/api/processos/${encodeURIComponent(processoId)}/documentos/${encodeURIComponent(docId)}/arquivo`;

    const response = await fetch(url, {
        headers: { 'Authorization': authHeader }
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.mensagem || 'Não foi possível abrir o PDF do documento.');
    }

    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const novaAba = window.open(blobUrl, '_blank', 'noopener,noreferrer');
    if (!novaAba) {
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `documento_${docId}.pdf`;
        document.body.appendChild(link);
        link.click();
        link.remove();
    }

    if (typeof onToast === 'function') {
        onToast('PDF carregado com sucesso!', 'success');
    }

    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
};

/**
 * Solicita download sob demanda de documento via MNI (`POST /api/processos/:id/documentos/:docId/baixar`)
 * e acompanha o término do job até estar pronto para abertura.
 */
const baixarDocumentoMniSobDemanda = async ({ processoId, docId, instancia = '1G' }) => {
    const resp = await apiFetch(`/api/processos/${encodeURIComponent(processoId)}/documentos/${encodeURIComponent(docId)}/baixar`, {
        method: 'POST',
        body: JSON.stringify({ instancia })
    });

    let statusFinal = null;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 400));
        statusFinal = await apiFetch(`/api/processos/${encodeURIComponent(processoId)}/status-sincronizacao`);
        const docAtual = (statusFinal.documentos || []).find(
            d => String(d.id) === String(docId) || String(d.id_documento_tribunal) === String(docId)
        );
        if (docAtual?.baixado) {
            return { concluido: true, documento: docAtual, statusDados: statusFinal };
        }
        if (statusFinal.ultimo_job?.id === resp.job_id && statusFinal.ultimo_job?.status === 'FALHA_PERMANENTE') {
            throw new Error(statusFinal.ultimo_job.mensagem_erro || 'Falha ao baixar documento via MNI.');
        }
    }

    return { concluido: false, documento: null, statusDados: statusFinal, job_id: resp.job_id };
};

export {
    escapeHtml,
    formatDate,
    formatDateTime,
    normalizeText,
    mascaraProcessoCNJ,
    mascaraCpfCnpj,
    mascaraTelefone,
    mostrarToast,
    resolverSeloSincronizacao,
    abrirPdfDocumentoAutenticado,
    baixarDocumentoMniSobDemanda,
    apiFetch
};
