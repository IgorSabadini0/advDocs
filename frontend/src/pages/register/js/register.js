import { mascaraProcessoCNJ } from '../../../utils/utils.js';
import { carregarTiposSelect, abrirModalNovoTipo } from '../../../utils/tiposService.js';

const API_URL = window.location.origin;

const carregarMenorPastaDisponivel = async () => {
    const token = localStorage.getItem('token');
    const inputPasta = document.getElementById('numeroPasta');
    if (!token || !inputPasta) return;

    try {
        const response = await fetch(`${API_URL}/clientes/proxima-pasta`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token
            }
        });

        if (response.ok) {
            const data = await response.json();
            if (data.numeroPasta && Number(data.numeroPasta) > 0) {
                inputPasta.value = data.numeroPasta;
            }
        }
    } catch (error) {
        console.error('Erro ao buscar menor número de pasta disponível:', error);
    }
};

// Aguarda o DOM carregar para selecionar o elemento
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '../auth';
        return;
    }

    const inputProcesso = document.getElementById('numeroProc');
    const inputPasta = document.getElementById('numeroPasta');
    const selectTipo = document.getElementById('tipo');

    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            e.target.value = mascaraProcessoCNJ(e.target.value);
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

    if (pastaParam && Number(pastaParam) > 0 && inputPasta) {
        inputPasta.value = Number(pastaParam);
    }

    // Garante que o campo Número da Pasta seja sempre preenchido com o menor número disponível (> 0) no banco
    await carregarMenorPastaDisponivel();

    document.getElementById('saveButton').addEventListener('click', salvarRegistro);
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

    const token = localStorage.getItem('token');

    try {
        showLoading(true);
        const response = await fetch(`${API_URL}/clientes`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': token },
            body: JSON.stringify(registro)
        });

        const statusMessage = document.getElementById('response');

        if (response.ok) {
            const data = await response.json();
            statusMessage.textContent = '';
            statusMessage.style.color = '#28a745';

            setTimeout(async () => {
                document.getElementById('acao').value = '';
                document.getElementById('nome').value = '';
                document.getElementById('tipo').value = '';
                document.getElementById('numeroProc').value = '';
                document.getElementById('status').value = '';
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

        } else {
            showLoading(false);
            statusMessage.style.color = '#dc3545';

            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                window.location.href = '/pages/auth/';
                return;
            }

            if (response.status === 400) {
                const data = await response.json();
                statusMessage.innerHTML = data.mensagem;
            } else {
                statusMessage.innerHTML = '❌ Erro ao salvar registro. Tente novamente.';
            }
        }
    } catch (error) {
        showLoading(false);
        console.error('Erro ao salvar registro:', error);
    }
};
