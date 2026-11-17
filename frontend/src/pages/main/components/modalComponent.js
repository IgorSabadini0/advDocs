import {
    escapeHtml,
    formatDate,
    formatDateTime,
    apiFetch,
    resolverSeloSincronizacao,
    abrirPdfDocumentoAutenticado,
    baixarDocumentoMniSobDemanda
} from '../../../utils/utils.js';
import { resolverIconeTipo } from '../../../utils/tiposService.js';

const fecharModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

const viewItemModal = (item, { tipoLegivel, onDelete, onEdit, onResyncDatajud, onSyncUpdated, canEdit = true, canDelete = true, onToast } = {}) => {
    const modalExistente = document.getElementById('itemModal');
    if (modalExistente) {
        modalExistente.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'itemModal';
    modal.className = 'modal-overlay';
    modal.dataset.itemId = String(item.id);

    const dataCriacao = item.created_at || item.data;
    const dataAtualizacao = item.updated_at;
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
    const syncBadgeInicial = resolverSeloSincronizacao(item.status_sincronizacao, item.datajud_status);
    const naoLidasInicial = Number(item.movimentacoes_nao_lidas || 0);
    const procDigitos = String(item.numeroProc || '').replace(/\D/g, '');

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <div class="modal-title-group">
                    <h2 class="modal-title">${escapeHtml(item.nome)}</h2>
                    <span class="modal-subtitle-badge"><i class="fa-solid fa-gavel"></i> ${escapeHtml(item.acao || 'N/A')}</span>
                </div>
                <button class="btn-close-modal" data-action="close" title="Fechar (Esc)"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="modal-section">
                    <h3>Informações Gerais</h3>
                    <div class="modal-info-grid">
                        <div class="modal-info-item"><strong>Ação</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Cliente</strong> <span>${escapeHtml(item.nome || 'N/A')}</span></div>
                        ${item.cpf_cnpj ? `<div class="modal-info-item"><strong>CPF / CNPJ</strong> <span>${escapeHtml(item.cpf_cnpj)}</span></div>` : ''}
                        ${item.telefone ? `<div class="modal-info-item"><strong>Telefone / WhatsApp</strong> <span>${escapeHtml(item.telefone)}</span></div>` : ''}
                        ${item.email ? `<div class="modal-info-item"><strong>E-mail</strong> <span>${escapeHtml(item.email)}</span></div>` : ''}
                        <div class="modal-info-item"><strong>Número da Pasta</strong> <span>${item.numeroPasta ? `Nº ${escapeHtml(item.numeroPasta)}` : 'N/A'}</span></div>
                        <div class="modal-info-item"><strong>Categoria / Tipo</strong> <span><i class="${escapeHtml(resolverIconeTipo(item.tipo, item.tipo_icone))}" style="color: var(--brand-gold); margin-right: 6px;"></i>${escapeHtml(tipoLegivel || item.tipo)}</span></div>
                        ${item.tribunal ? `<div class="modal-info-item"><strong>Tribunal</strong> <span>${escapeHtml(item.tribunal)}</span></div>` : ''}
                        ${item.comarca_vara ? `<div class="modal-info-item"><strong>Comarca / Vara</strong> <span>${escapeHtml(item.comarca_vara)}</span></div>` : ''}
                        ${item.parte_contraria ? `<div class="modal-info-item"><strong>Parte Contrária</strong> <span>${escapeHtml(item.parte_contraria)}</span></div>` : ''}
                        <div class="modal-info-item modal-info-proc">
                            <strong>Número do Processo</strong>
                            <div class="proc-copy-row">
                                <span class="proc-mono">${escapeHtml(item.numeroProc || 'Não informado (extrajudicial)')}</span>
                                ${item.numeroProc ? `
                                    <button type="button" class="btn-copy-proc" data-action="copy-proc" title="Copiar número do processo">
                                        <i class="fa-regular fa-copy"></i> Copiar
                                    </button>
                                ` : ''}
                            </div>
                        </div>
                        <div class="modal-info-item">
                            <strong>Status Atual</strong>
                            <span class="card-status-pill ${statusClass}">
                                <i class="fa-solid ${statusIcon}"></i> ${escapeHtml(item.status || 'N/A')}
                            </span>
                        </div>
                        ${dataCriacao ? `<div class="modal-info-item"><strong>Cadastrado em</strong> <span>${formatDate(dataCriacao)}</span></div>` : ''}
                        ${dataAtualizacao ? `<div class="modal-info-item"><strong>Última atualização</strong> <span>${formatDate(dataAtualizacao)}</span></div>` : ''}
                    </div>
                </div>

                ${(item.numeroProc || item.datajud_status || item.classe_processual || item.orgao_julgador) ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Sincronização e Monitoramento Processual</h3>
                    <div class="modal-hybrid-toolbar">
                        <div class="modal-hybrid-badges">
                            <span id="modalDatajudStatusBadge" class="sync-status-badge ${syncBadgeInicial ? syncBadgeInicial.cls : 'pendente'}">
                                <i class="fa-solid ${syncBadgeInicial ? syncBadgeInicial.icon : 'fa-circle-minus'}"></i>
                                ${syncBadgeInicial ? syncBadgeInicial.label : 'NÃO SINCRONIZADO'}
                            </span>
                            <span id="modalUnreadMovsBadge" class="unread-movs-pill" style="display: ${naoLidasInicial > 0 ? 'inline-flex' : 'none'};">
                                <i class="fa-solid fa-bell"></i> ${naoLidasInicial} nova(s) movimentação(ões)
                            </span>
                        </div>
                        <div class="modal-hybrid-actions">
                            ${(procDigitos.length === 20 && canEdit) ? `
                            <button type="button" class="btn-sync-now" data-action="sync-now">
                                <i class="fa-solid fa-arrows-rotate"></i> Atualizar Agora
                            </button>` : ''}
                            <button type="button" class="btn-mark-read-movs" data-action="mark-movs-read" style="display: ${naoLidasInicial > 0 ? 'inline-flex' : 'none'};">
                                <i class="fa-solid fa-check-double"></i> Marcar movimentações como lidas
                            </button>
                        </div>
                    </div>
                    <div class="modal-info-grid">
                        ${item.classe_processual ? `<div class="modal-info-item"><strong>Classe Processual</strong> <span>${escapeHtml(item.classe_processual)}</span></div>` : ''}
                        ${item.orgao_julgador ? `<div class="modal-info-item"><strong>Órgão Julgador</strong> <span>${escapeHtml(item.orgao_julgador)}</span></div>` : ''}
                        ${item.assunto_principal ? `<div class="modal-info-item"><strong>Assunto(s)</strong> <span>${escapeHtml(item.assunto_principal)}</span></div>` : ''}
                        ${item.data_ajuizamento ? `<div class="modal-info-item"><strong>Data de Ajuizamento</strong> <span>${escapeHtml(formatDate(item.data_ajuizamento) || item.data_ajuizamento)}</span></div>` : ''}
                        ${item.datajud_mensagem && item.datajud_status === 'erro' ? `<div class="modal-info-item modal-info-proc"><strong>Detalhe</strong> <span>${escapeHtml(item.datajud_mensagem)}</span></div>` : ''}
                    </div>
                    ${(item.numeroProc && item.datajud_status !== 'pendente' && canEdit && typeof onResyncDatajud === 'function') ? `
                    <div class="datajud-modal-actions">
                        <button type="button" class="btn-resync-datajud" data-action="resync-datajud">
                            <i class="fa-solid fa-cloud-arrow-down"></i>
                            ${item.datajud_status === 'erro' ? 'Tentar DataJud novamente' : 'Reconsultar DataJud na pasta'}
                        </button>
                    </div>` : ''}
                    <div id="modalHybridDetails" style="margin-top: 14px;"></div>
                </div>` : ''}

                ${item.descricao ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Descrição / Observações</h3>
                    <p class="modal-description">${escapeHtml(item.descricao)}</p>
                </div>` : ''}
            </div>

            <div class="modal-footer">
                ${item.numeroProc ? `<button type="button" class="btn-view" data-action="consult"><i class="fa-solid fa-magnifying-glass"></i> Consultar DataJud</button>` : ''}
                ${canDelete ? `<button type="button" class="btn-view-delete" data-action="delete"><i class="fa-solid fa-trash-can"></i> Deletar</button>` : ''}
                ${canEdit ? `<button type="button" class="btn-view btn-view-primary" data-action="edit"><i class="fa-solid fa-pen-to-square"></i> Editar Pasta</button>` : ''}
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('[data-action="close"]').addEventListener('click', fecharModal);
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) fecharModal();
    });

    const copyBtn = modal.querySelector('[data-action="copy-proc"]');
    if (copyBtn && item.numeroProc) {
        copyBtn.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(item.numeroProc);
                copyBtn.innerHTML = '<i class="fa-solid fa-check"></i> Copiado';
                copyBtn.classList.add('copied');
                if (typeof onToast === 'function') {
                    onToast('Número do processo copiado para a área de transferência.', 'info');
                }
                setTimeout(() => {
                    copyBtn.innerHTML = '<i class="fa-regular fa-copy"></i> Copiar';
                    copyBtn.classList.remove('copied');
                }, 2000);
            } catch {
                // Fallback silencioso
            }
        });
    }

    const deleteBtn = modal.querySelector('[data-action="delete"]');
    if (deleteBtn) {
        deleteBtn.addEventListener('click', () => {
            if (typeof onDelete === 'function') onDelete(item.id, item.tipo);
        });
    }

    const editBtn = modal.querySelector('[data-action="edit"]');
    if (editBtn) {
        editBtn.addEventListener('click', () => {
            if (typeof onEdit === 'function') onEdit(item.id, item.tipo);
        });
    }

    const consultBtn = modal.querySelector('[data-action="consult"]');
    if (consultBtn) {
        consultBtn.addEventListener('click', () => {
            window.location.href = `/pages/consult/?proc=${encodeURIComponent(item.numeroProc)}`;
        });
    }

    const resyncBtn = modal.querySelector('[data-action="resync-datajud"]');
    if (resyncBtn && typeof onResyncDatajud === 'function') {
        resyncBtn.addEventListener('click', async () => {
            const textoOriginal = resyncBtn.innerHTML;
            resyncBtn.disabled = true;
            resyncBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Iniciando...';

            const ok = await onResyncDatajud(item);
            if (ok) {
                const badge = modal.querySelector('#modalDatajudStatusBadge');
                if (badge) {
                    badge.className = 'sync-status-badge sincronizando';
                    badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SINCRONIZANDO';
                }
                resyncBtn.remove();
            } else {
                resyncBtn.disabled = false;
                resyncBtn.innerHTML = textoOriginal;
            }
        });
    }

    // Carregamento assíncrono dos dados híbridos (movimentações não lidas + peças MNI)
    const hybridDetailsEl = modal.querySelector('#modalHybridDetails');
    const syncBadgeEl = modal.querySelector('#modalDatajudStatusBadge');
    const unreadBadgeEl = modal.querySelector('#modalUnreadMovsBadge');
    const markReadBtn = modal.querySelector('[data-action="mark-movs-read"]');
    const syncNowBtn = modal.querySelector('[data-action="sync-now"]');
    let processoSyncAtualId = item.processo_sync_id || null;

    const renderizarDetalhesHibridos = (dados) => {
        if (!hybridDetailsEl || !dados || !dados.processo) return;
        processoSyncAtualId = dados.processo.id;

        const badgeInfo = resolverSeloSincronizacao(dados.processo.status_sincronizacao, item.datajud_status);
        if (syncBadgeEl && badgeInfo) {
            syncBadgeEl.className = `sync-status-badge ${badgeInfo.cls}`;
            syncBadgeEl.innerHTML = `<i class="fa-solid ${badgeInfo.icon}"></i> ${badgeInfo.label}`;
        }

        const naoLidasCount = Number(dados.nao_lidos || 0);
        if (unreadBadgeEl) {
            unreadBadgeEl.style.display = naoLidasCount > 0 ? 'inline-flex' : 'none';
            unreadBadgeEl.innerHTML = `<i class="fa-solid fa-bell"></i> ${naoLidasCount} nova(s) movimentação(ões)`;
        }
        if (markReadBtn) {
            markReadBtn.style.display = naoLidasCount > 0 ? 'inline-flex' : 'none';
        }

        const docs = Array.isArray(dados.documentos) ? dados.documentos : [];
        const movs = Array.isArray(dados.movimentacoes) ? dados.movimentacoes.slice(0, 6) : [];

        const docsHtml = docs.length > 0 ? `
            <div style="margin-bottom: 14px;">
                <strong style="font-size: 0.82rem; color: var(--text-primary);"><i class="fa-solid fa-file-pdf"></i> Peças e Documentos Processuais (${docs.length})</strong>
                <div class="modal-docs-list">
                    ${docs.map(doc => `
                        <div class="modal-doc-row">
                            <div class="modal-doc-info">
                                <strong>${escapeHtml(doc.tipo_documento || 'Documento Processual')}${doc.descricao ? ` — ${escapeHtml(doc.descricao)}` : ''}</strong>
                                <small>ID Tribunal: ${escapeHtml(doc.id_documento_tribunal)} &bull; ${escapeHtml(doc.instancia || '1G')}${doc.data_juntada ? ` &bull; ${escapeHtml(formatDateTime(doc.data_juntada))}` : ''}</small>
                            </div>
                            <button type="button"
                                class="btn-download-pdf"
                                data-action="download-doc-pdf"
                                data-doc-id="${escapeHtml(doc.id)}"
                                data-doc-tribunal="${escapeHtml(doc.id_documento_tribunal)}"
                                data-instancia="${escapeHtml(doc.instancia || '1G')}"
                                data-baixado="${doc.baixado ? '1' : '0'}">
                                <i class="fa-solid ${doc.baixado ? 'fa-file-pdf' : 'fa-download'}"></i>
                                ${doc.baixado ? 'Abrir PDF' : 'Baixar PDF'}
                            </button>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        const movsHtml = movs.length > 0 ? `
            <div>
                <strong style="font-size: 0.82rem; color: var(--text-primary);"><i class="fa-solid fa-timeline"></i> Últimas Movimentações Monitoradas (${dados.total_movimentacoes || movs.length})</strong>
                <div class="modal-movs-list">
                    ${movs.map(mov => `
                        <div class="modal-mov-item ${mov.lido_pelo_advogado ? '' : 'unread'}">
                            <div class="modal-mov-top">
                                <span class="modal-mov-title">${escapeHtml(mov.titulo)}</span>
                                <span class="modal-mov-meta">
                                    ${mov.lido_pelo_advogado ? '' : '<span class="modal-mov-badge-new">Nova</span>'}
                                    <span>${escapeHtml(mov.fonte_captura)}</span>
                                    <span>${escapeHtml(formatDateTime(mov.data_movimentacao) || '')}</span>
                                </span>
                            </div>
                            ${mov.teor_completo ? `<p class="modal-mov-teor">${escapeHtml(mov.teor_completo)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : '';

        hybridDetailsEl.innerHTML = `${docsHtml}${movsHtml}`;

        hybridDetailsEl.querySelectorAll('[data-action="download-doc-pdf"]').forEach(btn => {
            btn.addEventListener('click', async () => {
                if (!processoSyncAtualId) return;
                const docId = btn.dataset.docId;
                const inst = btn.dataset.instancia || '1G';
                const jaBaixado = btn.dataset.baixado === '1';

                const originalHtml = btn.innerHTML;
                btn.disabled = true;

                try {
                    if (jaBaixado) {
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Abrindo...';
                        await abrirPdfDocumentoAutenticado(processoSyncAtualId, docId, onToast);
                    } else {
                        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando MNI...';
                        const resDownload = await baixarDocumentoMniSobDemanda({
                            processoId: processoSyncAtualId,
                            docId,
                            instancia: inst
                        });

                        if (resDownload.concluido) {
                            btn.dataset.baixado = '1';
                            btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Abrir PDF';
                            await abrirPdfDocumentoAutenticado(processoSyncAtualId, docId, onToast);
                        } else if (typeof onToast === 'function') {
                            onToast('Download enfileirado via MNI. Tente abrir em instantes.', 'info');
                        }
                    }
                } catch (err) {
                    if (typeof onToast === 'function') {
                        onToast(err.message || 'Falha ao baixar documento PDF.', 'error');
                    }
                } finally {
                    btn.disabled = false;
                    if (btn.dataset.baixado !== '1') {
                        btn.innerHTML = originalHtml;
                    } else {
                        btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Abrir PDF';
                    }
                }
            });
        });
    };

    const carregarStatusHibrido = async () => {
        if (procDigitos.length !== 20 || !document.body.contains(modal)) return;
        try {
            const dados = await apiFetch(`/api/processos/cnj/${encodeURIComponent(procDigitos)}/status-sincronizacao`);
            renderizarDetalhesHibridos(dados);
        } catch {
            // Processo pode ainda não estar no motor de monitoramento
        }
    };

    if (procDigitos.length === 20) {
        carregarStatusHibrido();
    }

    if (syncNowBtn && procDigitos.length === 20) {
        syncNowBtn.addEventListener('click', async () => {
            const orig = syncNowBtn.innerHTML;
            syncNowBtn.disabled = true;
            syncNowBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando...';
            if (syncBadgeEl) {
                syncBadgeEl.className = 'sync-status-badge sincronizando';
                syncBadgeEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> SINCRONIZANDO';
            }

            try {
                const resp = await apiFetch('/api/processos/sincronizar', {
                    method: 'POST',
                    body: JSON.stringify({ numero_cnj: procDigitos })
                });
                processoSyncAtualId = resp.processo_id;
                if (typeof onToast === 'function') {
                    onToast('Sincronização em segundo plano iniciada!', 'info');
                }

                for (let i = 0; i < 12; i++) {
                    await new Promise(r => setTimeout(r, 400));
                    if (!document.body.contains(modal)) break;
                    const dados = await apiFetch(`/api/processos/${encodeURIComponent(processoSyncAtualId)}/status-sincronizacao`);
                    renderizarDetalhesHibridos(dados);
                    if (dados.processo) {
                        item.status_sincronizacao = dados.processo.status_sincronizacao;
                        item.movimentacoes_nao_lidas = Number(dados.nao_lidos || 0);
                        if (typeof onSyncUpdated === 'function') onSyncUpdated(item);
                    }
                    if (dados.processo?.status_sincronizacao === 'ATUALIZADO' || dados.processo?.status_sincronizacao === 'ERRO') {
                        break;
                    }
                }
            } catch (err) {
                if (typeof onToast === 'function') {
                    onToast(err.data?.mensagem || err.message || 'Erro ao iniciar atualização.', 'error');
                }
            } finally {
                syncNowBtn.disabled = false;
                syncNowBtn.innerHTML = orig;
            }
        });
    }

    if (markReadBtn) {
        markReadBtn.addEventListener('click', async () => {
            if (!processoSyncAtualId) return;
            markReadBtn.disabled = true;
            try {
                await apiFetch(`/api/processos/${encodeURIComponent(processoSyncAtualId)}/movimentacoes/ler`, {
                    method: 'PATCH'
                });
                item.movimentacoes_nao_lidas = 0;
                if (typeof onSyncUpdated === 'function') onSyncUpdated(item);
                await carregarStatusHibrido();
                if (typeof onToast === 'function') {
                    onToast('Movimentações marcadas como lidas.', 'success');
                }
            } catch (err) {
                if (typeof onToast === 'function') {
                    onToast(err.data?.mensagem || 'Erro ao marcar movimentações como lidas.', 'error');
                }
            } finally {
                markReadBtn.disabled = false;
            }
        });
    }

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

export { viewItemModal, fecharModal };
