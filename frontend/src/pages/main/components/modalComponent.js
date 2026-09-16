const viewItem = (id, tipo) => {
    // 1. Verificação e Busca do Item
    // Convertendo ambos para String para evitar erros de tipagem (Number vs String) vindos da API
    const item = clientes.find(c => String(c.id) === String(id) && c.tipo === tipo);

    // 2. Tratamento de Erro (Item não encontrado)
    if (!item) {
        console.error(`[Erro] Item não encontrado: ID ${id} | Tipo: ${tipo}`);
        alert('Não foi possível encontrar os detalhes deste item. Ele pode ter sido removido.');
        return;
    }

    // Remover modal existente (se houver) para evitar duplicatas
    const modalExistente = document.getElementById('itemModal');
    if (modalExistente) modalExistente.remove();

    // 3. Renderização Condicional por 'Tipo'
    let detalhesEspecificos = '';

    if (tipo === 'pasta' || tipo === 'processo') { // Assumindo que possa ter 'processo' futuramente
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Número da Pasta:</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Número do Processo:</strong> <span>${escapeHtml(item.numeroProc || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Status:</strong> <span class="status-badge">${escapeHtml(item.status || 'N/A')}</span></div>
        `;
    } else if (tipo === 'cliente') {
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Nome Completo:</strong> <span>${escapeHtml(item.nome || item.acao || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Contato:</strong> <span>${escapeHtml(item.contato || 'N/A')}</span></div>
        `;
    } else if (tipo === 'documento') {
        detalhesEspecificos = `
            <div class="modal-info-item"><strong>Tipo de Documento:</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
            <div class="modal-info-item"><strong>Vínculo (Pasta):</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
        `;
    }

    // 4. Criação dinâmica do Modal no DOM
    const modal = document.createElement('div');
    modal.id = 'itemModal';
    modal.className = 'modal-overlay';

    // acao,
    // nome,
    // numeroPasta,
    // tipo,
    // numeroProc,
    // status,
    // descricao

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">${item.nome} - <span class="badge">${item.acao}</span></h2>
                <button class="btn-close-modal" data-action="close"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div class="modal-body">
                <div class="modal-section">
                    <h3>Informações Gerais</h3>
                    <div class="modal-info-grid">
                        <div class="modal-info-item"><strong>Ação:</strong> <span>${escapeHtml(item.acao || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Nome:</strong> <span>${escapeHtml(item.nome || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Número da Pasta:</strong> <span>${escapeHtml(item.numeroPasta || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Tipo:</strong> <span>${traduzirTipo(tipo)}</span></div>
                        <div class="modal-info-item"><strong>Número do Processo:</strong> <span>${escapeHtml(item.numeroProc || 'N/A')}</span></div>
                        <div class="modal-info-item"><strong>Status:</strong> <span class="status-badge">${escapeHtml(item.status || 'N/A')}</span></div>
                    </div>
                </div>

                ${item.descricao ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Descrição / Observações</h3>
                    <p class="modal-description">${escapeHtml(item.descricao)}</p>
                </div>` : ''}

                ${item.descricao ? `
                <div class="modal-section" style="margin-top: 20px;">
                    <h3>Descrição / Observações</h3>
                    <p class="modal-description">${escapeHtml(item.descricao)}</p>
                </div>` : ''}
            </div>

            <div class="modal-footer">
                <button class="btn-view-delete" data-action="delete">Deletar</button>
                <button class="btn-view" data-action="edit">Editar <i class="fa-solid fa-pen-to-square"></i></button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);

    modal.querySelector('[data-action="close"]').addEventListener('click', fecharModal);
    modal.querySelector('[data-action="delete"]').addEventListener('click', () => deletarItem(item.id, tipo));
    modal.querySelector('[data-action="edit"]').addEventListener('click', () => editarItem(item.id, tipo));

    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal) fecharModal();
    });

    setTimeout(() => {
        modal.classList.add('show');
    }, 10);
};

const fecharModal = () => {
    const modal = document.getElementById('itemModal');
    if (modal) {
        modal.classList.remove('show');
        setTimeout(() => modal.remove(), 300);
    }
};

export { viewItem, fecharModal, confirmModal };