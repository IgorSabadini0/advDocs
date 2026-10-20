import { escapeHtml, formatDate } from '../../../utils/utils.js';

const fecharModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

const viewItemModal = (item, { tipoLegivel, onDelete, onEdit }) => {
    const modalExistene = document.getElementById('itemModal');
    if (modalExistene) {
        modalExistene.remove();
    }

    const modal = document.createElement('div');
    modal.id = 'itemModal';
    modal.className = 'modal-overlay';

    const dataCriacao = item.created_at || item.data;
    const dataAtualizacao = item.updated_at;

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">${escapeHtml(item.nome)} - <span class="badge">${escapeHtml(item.acao || 'N/A')}</span></h2>
                <button class="btn-close-modal" data-action="close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="modal-section">
                    <h3>Informações Gerais</h3>
                    <div class="modal-info-grid">
                        <div class="modal-info-item"><strong>Ação:</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Nome:</strong> <span>${escapeHtml(item.nome || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Número da Pasta:</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Tipo:</strong> <span>${escapeHtml(tipoLegivel || item.tipo)}</span></div>
                        <div class="modal-info-item"><strong>Número do Processo:</strong> <span>${escapeHtml(item.numeroProc || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Status:</strong> <span class="status-badge">${escapeHtml(item.status || 'N/A')}</span></div>
                        ${dataCriacao ? `<div class="modal-info-item"><strong>Cadastrado em:</strong> <span>${formatDate(dataCriacao)}</span></div>` : ''}
                        ${dataAtualizacao ? `<div class="modal-info-item"><strong>Atualizado em:</strong> <span>${formatDate(dataAtualizacao)}</span></div>` : ''}
                    </div>
                </div>

                ${item.descricao ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Descrição / Observações</h3>
                    <p class="modal-description">${escapeHtml(item.descricao)}</p>
                </div>` : ''}
            </div>

            <div class="modal-footer">
                ${item.numeroProc ? `<button class="btn-view" data-action="consult"><i class="fa-solid fa-magnifying-glass"></i> Consultar DataJud</button>` : ''}
                <button class="btn-view-delete" data-action="delete">Deletar</button>
                <button class="btn-view" data-action="edit">Editar <i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        </div>
    `;

    document.body.appendChild(modal); // Adiciona o modal ao DOM

    modal.querySelector('[data-action="close"]').addEventListener('click', fecharModal);
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) fecharModal();
    });

    // Execução dos callbacks externos de ação
    modal.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (typeof onDelete === 'function') onDelete(item.id, item.tipo);
    });

    modal.querySelector('[data-action="edit"]').addEventListener('click', () => {
        if (typeof onEdit === 'function') onEdit(item.id, item.tipo);
    });

    const consultBtn = modal.querySelector('[data-action="consult"]');
    if (consultBtn) {
        consultBtn.addEventListener('click', () => {
            window.location.href = `/pages/consult/?proc=${encodeURIComponent(item.numeroProc)}`;
        });
    }

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

export { viewItemModal, fecharModal, escapeHtml };
