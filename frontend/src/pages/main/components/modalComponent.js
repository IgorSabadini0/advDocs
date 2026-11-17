import { escapeHtml, formatDate } from '../../../utils/utils.js';

const fecharModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

const viewItemModal = (item, { tipoLegivel, onDelete, onEdit, onResyncDatajud, canEdit = true, canDelete = true, onToast } = {}) => {
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
                        <div class="modal-info-item"><strong>Categoria / Tipo</strong> <span>${escapeHtml(tipoLegivel || item.tipo)}</span></div>
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
                    <h3>Sincronização DataJud (CNJ)</h3>
                    <div class="modal-info-grid">
                        <div class="modal-info-item">
                            <strong>Status da Consulta</strong>
                            <span id="modalDatajudStatusBadge" class="datajud-pill ${escapeHtml(item.datajud_status || 'nao-sincronizado')}">
                                <i class="fa-solid ${item.datajud_status === 'concluido' ? 'fa-circle-check' : item.datajud_status === 'erro' ? 'fa-triangle-exclamation' : item.datajud_status === 'pendente' ? 'fa-spinner fa-spin' : 'fa-circle-minus'}"></i>
                                ${item.datajud_status === 'concluido' ? 'Sincronizado' : item.datajud_status === 'erro' ? 'Erro na Consulta' : item.datajud_status === 'pendente' ? 'Em andamento' : 'Não sincronizado'}
                            </span>
                        </div>
                        ${item.classe_processual ? `<div class="modal-info-item"><strong>Classe Processual</strong> <span>${escapeHtml(item.classe_processual)}</span></div>` : ''}
                        ${item.orgao_julgador ? `<div class="modal-info-item"><strong>Órgão Julgador</strong> <span>${escapeHtml(item.orgao_julgador)}</span></div>` : ''}
                        ${item.assunto_principal ? `<div class="modal-info-item"><strong>Assunto(s)</strong> <span>${escapeHtml(item.assunto_principal)}</span></div>` : ''}
                        ${item.data_ajuizamento ? `<div class="modal-info-item"><strong>Data de Ajuizamento</strong> <span>${escapeHtml(formatDate(item.data_ajuizamento) || item.data_ajuizamento)}</span></div>` : ''}
                        ${item.datajud_mensagem && item.datajud_status === 'erro' ? `<div class="modal-info-item modal-info-proc"><strong>Detalhe</strong> <span>${escapeHtml(item.datajud_mensagem)}</span></div>` : ''}
                    </div>
                    ${(item.numeroProc && item.datajud_status !== 'pendente' && canEdit && typeof onResyncDatajud === 'function') ? `
                    <div class="datajud-modal-actions">
                        <button type="button" class="btn-resync-datajud" data-action="resync-datajud">
                            <i class="fa-solid fa-arrows-rotate"></i>
                            ${item.datajud_status === 'erro' ? 'Tentar sincronizar novamente' : item.datajud_status === 'concluido' ? 'Atualizar dados no DataJud' : 'Sincronizar agora com DataJud'}
                        </button>
                    </div>` : ''}
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
                    badge.className = 'datajud-pill pendente';
                    badge.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Em andamento';
                }
                resyncBtn.remove();
            } else {
                resyncBtn.disabled = false;
                resyncBtn.innerHTML = textoOriginal;
            }
        });
    }

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

export { viewItemModal, fecharModal };
