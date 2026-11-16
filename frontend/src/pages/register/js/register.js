import { mascaraProcessoCNJ, escapeHtml, apiFetch } from '../../../utils/utils.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';

// --- NOTIFICAÇÕES TOAST ---
const mostrarToast = (mensagem, tipo = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast-item toast-${tipo}`;

    const icone = tipo === 'error'
        ? 'fa-circle-exclamation'
        : tipo === 'info'
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
    }, 3500);
};

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

const atualizarContadorCNJ = () => {
    const inputProcesso = document.getElementById('numeroProc');
    const badge = document.getElementById('cnjCounterBadge');
    if (!inputProcesso || !badge) return;

    const digitos = (inputProcesso.value || '').replace(/\D/g, '').length;
    badge.classList.remove('is-valid', 'is-incomplete');

    if (digitos === 0) {
        badge.textContent = 'Opcional';
    } else if (digitos === 20) {
        badge.textContent = 'CNJ válido (20/20)';
        badge.classList.add('is-valid');
    } else {
        badge.textContent = `${digitos}/20 dígitos`;
        badge.classList.add('is-incomplete');
    }
};

const carregarMenorPastaDisponivel = async (exibirFeedback = false) => {
    const inputPasta = document.getElementById('numeroPasta');
    if (!inputPasta) return;

    try {
        const data = await apiFetch('/clientes/proxima-pasta');
        if (data.numeroPasta && Number(data.numeroPasta) > 0) {
            inputPasta.value = data.numeroPasta;
            inputPasta.classList.remove('input-invalid');
            if (exibirFeedback) {
                mostrarToast(`Pasta livre nº ${data.numeroPasta} sugerida.`, 'info');
            }
        }
    } catch (error) {
        console.error('Erro ao buscar menor número de pasta disponível:', error);
    }
};

// Aguarda o DOM carregar para selecionar os elementos
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../auth/';
        return;
    }

    const form = document.getElementById('registerForm');
    const inputProcesso = document.getElementById('numeroProc');
    const inputPasta = document.getElementById('numeroPasta');
    const selectTipo = document.getElementById('tipo');
    const checkConsulta = document.getElementById('consultarProcesso');
    const datajudCard = document.querySelector('.datajud-toggle-card');

    // Remove destaque de erro ao digitar/alterar qualquer campo
    document.querySelectorAll('#registerForm input, #registerForm select, #registerForm textarea').forEach(el => {
        el.addEventListener('input', () => el.classList.remove('input-invalid'));
        el.addEventListener('change', () => el.classList.remove('input-invalid'));
    });

    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            e.target.value = mascaraProcessoCNJ(e.target.value);
            atualizarContadorCNJ();
        });
    }

    if (checkConsulta) {
        checkConsulta.addEventListener('change', () => {
            datajudCard?.classList.toggle('checked', checkConsulta.checked);
            const proc = (inputProcesso?.value || '').replace(/\D/g, '');
            if (checkConsulta.checked && proc.length !== 20) {
                exibirMensagemStatus(
                    'ℹ️ Informe o número completo do processo (20 dígitos padrão CNJ) para sincronizar os dados na API pública do DataJud.',
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

    document.getElementById('btnSugerirPasta')?.addEventListener('click', () => {
        carregarMenorPastaDisponivel(true);
    });

    // Carrega dinamicamente os tipos de processos cadastrados no banco
    await carregarTiposSelect(selectTipo);

    // Modal para criar novo tipo de processo
    document.getElementById('btnNovoTipo')?.addEventListener('click', () => {
        abrirModalNovoTipo((novoTipoNome) => {
            carregarTiposSelect(selectTipo, novoTipoNome);
            selectTipo?.classList.remove('input-invalid');
            mostrarToast(`Categoria "${novoTipoNome}" criada e selecionada!`, 'success');
        });
    });

    // Preenche automaticamente se vier da tela de consulta (?proc=...&acao=...&pasta=...&nome=...)
    const params = new URLSearchParams(window.location.search);
    const procParam = params.get('proc');
    const acaoParam = params.get('acao');
    const pastaParam = params.get('pasta');
    const nomeParam = params.get('nome');

    if (nomeParam) {
        const inputNome = document.getElementById('nome');
        if (inputNome) inputNome.value = nomeParam;
    }

    if (procParam) {
        const procFormatado = mascaraProcessoCNJ(procParam);
        if (inputProcesso) {
            inputProcesso.value = procFormatado;
            atualizarContadorCNJ();
        }

        // Exibe o botão para voltar diretamente ao resultado da consulta deste processo
        const backToConsultLink = document.getElementById('backToConsultLink');
        const backToConsultText = document.getElementById('backToConsultText');
        if (backToConsultLink && backToConsultText) {
            backToConsultLink.href = `../consult/?proc=${encodeURIComponent(procFormatado)}&retornou=1`;
            backToConsultText.textContent = `Voltar para a consulta do processo ${procFormatado}`;
            backToConsultLink.style.display = 'flex';
        }
    }

    if (acaoParam) {
        const inputAcao = document.getElementById('acao');
        if (inputAcao) inputAcao.value = acaoParam;
    }

    // Preserva a pasta sugerida via query string; caso contrário, busca a menor pasta disponível no banco
    if (pastaParam && Number(pastaParam) > 0 && inputPasta) {
        inputPasta.value = Number(pastaParam);
    } else {
        await carregarMenorPastaDisponivel();
    }

    form?.addEventListener('submit', (e) => {
        e.preventDefault();
        salvarRegistro();
    });
});

let registerLoadingInterval = null;
let registerLoadingStartTime = 0;
let ultimoTempoRegistro = null;

const showLoading = (show, comDatajud = false) => {
    const loading = document.getElementById('loading');
    const textEl = document.getElementById('loadingRegisterText');
    const timerEl = document.getElementById('loadingRegisterTimer');
    const saveButton = document.getElementById('saveButton');

    if (show) {
        if (registerLoadingInterval) {
            clearInterval(registerLoadingInterval);
            registerLoadingInterval = null;
        }
        registerLoadingStartTime = performance.now();
        ultimoTempoRegistro = null;

        if (textEl) {
            textEl.textContent = comDatajud
                ? 'Consultando DataJud (CNJ) e salvando pasta...'
                : 'Salvando pasta no sistema...';
        }
        if (timerEl) {
            timerEl.style.display = comDatajud ? 'inline-flex' : 'none';
            timerEl.textContent = '0s';
        }
        if (saveButton) {
            saveButton.disabled = true;
            saveButton.innerHTML = comDatajud
                ? '<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando DataJud... (0s)'
                : '<i class="fa-solid fa-spinner fa-spin"></i> Salvando Registro... (0s)';
        }
        if (loading) loading.classList.add('show');

        registerLoadingInterval = setInterval(() => {
            const segundos = Math.floor((performance.now() - registerLoadingStartTime) / 1000);
            if (timerEl && comDatajud) {
                timerEl.textContent = `${segundos}s`;
            }
            if (saveButton) {
                saveButton.innerHTML = comDatajud
                    ? `<i class="fa-solid fa-spinner fa-spin"></i> Sincronizando DataJud... (${segundos}s)`
                    : `<i class="fa-solid fa-spinner fa-spin"></i> Salvando Registro... (${segundos}s)`;
            }
        }, 200);
        return null;
    } else {
        if (registerLoadingInterval) {
            clearInterval(registerLoadingInterval);
            registerLoadingInterval = null;
        }
        if (registerLoadingStartTime > 0) {
            ultimoTempoRegistro = ((performance.now() - registerLoadingStartTime) / 1000).toFixed(1);
            registerLoadingStartTime = 0;
        }
        if (loading) loading.classList.remove('show');
        if (timerEl) timerEl.style.display = 'none';
        return ultimoTempoRegistro;
    }
};

const salvarRegistro = async () => {
    const inputAcao = document.getElementById('acao');
    const inputNome = document.getElementById('nome');
    const inputPasta = document.getElementById('numeroPasta');
    const selectTipo = document.getElementById('tipo');
    const inputProc = document.getElementById('numeroProc');
    const selectStatus = document.getElementById('status');
    const inputDescricao = document.getElementById('descricao');
    const checkConsulta = document.getElementById('consultarProcesso');
    const saveButton = document.getElementById('saveButton');

    const acao = inputAcao.value.trim();
    const nome = inputNome.value.trim();
    const numeroPasta = inputPasta.value.trim();
    const tipo = selectTipo.value;
    const numeroProc = inputProc.value.trim();
    const status = selectStatus.value;
    const descricao = inputDescricao.value.trim();
    const consultarProcesso = checkConsulta.checked;

    // Validação amigável no cliente antes do envio
    if (!acao) {
        inputAcao.classList.add('input-invalid');
        inputAcao.focus();
        exibirMensagemStatus('❌ Informe a Ação referente a esta pasta.', 'error');
        return;
    }

    if (!nome) {
        inputNome.classList.add('input-invalid');
        inputNome.focus();
        exibirMensagemStatus('❌ Informe o Nome completo do cliente.', 'error');
        return;
    }

    if (!numeroPasta || Number(numeroPasta) <= 0 || !Number.isInteger(Number(numeroPasta))) {
        inputPasta.classList.add('input-invalid');
        inputPasta.focus();
        exibirMensagemStatus('❌ Informe um Número da Pasta inteiro positivo válido.', 'error');
        return;
    }

    if (!tipo) {
        selectTipo.classList.add('input-invalid');
        selectTipo.focus();
        exibirMensagemStatus('❌ Selecione o Tipo de Registro (categoria do processo).', 'error');
        return;
    }

    const procLimpo = (numeroProc || '').replace(/\D/g, '');
    if (numeroProc && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ O Número do Processo informado está incompleto (são necessários os 20 dígitos do padrão CNJ).', 'error');
        return;
    }

    if (consultarProcesso && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ Para sincronizar com o DataJud, informe o número completo do processo (20 dígitos). Caso a pasta ainda não possua processo, desmarque a opção.', 'error');
        return;
    }

    const registro = {
        acao,
        nome,
        numeroPasta,
        tipo,
        numeroProc,
        status,
        consultarProcesso,
        descricao
    };

    try {
        showLoading(true, consultarProcesso);
        exibirMensagemStatus('');

        const data = await apiFetch('/clientes', {
            method: 'POST',
            body: JSON.stringify(registro)
        });

        const tempoDecorrido = showLoading(false);

        inputAcao.value = '';
        inputNome.value = '';
        selectTipo.value = '';
        inputProc.value = '';
        selectStatus.value = 'Ativo';
        checkConsulta.checked = false;
        document.querySelector('.datajud-toggle-card')?.classList.remove('checked');
        inputDescricao.value = '';
        atualizarContadorCNJ();

        await carregarMenorPastaDisponivel();

        if (consultarProcesso && data.processo) {
            const sufixoTempo = tempoDecorrido ? ` em ${tempoDecorrido}s` : '';
            const msg = `✅ Pasta cadastrada! Dados sincronizados com o DataJud${sufixoTempo} (${data.processo.tribunal} - ${data.processo.classe}).`;
            exibirMensagemStatus(msg, 'success');
            mostrarToast(`Pasta registrada e sincronizada com o DataJud${sufixoTempo}!`, 'success');
        } else {
            exibirMensagemStatus('✅ Pasta registrada com sucesso!', 'success');
            mostrarToast('Pasta registrada com sucesso!', 'success');
        }
    } catch (error) {
        console.error('Erro ao salvar registro:', error);
        if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
            return;
        }
        if (error.data?.campoConflito === 'numeroPasta') {
            inputPasta.classList.add('input-invalid');
            inputPasta.focus();
        } else if (error.data?.campoConflito === 'numeroProc') {
            inputProc.classList.add('input-invalid');
            inputProc.focus();
        }
        const msgErro = error.data?.mensagem || 'Erro ao salvar registro. Verifique os dados ou sua conexão.';
        exibirMensagemStatus(`❌ ${msgErro}`, 'error');
        mostrarToast(msgErro, 'error');
    } finally {
        showLoading(false);
        if (saveButton) {
            saveButton.disabled = false;
            saveButton.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Salvar Registro';
        }
    }
};
