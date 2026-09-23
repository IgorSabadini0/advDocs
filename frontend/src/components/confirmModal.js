const confirmModal = () => {
    return `
    <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
            <h3 class>Confirmar Exclusão</h3>
            <p>Esta ação apagará permanentemente os dados da pasta e não poderá ser desfeita. <span style="font-weight: bold; color: white;">Deseja continuar?</span></p>
            <div class="confirm-buttons-group">
                <button class="btn-cancel-modal" data-action="cancel-delete">Cancelar</button>
                <button class="btn-confirm-delete-act" id="confirmRealDelete">Apagar Agora</button>
            </div>
        </div>
    `;
};

/**
 * Exibe modal amigável de feedback (erro, alerta, informação ou sucesso)
 * Utiliza as mesmas classes e temas dos modais do sistema.
 */
const showModalAlert = ({ title = 'Atenção', message = '', type = 'error', buttonText = 'Entendido' }) => {
    const existing = document.getElementById('feedbackModal');
    if (existing) existing.remove();

    const iconMap = {
        error: { icon: 'fa-solid fa-triangle-exclamation', color: 'var(--danger, #ef4444)' },
        warning: { icon: 'fa-solid fa-circle-exclamation', color: 'var(--warning, #f59e0b)' },
        info: { icon: 'fa-solid fa-circle-info', color: 'var(--info-blue, #3b82f6)' },
        success: { icon: 'fa-solid fa-circle-check', color: 'var(--success, #10b981)' }
    };

    const config = iconMap[type] || iconMap.error;

    const modal = document.createElement('div');
    modal.id = 'feedbackModal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
        <div class="modal-confirm-content">
            <i class="${config.icon} modal-confirm-icon" style="color: ${config.color};"></i>
            <h3>${title}</h3>
            <p>${message}</p>
            <div class="confirm-buttons-group">
                <button class="btn-cancel-modal" id="btnFeedbackOk" style="background: var(--brand-gold, #dab063); color: #07090e; font-weight: 700; border: none; padding: 10px 24px;">${buttonText}</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    const fechar = () => {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    };

    modal.querySelector('#btnFeedbackOk').addEventListener('click', fechar);
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) fechar();
    });

    setTimeout(() => modal.classList.add('show'), 10);
};

export { confirmModal, showModalAlert };