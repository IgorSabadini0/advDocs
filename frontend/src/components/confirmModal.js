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

export { confirmModal };