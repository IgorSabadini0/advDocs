import { mascaraProcessoCNJ, apiFetch } from '../../../utils/utils.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';

const carregarMenorPastaDisponivel = async () => {
    const inputPasta = document.getElementById('numeroPasta');
    if (!inputPasta) return;

    try {
        const data = await apiFetch('/clientes/proxima-pasta');
        if (data.numeroPasta && Number(data.numeroPasta) > 0) {
            inputPasta.value = data.numeroPasta;
        }
    } catch (error) {
        console.error('Erro ao buscar menor número de pasta disponível:', error);
    }
};

// Aguarda o DOM carregar para selecionar o elemento
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../auth/';
        return;
    }

    const inputProcesso = document.getElementById('numeroProc');
    const inputPasta = document.getElementById('numeroPasta');
    const selectTipo = document.getElementById('tipo');
    const checkConsulta = document.getElementById('consultarProcesso');

    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            e.target.value = mascaraProcessoCNJ(e.target.value);
        });
    }

    if (checkConsulta) {
        checkConsulta.addEventListener('change', () => {
            const proc = (inputProcesso?.value || '').replace(/\D/g, '');
            const statusMessage = document.getElementById('response');
            if (checkConsulta.checked && proc.length !== 20) {
                if (statusMessage) {
                    statusMessage.style.color = '#e0a800';
                    statusMessage.textContent = 'ℹ️ Informe o número do processo (20 dígitos padrão CNJ) para consultar na API pública do DataJud.';
                }
                inputProcesso?.focus();
            } else if (statusMessage && statusMessage.textContent.startsWith('ℹ️')) {
                statusMessage.textContent = '';
            }
        });
    }

    // Carrega dinamicamente os tipos de processos cadastrados no banco
    await carregarTiposSelect(selectTipo);

    // Modal para criar novo tipo de processo
    document.getElementById('btnNovoTipo')?.addEventListener('click', () => {
        abrirModalNovoTipo((novoTipoNome) => {
            carregarTiposSelect(selectTipo, novoTipoNome);
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

    document.getElementById('saveButton')?.addEventListener('click', salvarRegistro);
});

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    if (show) loading.classList.add('show');
    else loading.classList.remove('show');
};

const salvarRegistro = async () => {
    const acao = document.getElementById('acao').value;
    const nome = document.getElementById('nome').value;
    const numeroPasta = document.getElementById('numeroPasta').value;
    const tipo = document.getElementById('tipo').value;
    const numeroProc = document.getElementById('numeroProc').value;
    const status = document.getElementById('status').value;
    const descricao = document.getElementById('descricao').value;
    const consultarProcesso = document.getElementById('consultarProcesso').checked;
    const statusMessage = document.getElementById('response');

    if (consultarProcesso) {
        const procLimpo = (numeroProc || '').replace(/\D/g, '');
        if (procLimpo.length !== 20) {
            statusMessage.style.color = '#dc3545';
            statusMessage.textContent = '❌ Para sincronizar com o DataJud, informe o número completo do processo (20 dígitos). Caso a pasta ainda não possua processo, desmarque a opção.';
            document.getElementById('numeroProc')?.focus();
            return;
        }
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
        showLoading(true);
        const data = await apiFetch('/clientes', {
            method: 'POST',
            body: JSON.stringify(registro)
        });

        statusMessage.textContent = '';
        statusMessage.style.color = '#28a745';

        setTimeout(async () => {
            document.getElementById('acao').value = '';
            document.getElementById('nome').value = '';
            document.getElementById('tipo').value = '';
            document.getElementById('numeroProc').value = '';
            document.getElementById('status').value = 'Ativo';
            document.getElementById('consultarProcesso').checked = false;
            document.getElementById('descricao').value = '';

            // Atualiza o campo com o próximo menor número de pasta disponível (> 0)
            await carregarMenorPastaDisponivel();

            showLoading(false);

            if (consultarProcesso && data.processo) {
                statusMessage.textContent = `✅ Registro salvo! Dados sincronizados com o DataJud (${data.processo.tribunal} - ${data.processo.classe}).`;
            } else {
                statusMessage.textContent = '✅ Registro salvo com sucesso!';
            }
        }, 300);

    } catch (error) {
        showLoading(false);
        console.error('Erro ao salvar registro:', error);
        if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
            return;
        }
        statusMessage.style.color = '#dc3545';
        statusMessage.textContent = error.data?.mensagem || '❌ Erro ao salvar registro. Verifique os dados ou sua conexão.';
    }
};
