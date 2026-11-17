import { mascaraProcessoCNJ, mascaraCpfCnpj, mascaraTelefone, escapeHtml, apiFetch, mostrarToast } from '../../../utils/utils.js';
import { extrairSegmentosCNJ } from '../../../utils/cnjParser.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';
import { initThemeManager } from '../../../utils/themeManager.js';
import { initNotificationsWidget, notificarConsultaPendente } from '../../../utils/notificationsWidget.js';

initThemeManager();

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

const processarDeteccaoTribunalCNJ = () => {
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

    if (infoCNJ.tribunal) {
        if (inputTribunal.value.trim() === '' || tribunalPreenchidoAutomaticamente) {
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

    initNotificationsWidget({ onToast: mostrarToast });

    const form = document.getElementById('registerForm');
    const inputProcesso = document.getElementById('numero_processo');
    const inputTribunal = document.getElementById('tribunal');
    const inputCpfCnpj = document.getElementById('cpf_cnpj');
    const inputTelefone = document.getElementById('telefone');
    const inputPasta = document.getElementById('numeroPasta');
    const selectTipo = document.getElementById('tipo_processo_id');
    const checkConsulta = document.getElementById('consultarProcesso');
    const datajudCard = document.querySelector('.datajud-toggle-card');

    // Remove destaque de erro ao digitar/alterar qualquer campo
    document.querySelectorAll('#registerForm input, #registerForm select, #registerForm textarea').forEach(el => {
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
            processarDeteccaoTribunalCNJ();
        };
        inputProcesso.addEventListener('input', handleProcessoChange);
        inputProcesso.addEventListener('blur', handleProcessoChange);
    }

    if (inputTribunal) {
        inputTribunal.addEventListener('input', () => {
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

    const labelTipoIconEl = document.querySelector('label[for="tipo_processo_id"] i');

    // Carrega dinamicamente os tipos de processos cadastrados no banco usando tipo_processo_id como value
    await carregarTiposSelect(selectTipo, null, {
        valueField: 'id',
        iconTargetElement: labelTipoIconEl
    });

    // Modal para criar novo tipo de processo
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
            processarDeteccaoTribunalCNJ();
        }

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
    const inputNome = document.getElementById('nome');
    const inputCpfCnpj = document.getElementById('cpf_cnpj');
    const inputTelefone = document.getElementById('telefone');
    const inputEmail = document.getElementById('email');

    const inputAcao = document.getElementById('acao');
    const inputProc = document.getElementById('numero_processo');
    const inputTribunal = document.getElementById('tribunal');
    const selectTipo = document.getElementById('tipo_processo_id');
    const inputComarcaVara = document.getElementById('comarca_vara');
    const inputParteContraria = document.getElementById('parte_contraria');

    const inputPasta = document.getElementById('numeroPasta');
    const selectStatus = document.getElementById('status_pasta');
    const inputObservacoes = document.getElementById('observacoes');
    const checkConsulta = document.getElementById('consultarProcesso');
    const saveButton = document.getElementById('saveButton');

    const nome = inputNome.value.trim();
    const cpf_cnpj = inputCpfCnpj.value.trim();
    const telefone = inputTelefone.value.trim();
    const email = inputEmail.value.trim();

    const acao = inputAcao.value.trim();
    const numero_processo = inputProc.value.trim();
    const tribunal = inputTribunal.value.trim().toUpperCase();
    const tipo_processo_id = selectTipo.value ? Number(selectTipo.value) : null;
    const selectedOpt = selectTipo.options[selectTipo.selectedIndex];
    const tipo = selectedOpt?.dataset?.nome || '';
    const comarca_vara = inputComarcaVara.value.trim();
    const parte_contraria = inputParteContraria.value.trim();

    const numeroPasta = inputPasta.value.trim();
    const status_pasta = selectStatus.value;
    const observacoes = inputObservacoes.value.trim();
    const consultarProcesso = checkConsulta.checked;

    if (!nome) {
        inputNome.classList.add('input-invalid');
        inputNome.focus();
        exibirMensagemStatus('❌ Informe o Nome Completo ou Razão Social do cliente.', 'error');
        return;
    }

    if (cpf_cnpj) {
        const docDigits = cpf_cnpj.replace(/\D/g, '');
        if (docDigits.length !== 11 && docDigits.length !== 14) {
            inputCpfCnpj.classList.add('input-invalid');
            inputCpfCnpj.focus();
            exibirMensagemStatus('❌ CPF/CNPJ incompleto. Informe 11 dígitos (CPF) ou 14 dígitos (CNPJ).', 'error');
            return;
        }
    }

    if (telefone) {
        const telDigits = telefone.replace(/\D/g, '');
        if (telDigits.length !== 10 && telDigits.length !== 11) {
            inputTelefone.classList.add('input-invalid');
            inputTelefone.focus();
            exibirMensagemStatus('❌ Telefone/WhatsApp inválido. Informe DDD + 8 ou 9 dígitos.', 'error');
            return;
        }
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        inputEmail.classList.add('input-invalid');
        inputEmail.focus();
        exibirMensagemStatus('❌ Informe um endereço de e-mail válido.', 'error');
        return;
    }

    if (!acao) {
        inputAcao.classList.add('input-invalid');
        inputAcao.focus();
        exibirMensagemStatus('❌ Informe a Ação referente a esta pasta.', 'error');
        return;
    }

    const procLimpo = numero_processo.replace(/\D/g, '');
    if (numero_processo && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ O Número do Processo informado está incompleto (são necessários os 20 dígitos do padrão CNJ).', 'error');
        return;
    }

    if (!tipo_processo_id || !tipo) {
        selectTipo.classList.add('input-invalid');
        selectTipo.focus();
        exibirMensagemStatus('❌ Selecione o Tipo de Processo.', 'error');
        return;
    }

    if (!numeroPasta || Number(numeroPasta) <= 0 || !Number.isInteger(Number(numeroPasta))) {
        inputPasta.classList.add('input-invalid');
        inputPasta.focus();
        exibirMensagemStatus('❌ Informe um Número da Pasta inteiro positivo válido.', 'error');
        return;
    }

    if (consultarProcesso && procLimpo.length !== 20) {
        inputProc.classList.add('input-invalid');
        inputProc.focus();
        exibirMensagemStatus('❌ Para sincronizar com o DataJud, informe o número completo do processo (20 dígitos). Caso seja extrajudicial, desmarque a opção.', 'error');
        return;
    }

    const registro = {
        nome,
        cpf_cnpj: cpf_cnpj || null,
        telefone: telefone || null,
        email: email || null,
        acao,
        numero_processo: numero_processo || null,
        numeroProc: numero_processo || null,
        tribunal: tribunal || null,
        tipo_processo_id,
        tipo,
        comarca_vara: comarca_vara || null,
        parte_contraria: parte_contraria || null,
        numeroPasta,
        status_pasta,
        status: status_pasta,
        observacoes: observacoes || null,
        descricao: observacoes || null,
        consultarProcesso
    };

    try {
        showLoading(true, consultarProcesso);
        exibirMensagemStatus('');

        const data = await apiFetch('/clientes', {
            method: 'POST',
            body: JSON.stringify(registro)
        });

        const tempoDecorrido = showLoading(false);

        inputNome.value = '';
        inputCpfCnpj.value = '';
        inputTelefone.value = '';
        inputEmail.value = '';
        inputAcao.value = '';
        inputProc.value = '';
        inputTribunal.value = '';
        tribunalPreenchidoAutomaticamente = false;
        atualizarBadgeTribunal(false);
        selectTipo.value = '';
        inputComarcaVara.value = '';
        inputParteContraria.value = '';
        selectStatus.value = 'Ativo';
        checkConsulta.checked = false;
        document.querySelector('.datajud-toggle-card')?.classList.remove('checked');
        inputObservacoes.value = '';
        processarDeteccaoTribunalCNJ();

        await carregarMenorPastaDisponivel();

        if (data.datajud_status === 'pendente') {
            notificarConsultaPendente();
            const msg = `✅ Pasta cadastrada imediatamente! A consulta ao DataJud foi iniciada em segundo plano — você será notificado ao concluir.`;
            exibirMensagemStatus(msg, 'success');
            mostrarToast('Pasta salva! Consulta DataJud iniciada em segundo plano.', 'info');
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
