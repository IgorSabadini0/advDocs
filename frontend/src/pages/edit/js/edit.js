import { mascaraProcessoCNJ, mascaraCpfCnpj, mascaraTelefone, escapeHtml, apiFetch, mostrarToast } from '../../../utils/utils.js';
import { extrairSegmentosCNJ } from '../../../utils/cnjParser.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';
import { initThemeManager } from '../../../utils/themeManager.js';
import { initNotificationsWidget, notificarConsultaPendente } from '../../../utils/notificationsWidget.js';

initThemeManager();

let idEdicao = null;
let procOriginalDigitos = '';
let tribunalEditadoManualmente = false;
let tribunalPreenchidoAutomaticamente = false;

const exibirMensagemStatus = (texto, tipo = 'info') => {
    const responseBox = document.getElementById('responseBox');
    const statusMessage = document.getElementById('response');
    if (!responseBox || !statusMessage) return;

    if (!texto) {
        responseBox.style.display = 'none';
        responseBox.className = 'status-message';
        statusMessage.textContent = '';
        return;
    }

    responseBox.style.display = 'flex';
    responseBox.className = `status-message msg-${tipo}`;
    statusMessage.style.color = tipo === 'error'
        ? 'var(--danger)'
        : tipo === 'success'
            ? 'var(--success)'
            : 'var(--brand-gold-hover)';
    statusMessage.textContent = texto;
};

const showLoading = (show, texto = 'Carregando dados da pasta...') => {
    const loading = document.getElementById('loading');
    const textEl = document.getElementById('loadingEditText');
    if (textEl) textEl.textContent = texto;
    if (loading) {
        if (show) loading.classList.add('show');
        else loading.classList.remove('show');
    }
};

const atualizarBadgeTribunal = (exibir, codigoJTR = null) => {
    const badge = document.getElementById('tribunalAutoBadge');
    if (!badge) return;

    if (exibir) {
        badge.innerHTML = codigoJTR
            ? `<i class="fa-solid fa-wand-magic-sparkles"></i> Detectado via CNJ (${escapeHtml(codigoJTR)})`
            : `<i class="fa-solid fa-wand-magic-sparkles"></i> Detectado via CNJ`;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
};

const atualizarContadorEDetectarTribunalCNJ = (isAlteracaoUsuario = false) => {
    const inputProcesso = document.getElementById('numero_processo');
    const inputTribunal = document.getElementById('tribunal');
    const badge = document.getElementById('cnjCounterBadge');
    if (!inputProcesso) return;

    const infoCNJ = extrairSegmentosCNJ(inputProcesso.value);

    if (badge) {
        badge.classList.remove('is-valid', 'is-incomplete');
        const digitos = infoCNJ.digitos.length;

        if (digitos === 0) {
            badge.textContent = 'Opcional';
        } else if (digitos === 20) {
            badge.textContent = 'CNJ válido (20/20)';
            badge.classList.add('is-valid');
        } else {
            badge.textContent = `${digitos}/20 dígitos`;
            badge.classList.add('is-incomplete');
        }
    }

    if (!inputTribunal) return;

    const procMudou = infoCNJ.digitos !== procOriginalDigitos;
    if (infoCNJ.tribunal) {
        const devePreencher = inputTribunal.value.trim() === ''
            || tribunalPreenchidoAutomaticamente
            || (isAlteracaoUsuario && procMudou && !tribunalEditadoManualmente);

        if (devePreencher) {
            inputTribunal.value = infoCNJ.tribunal;
            inputTribunal.classList.remove('input-invalid');
            tribunalPreenchidoAutomaticamente = true;
            atualizarBadgeTribunal(true, infoCNJ.codigoJTR);
        }
    } else if (infoCNJ.digitos.length < 16 && tribunalPreenchidoAutomaticamente) {
        inputTribunal.value = '';
        tribunalPreenchidoAutomaticamente = false;
        atualizarBadgeTribunal(false);
    }
};

// Aguarda o DOM carregar para selecionar os elementos
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../auth/';
        return;
    }

    initNotificationsWidget({ onToast: mostrarToast });

    const form = document.getElementById('editForm');
    const inputProcesso = document.getElementById('numero_processo');
    const inputTribunal = document.getElementById('tribunal');
    const inputCpfCnpj = document.getElementById('cpf_cnpj');
    const inputTelefone = document.getElementById('telefone');
    const selectTipo = document.getElementById('tipo_processo_id');
    const checkConsulta = document.getElementById('consultarProcesso');
    const datajudCard = document.querySelector('.datajud-toggle-card');

    document.querySelectorAll('#editForm input, #editForm select, #editForm textarea').forEach(el => {
        el.addEventListener('input', () => el.classList.remove('input-invalid'));
        el.addEventListener('change', () => el.classList.remove('input-invalid'));
    });

    if (inputCpfCnpj) {
        inputCpfCnpj.addEventListener('input', (e) => {
            e.target.value = mascaraCpfCnpj(e.target.value);
        });
    }

    if (inputTelefone) {
        inputTelefone.addEventListener('input', (e) => {
            e.target.value = mascaraTelefone(e.target.value);
        });
    }

    if (inputProcesso) {
        const handleProcessoChange = (e) => {
            e.target.value = mascaraProcessoCNJ(e.target.value);
            atualizarContadorEDetectarTribunalCNJ(true);
        };
        inputProcesso.addEventListener('input', handleProcessoChange);
        inputProcesso.addEventListener('blur', handleProcessoChange);
    }

    if (inputTribunal) {
        inputTribunal.addEventListener('input', () => {
            tribunalEditadoManualmente = true;
            tribunalPreenchidoAutomaticamente = false;
            atualizarBadgeTribunal(false);
        });
    }

    if (checkConsulta) {
        checkConsulta.addEventListener('change', () => {
            datajudCard?.classList.toggle('checked', checkConsulta.checked);
            const proc = (inputProcesso?.value || '').replace(/\D/g, '');
            if (checkConsulta.checked && proc.length !== 20) {
                exibirMensagemStatus(
                    'ℹ️ Informe o número completo do processo (20 dígitos padrão CNJ) para sincronizar via API pública do DataJud.',
                    'info'
                );
                inputProcesso?.focus();
            } else {
                const statusMessage = document.getElementById('response');
                if (statusMessage && statusMessage.textContent.startsWith('ℹ️')) {
                    exibirMensagemStatus('');
                }
            }
        });
    }

    const labelTipoIconEl = document.querySelector('label[for="tipo_processo_id"] i');

    document.getElementById('btnNovoTipo')?.addEventListener('click', () => {
        abrirModalNovoTipo((novoTipoNome, novoTipoId) => {
            carregarTiposSelect(selectTipo, novoTipoId || novoTipoNome, {
                valueField: 'id',
                iconTargetElement: labelTipoIconEl
            });
            selectTipo?.classList.remove('input-invalid');
            mostrarToast(`Categoria "${novoTipoNome}" criada e selecionada!`, 'success');
        });
    });

    // 1. Tenta carregar o registro pelo parâmetro de URL (?id=...) para garantir dados frescos da API
    const params = new URLSearchParams(window.location.search);
    const idParam = params.get('id');
    let item = null;

    if (idParam && Number(idParam) > 0) {
        showLoading(true, 'Carregando dados da pasta...');
        try {
            item = await apiFetch(`/clientes/${encodeURIComponent(idParam)}`);
        } catch (err) {
            console.warn('Registro não localizado diretamente via ID na API, tentando sessionStorage:', err.message);
        } finally {
            showLoading(false);
        }
    }

    // 2. Fallback para sessionStorage
    if (!item) {
        const dadosItem = sessionStorage.getItem('itemEmEdicao');
        if (dadosItem) {
            try {
                item = JSON.parse(dadosItem);
            } catch {
                item = null;
            }
        }
    }

    if (!item || !item.id) {
        exibirMensagemStatus('Nenhuma pasta selecionada para edição. Redirecionando...', 'error');
        setTimeout(() => {
            window.location.href = '../main/';
        }, 1200);
        return;
    }

    idEdicao = item.id;

    // Carrega os tipos de processo usando ID como value (e faz fallback pelo nome se tipo_processo_id for nulo)
    await carregarTiposSelect(selectTipo, item.tipo_processo_id || item.tipo || '', {
        valueField: 'id',
        iconTargetElement: labelTipoIconEl
    });

    document.getElementById('nome').value = item.nome || '';
    document.getElementById('cpf_cnpj').value = item.cpf_cnpj ? mascaraCpfCnpj(item.cpf_cnpj) : '';
    document.getElementById('telefone').value = item.telefone ? mascaraTelefone(item.telefone) : '';
    document.getElementById('email').value = item.email || '';

    document.getElementById('acao').value = item.acao || '';
    const procSalvo = item.numero_processo ?? item.numeroProc ?? '';
    document.getElementById('numero_processo').value = procSalvo ? mascaraProcessoCNJ(procSalvo) : '';
    procOriginalDigitos = String(procSalvo).replace(/\D/g, '');

    if (inputTribunal) {
        inputTribunal.value = item.tribunal || '';
    }
    document.getElementById('comarca_vara').value = item.comarca_vara || '';
    document.getElementById('parte_contraria').value = item.parte_contraria || '';

    document.getElementById('numeroPasta').value = item.numeroPasta || '';
    const statusAtual = item.status_pasta ?? item.status ?? 'Ativo';
    const selectStatus = document.getElementById('status_pasta');
    if (selectStatus) {
        selectStatus.value = statusAtual;
    }
    document.getElementById('observacoes').value = item.observacoes ?? item.descricao ?? '';

    atualizarContadorEDetectarTribunalCNJ(false);

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        abrirConfirmacaoEdicao();
    });
});

const validarCamposEdicao = () => {
    const inputNome = document.getElementById('nome');
    const inputCpfCnpj = document.getElementById('cpf_cnpj');
    const inputTelefone = document.getElementById('telefone');
    const inputEmail = document.getElementById('email');
    const inputAcao = document.getElementById('acao');
    const inputProc = document.getElementById('numero_processo');
    const selectTipo = document.getElementById('tipo_processo_id');
    const inputPasta = document.getElementById('numeroPasta');
    const checkConsulta = document.getElementById('consultarProcesso');

    const nome = inputNome.value.trim();
    const cpf_cnpj = inputCpfCnpj.value.trim();
    const telefone = inputTelefone.value.trim();
    const email = inputEmail.value.trim();
    const acao = inputAcao.value.trim();
    const numero_processo = inputProc.value.trim();
    const procLimpo = numero_processo.replace(/\D/g, '');
    const tipo_processo_id = selectTipo.value ? Number(selectTipo.value) : null;
    const numeroPasta = inputPasta.value.trim();
    const consultarProcesso = checkConsulta.checked;

    if (!nome) {
        inputNome.classList.add('input-invalid');
        inputNome.focus();
        exibirMensagemStatus('❌ Informe o Nome Completo ou Razão Social do cliente.', 'error');
        return false;
    }

    if (cpf_cnpj) {
        const docDigits = cpf_cnpj.replace(/\D/g, '');
        if (docDigits.length !== 11 && docDigits.length !== 14) {
            inputCpfCnpj.classList.add('input-invalid');
            inputCpfCnpj.focus();
            exibirMensagemStatus('❌ CPF/CNPJ incompleto. Informe 11 dígitos (CPF) ou 14 dígitos (CNPJ).', 'error');
            return false;
        }
    }

    if (telefone) {
        const telDigits = telefone.replace(/\D/g, '');
        if (telDigits.length !== 10 && telDigits.length !== 11) {
            inputTelefone.classList.add('input-invalid');
            inputTelefone.focus();
            exibirMensagemStatus('❌ Telefone/WhatsApp inválido. Informe DDD + 8 ou 9 dígitos.', 'error');
            return false;
        }
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        inputEmail.classList.add('input-invalid');
        inputEmail.focus();
        exibirMensagemStatus('❌ Informe um endereço de e-mail válido.', 'error');
        return false;
    }

    if (!acao) {
        inputAcao.classList.add('input-invalid');
        inputAcao.focus();
        exibirMensagemStatus('❌ Informe a Ação referente a esta pasta.', 'error');
        return false;
    }

    if (numero_processo && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ O Número do Processo informado está incompleto (são necessários os 20 dígitos do padrão CNJ).', 'error');
        return false;
    }

    if (!tipo_processo_id) {
        selectTipo.classList.add('input-invalid');
        selectTipo.focus();
        exibirMensagemStatus('❌ Selecione o Tipo de Processo.', 'error');
        return false;
    }

    if (!numeroPasta || Number(numeroPasta) <= 0 || !Number.isInteger(Number(numeroPasta))) {
        inputPasta.classList.add('input-invalid');
        inputPasta.focus();
        exibirMensagemStatus('❌ Informe um Número da Pasta inteiro positivo válido.', 'error');
        return false;
    }

    if (consultarProcesso && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ Para sincronizar com o DataJud, informe o número completo do processo (20 dígitos).', 'error');
        return false;
    }

    return true;
};

const abrirConfirmacaoEdicao = () => {
    if (!validarCamposEdicao()) return;

    const modalAntigo = document.getElementById('confirmEditModal');
    if (modalAntigo) modalAntigo.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.id = 'confirmEditModal';

    const destruirModal = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.remove(), 250);
    };

    overlay.innerHTML = `
        <div class="modal-confirm-content">
            <i class="fa-solid fa-triangle-exclamation modal-confirm-icon"></i>
            <h3>Confirmar Edição</h3>
            <p>Esta ação salvará as alterações feitas na pasta. <span style="font-weight: bold; color: var(--text-primary);">Deseja continuar?</span></p>
            <div class="confirm-buttons-group">
                <button type="button" class="btn-cancel-modal" id="cancelarEditBtn">Cancelar</button>
                <button type="button" class="btn-confirm-edit-act" id="confirmRealEdit">Salvar Alterações</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const confirmButton = document.getElementById('confirmRealEdit');
    const cancelarButton = document.getElementById('cancelarEditBtn');

    cancelarButton.addEventListener('click', destruirModal);
    overlay.addEventListener('mousedown', (e) => {
        if (e.target === overlay) destruirModal();
    });

    confirmButton.addEventListener('click', async () => {
        confirmButton.disabled = true;

        const selectTipo = document.getElementById('tipo_processo_id');
        const selectedOpt = selectTipo.options[selectTipo.selectedIndex];
        const numeroProc = document.getElementById('numero_processo').value.trim();
        const statusPasta = document.getElementById('status_pasta').value;
        const observacoes = document.getElementById('observacoes').value.trim();
        const consultarProcesso = document.getElementById('consultarProcesso').checked;

        const edicao = {
            nome: document.getElementById('nome').value.trim(),
            cpf_cnpj: document.getElementById('cpf_cnpj').value.trim() || null,
            telefone: document.getElementById('telefone').value.trim() || null,
            email: document.getElementById('email').value.trim() || null,
            acao: document.getElementById('acao').value.trim(),
            numero_processo: numeroProc || null,
            numeroProc: numeroProc || null,
            tribunal: document.getElementById('tribunal').value.trim().toUpperCase() || null,
            tipo_processo_id: selectTipo.value ? Number(selectTipo.value) : null,
            tipo: selectedOpt?.dataset?.nome || '',
            comarca_vara: document.getElementById('comarca_vara').value.trim() || null,
            parte_contraria: document.getElementById('parte_contraria').value.trim() || null,
            numeroPasta: document.getElementById('numeroPasta').value.trim(),
            status_pasta: statusPasta,
            status: statusPasta,
            observacoes: observacoes || null,
            descricao: observacoes || null,
            consultarProcesso
        };

        try {
            showLoading(true, 'Salvando alterações...');
            const data = await apiFetch(`/clientes/${idEdicao}`, {
                method: 'PUT',
                body: JSON.stringify(edicao)
            });

            destruirModal();
            sessionStorage.removeItem('itemEmEdicao');
            showLoading(false);

            if (data.datajud_status === 'pendente') {
                notificarConsultaPendente();
                exibirMensagemStatus('✅ Alterações salvas! A reconsulta ao DataJud foi iniciada em segundo plano.', 'success');
                mostrarToast('Pasta atualizada! Consulta ao DataJud iniciada em segundo plano.', 'info');
            } else {
                exibirMensagemStatus('✅ Edição salva com sucesso! Redirecionando para o painel...', 'success');
                mostrarToast('Edição salva com sucesso!', 'success');
            }

            setTimeout(() => {
                window.location.href = '/pages/main/';
            }, 1400);
        } catch (error) {
            console.error('Erro ao editar:', error);
            showLoading(false);
            confirmButton.disabled = false;
            destruirModal();

            if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
                return;
            }

            if (error.data?.campoConflito === 'numeroPasta') {
                const el = document.getElementById('numeroPasta');
                el?.classList.add('input-invalid');
                el?.focus();
            } else if (error.data?.campoConflito === 'numeroProc') {
                const el = document.getElementById('numero_processo');
                el?.classList.add('input-invalid');
                el?.focus();
            }

            const msgErro = error.data?.mensagem || 'Erro ao editar registro. Verifique os dados ou sua conexão.';
            exibirMensagemStatus(`❌ ${msgErro}`, 'error');
            mostrarToast(msgErro, 'error');
        }
    }, { once: true });
};
