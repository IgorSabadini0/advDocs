import {
    verificarAutenticacao,
    sair,
    mascaraProcessoCNJ,
    validarProcessoCNJ,
    identificarTribunalCNJ,
    formatDate,
    formatDateTime,
    escapeHtml
} from '../../../utils/utils.js';

import { showModalAlert } from '../../../components/confirmModal.js';

// --- ESTADO LOCAL DA PÁGINA ---
let dadosProcessoAtual = null;
let movimentacoesAtuais = [];
let numeroProcessoFormatadoAtual = '';

// --- INICIALIZAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    // 1. Verificação de sessão (JWT)
    const token = verificarAutenticacao();
    if (!token) return;

    // 2. Elementos da Interface
    const inputProcesso = document.getElementById('numeroProcesso');
    const formConsulta = document.getElementById('consultForm');
    const clearButton = document.getElementById('clearButton');
    const btnConsultar = document.getElementById('btnConsultar');
    const btnRetry = document.getElementById('btnRetry');
    const btnCopy = document.getElementById('btnCopyNumber');
    const btnCreateFolder = document.getElementById('btnCreateFolder');
    const timelineFilterInput = document.getElementById('timelineFilterInput');

    // Botões de navegação do Header
    document.getElementById('backButton')?.addEventListener('click', () => {
        window.location.href = '/pages/main';
    });

    document.getElementById('addButton')?.addEventListener('click', () => {
        window.location.href = '/pages/register';
    });

    document.getElementById('configButton')?.addEventListener('click', () => {
        window.location.href = '/pages/config';
    });

    document.getElementById('logoutButton')?.addEventListener('click', () => {
        sair();
    });

    // 3. Evento de Input com Máscara e Detecção de Tribunal
    if (inputProcesso) {
        inputProcesso.addEventListener('input', (e) => {
            const valorFormatado = mascaraProcessoCNJ(e.target.value);
            e.target.value = valorFormatado;

            // Exibir/ocultar botão de limpar
            if (clearButton) {
                clearButton.style.display = valorFormatado.length > 0 ? 'flex' : 'none';
            }

            // Identificação dinâmica do tribunal
            atualizarBadgeTribunal(valorFormatado);
        });

        // Permitir busca ao pressionar Enter no input
        inputProcesso.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                executarConsulta();
            }
        });
    }

    // Botão Limpar
    if (clearButton) {
        clearButton.addEventListener('click', () => {
            inputProcesso.value = '';
            clearButton.style.display = 'none';
            atualizarBadgeTribunal('');
            exibirEstado('initial');
            inputProcesso.focus();
        });
    }

    // Submissão do Formulário
    if (formConsulta) {
        formConsulta.addEventListener('submit', (e) => {
            e.preventDefault();
            executarConsulta();
        });
    }

    // Botão Tentar Novamente (no card de erro)
    if (btnRetry) {
        btnRetry.addEventListener('click', () => {
            executarConsulta();
        });
    }

    // Chips de Exemplos Rápidos
    document.querySelectorAll('.example-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const exemplo = chip.getAttribute('data-processo');
            if (exemplo && inputProcesso) {
                inputProcesso.value = mascaraProcessoCNJ(exemplo);
                if (clearButton) clearButton.style.display = 'flex';
                atualizarBadgeTribunal(exemplo);
                executarConsulta();
            }
        });
    });

    // Botão de Copiar Número do Processo
    if (btnCopy) {
        btnCopy.addEventListener('click', copiarNumeroProcesso);
    }

    // Botão de Cadastrar como Nova Pasta
    if (btnCreateFolder) {
        btnCreateFolder.addEventListener('click', redirecionarParaCadastro);
    }

    // Filtro rápido da Linha do Tempo
    if (timelineFilterInput) {
        timelineFilterInput.addEventListener('input', (e) => {
            filtrarMovimentacoes(e.target.value);
        });
    }

    // Verifica se veio número na query string da URL (ex: ?proc=...)
    const urlParams = new URLSearchParams(window.location.search);
    const procParam = urlParams.get('proc');
    if (procParam && inputProcesso) {
        inputProcesso.value = mascaraProcessoCNJ(procParam);
        if (clearButton) clearButton.style.display = 'flex';
        atualizarBadgeTribunal(procParam);
        executarConsulta();
    }
});

// --- CONTROLE DE ESTADOS VISUAIS ---
const exibirEstado = (estado) => {
    const initialState = document.getElementById('initialState');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');
    const errorState = document.getElementById('errorState');
    const resultsWrapper = document.getElementById('resultsWrapper');

    if (initialState) initialState.style.display = estado === 'initial' ? 'flex' : 'none';
    if (loadingState) loadingState.style.display = estado === 'loading' ? 'flex' : 'none';
    if (emptyState) emptyState.style.display = estado === 'empty' ? 'flex' : 'none';
    if (errorState) errorState.style.display = estado === 'error' ? 'flex' : 'none';
    if (resultsWrapper) resultsWrapper.style.display = estado === 'results' ? 'flex' : 'none';
};

// --- ATUALIZAÇÃO DO BADGE DE TRIBUNAL DETECTADO ---
const atualizarBadgeTribunal = (valor) => {
    const badge = document.getElementById('tribunalBadge');
    const text = document.getElementById('tribunalText');
    if (!badge || !text) return;

    const info = identificarTribunalCNJ(valor);
    if (info) {
        text.textContent = `${info.nome} (${info.sigla})`;
        badge.style.display = 'inline-flex';
    } else {
        badge.style.display = 'none';
    }
};

// --- CONTROLE DO BOTÃO DE BUSCA (SPINNER/LOADING) ---
const alternarCarregamentoBotao = (carregando) => {
    const btn = document.getElementById('btnConsultar');
    if (!btn) return;

    const icon = btn.querySelector('.btn-icon');
    const text = btn.querySelector('.btn-text');
    const spinner = btn.querySelector('.btn-spinner');

    if (carregando) {
        btn.disabled = true;
        if (icon) icon.style.display = 'none';
        if (text) text.textContent = 'Consultando DataJud...';
        if (spinner) spinner.style.display = 'block';
    } else {
        btn.disabled = false;
        if (icon) icon.style.display = 'inline-block';
        if (text) text.textContent = 'Consultar Processo';
        if (spinner) spinner.style.display = 'none';
    }
};

// --- CONSULTA ASSÍNCRONA NA API ---
const executarConsulta = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        showModalAlert({
            title: 'Sessão Expirada',
            message: 'Sua sessão expirou. Você será redirecionado para o login.',
            type: 'warning'
        });
        setTimeout(() => sair(), 1500);
        return;
    }

    const inputProcesso = document.getElementById('numeroProcesso');
    const valorOriginal = inputProcesso ? inputProcesso.value.trim() : '';
    const numeroLimpo = valorOriginal.replace(/\D/g, '');

    // Validação inicial antes de fazer a chamada
    if (!numeroLimpo) {
        showModalAlert({
            title: 'Campo Obrigatório',
            message: 'Por favor, informe o número do processo para realizar a consulta.',
            type: 'warning'
        });
        inputProcesso?.focus();
        return;
    }

    if (!validarProcessoCNJ(numeroLimpo)) {
        showModalAlert({
            title: 'Formato CNJ Inválido',
            message: 'O número informado deve conter exatamente 20 dígitos numéricos no padrão CNJ (ex: 0000000-00.0000.0.00.0000).',
            type: 'error'
        });
        return;
    }

    const infoTribunal = identificarTribunalCNJ(numeroLimpo);
    const loadingCourtText = document.getElementById('loadingCourtText');
    if (loadingCourtText) {
        if (infoTribunal) {
            loadingCourtText.textContent = `Acessando a base de dados do ${infoTribunal.nome} (${infoTribunal.sigla}) via DataJud...`;
        } else {
            loadingCourtText.textContent = 'Comunicando com os servidores do CNJ e consolidando o histórico processual...';
        }
    }

    // Exibe estado de loading
    alternarCarregamentoBotao(true);
    exibirEstado('loading');

    try {
        const apiUrl = `${window.location.origin}/processos/consultar/${numeroLimpo}`;
        const response = await fetch(apiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        // 1. Não autorizado ou Token Inválido/Expirado
        if (response.status === 401 || response.status === 403) {
            alternarCarregamentoBotao(false);
            showModalAlert({
                title: 'Acesso Não Autorizado',
                message: 'Sua sessão é inválida ou expirou. Por favor, faça login novamente.',
                type: 'error'
            });
            setTimeout(() => sair(), 1800);
            return;
        }

        // 2. Parâmetro inválido (400)
        if (response.status === 400) {
            const erroData = await response.json().catch(() => ({}));
            alternarCarregamentoBotao(false);
            exibirEstado('initial');
            showModalAlert({
                title: 'Dados Inválidos',
                message: erroData.mensagem || 'Número de processo fora do padrão esperado.',
                type: 'warning'
            });
            return;
        }

        // 3. Processo não encontrado (404)
        if (response.status === 404) {
            const erroData = await response.json().catch(() => ({}));
            alternarCarregamentoBotao(false);
            
            const emptyMessage = document.getElementById('emptyMessage');
            if (emptyMessage) {
                if (erroData.tribunalNome) {
                    emptyMessage.textContent = `Nenhum processo foi localizado com o número informado na base do ${erroData.tribunalNome} (${erroData.tribunal}).`;
                } else {
                    emptyMessage.textContent = erroData.mensagem || 'Nenhum processo localizado na base do tribunal para o número informado.';
                }
            }
            exibirEstado('empty');
            return;
        }

        // 4. Erro de Servidor / Timeout (500 / 504)
        if (!response.ok) {
            const erroData = await response.json().catch(() => ({}));
            alternarCarregamentoBotao(false);
            
            const errorMessage = document.getElementById('errorMessage');
            if (errorMessage) {
                errorMessage.textContent = erroData.mensagem || `Falha na consulta ao tribunal (Código ${response.status}).`;
            }
            exibirEstado('error');
            return;
        }

        // 5. Sucesso (200 OK)
        const dadosProcesso = await response.json();
        dadosProcessoAtual = dadosProcesso;
        numeroProcessoFormatadoAtual = mascaraProcessoCNJ(numeroLimpo);

        renderizarProcesso(dadosProcesso);
        exibirEstado('results');

    } catch (error) {
        console.error('Erro de rede ou execução ao consultar processo:', error);
        alternarCarregamentoBotao(false);
        
        const errorMessage = document.getElementById('errorMessage');
        if (errorMessage) {
            errorMessage.textContent = 'Não foi possível conectar ao servidor. Verifique sua conexão com a internet ou tente novamente em instantes.';
        }
        exibirEstado('error');
    } finally {
        alternarCarregamentoBotao(false);
    }
};

// --- RENDERIZAÇÃO DOS DADOS DO PROCESSO ---
const renderizarProcesso = (dados) => {
    if (!dados) return;

    // 1. Identificação Principal
    const elNumero = document.getElementById('resNumeroProcesso');
    if (elNumero) {
        elNumero.textContent = numeroProcessoFormatadoAtual || mascaraProcessoCNJ(dados.numeroProcesso);
    }

    // 2. Badges de Metadados
    const siglaTribunal = dados.tribunalInfo?.sigla || dados.tribunal || 'TJ';
    const nomeTribunal = dados.tribunalInfo?.nome || dados.tribunal || 'Tribunal de Justiça';
    
    const badgeTribunal = document.getElementById('badgeTribunal');
    if (badgeTribunal) badgeTribunal.textContent = siglaTribunal;

    const badgeGrau = document.getElementById('badgeGrau');
    if (badgeGrau) {
        badgeGrau.textContent = dados.grau === 'G1' ? '1º Grau' : dados.grau === 'G2' ? '2º Grau' : (dados.grau || 'Instância Geral');
    }

    const badgeSistema = document.getElementById('badgeSistema');
    if (badgeSistema) {
        badgeSistema.textContent = dados.sistema?.nome || 'Processo Eletrônico';
    }

    const badgeFormato = document.getElementById('badgeFormato');
    if (badgeFormato) {
        badgeFormato.textContent = dados.formato?.nome || 'Digital';
    }

    // Inferência amigável do status a partir dos movimentos
    const badgeStatus = document.getElementById('badgeStatus');
    const statusProcesso = inferirStatusProcessual(dados);
    if (badgeStatus) {
        badgeStatus.textContent = statusProcesso.texto;
        badgeStatus.style.background = statusProcesso.bg;
        badgeStatus.style.color = statusProcesso.cor;
        badgeStatus.style.borderColor = statusProcesso.border;
    }

    // 3. Grid de Resumo
    const infoTribunal = document.getElementById('infoTribunal');
    if (infoTribunal) infoTribunal.textContent = `${nomeTribunal} (${siglaTribunal})`;

    const infoClasse = document.getElementById('infoClasse');
    if (infoClasse) {
        const nomeClasse = dados.classe?.nome || 'Não informada';
        const codClasse = dados.classe?.codigo ? ` [Cód. ${dados.classe.codigo}]` : '';
        infoClasse.textContent = `${nomeClasse}${codClasse}`;
    }

    const infoAssunto = document.getElementById('infoAssunto');
    if (infoAssunto) {
        if (Array.isArray(dados.assuntos) && dados.assuntos.length > 0) {
            const principal = dados.assuntos.find(a => a.nome) || dados.assuntos[0];
            const nomeAssunto = principal.nome || `Código ${principal.codigo}`;
            infoAssunto.textContent = nomeAssunto;
        } else {
            infoAssunto.textContent = 'Não especificado';
        }
    }

    const infoOrgaoJulgador = document.getElementById('infoOrgaoJulgador');
    if (infoOrgaoJulgador) {
        infoOrgaoJulgador.textContent = dados.orgaoJulgador?.nome || 'Não informado';
    }

    const infoDataDistribuicao = document.getElementById('infoDataDistribuicao');
    if (infoDataDistribuicao) {
        infoDataDistribuicao.textContent = formatDate(dados.dataAjuizamento);
    }

    const infoDataAtualizacao = document.getElementById('infoDataAtualizacao');
    if (infoDataAtualizacao) {
        const ultimaData = dados.dataHoraUltimaAtualizacao || dados['@timestamp'];
        infoDataAtualizacao.textContent = formatDateTime(ultimaData);
    }

    // 4. Preparação e Renderização das Movimentações (Timeline)
    const movimentosOriginais = Array.isArray(dados.movimentos) ? [...dados.movimentos] : [];
    
    // Ordenação garantida: da mais recente para a mais antiga
    movimentosOriginais.sort((a, b) => {
        const timeA = a.dataHora ? new Date(a.dataHora).getTime() : 0;
        const timeB = b.dataHora ? new Date(b.dataHora).getTime() : 0;
        return timeB - timeA;
    });

    movimentacoesAtuais = movimentosOriginais;
    
    // Limpa campo de filtro e renderiza a lista completa
    const filterInput = document.getElementById('timelineFilterInput');
    if (filterInput) filterInput.value = '';

    renderizarTimeline(movimentacoesAtuais);
};

// --- INFERÊNCIA DO STATUS PROCESSUAL ---
const inferirStatusProcessual = (dados) => {
    const movimentos = dados.movimentos || [];
    const nomesMovimentos = movimentos.map(m => (m.nome || '').toLowerCase()).join(' ');

    if (nomesMovimentos.includes('baixa definitiva') || nomesMovimentos.includes('arquivado definitivamente')) {
        return {
            texto: 'Baixado / Arquivado',
            bg: 'rgba(239, 68, 68, 0.15)',
            cor: '#f87171',
            border: 'rgba(239, 68, 68, 0.3)'
        };
    }

    if (nomesMovimentos.includes('trânsito em julgado') || nomesMovimentos.includes('transitado em julgado')) {
        return {
            texto: 'Transitado em Julgado',
            bg: 'rgba(245, 158, 11, 0.15)',
            cor: '#fbbf24',
            border: 'rgba(245, 158, 11, 0.3)'
        };
    }

    return {
        texto: 'Em Tramitação / Ativo',
        bg: 'rgba(16, 185, 129, 0.15)',
        cor: '#6ee7b7',
        border: 'rgba(16, 185, 129, 0.3)'
    };
};

// --- RENDERIZAÇÃO DA LINHA DO TEMPO DE MOVIMENTAÇÕES ---
const renderizarTimeline = (movimentos) => {
    const timelineList = document.getElementById('timelineList');
    const timelineCount = document.getElementById('timelineCount');
    const timelineEmpty = document.getElementById('timelineFilterEmpty');

    if (!timelineList || !timelineCount) return;

    timelineCount.textContent = `${movimentos.length} movimentaç${movimentos.length === 1 ? 'ão' : 'ões'}`;

    if (movimentos.length === 0) {
        timelineList.innerHTML = '';
        if (timelineEmpty) timelineEmpty.style.display = 'block';
        return;
    }

    if (timelineEmpty) timelineEmpty.style.display = 'none';

    const htmlItens = movimentos.map((mov, index) => {
        const isLatest = index === 0;
        const dataFormatada = formatDateTime(mov.dataHora);
        const nomeMovimento = escapeHtml(mov.nome || 'Movimentação sem descrição');
        
        // Formata complementos tabelados se houver
        let complementosHtml = '';
        if (Array.isArray(mov.complementosTabelados) && mov.complementosTabelados.length > 0) {
            const tags = mov.complementosTabelados
                .filter(c => c.nome || c.descricao)
                .map(c => {
                    const rotulo = c.descricao ? `<strong>${escapeHtml(c.descricao)}:</strong> ` : '';
                    const valor = escapeHtml(c.nome || c.valor || '');
                    return `<span class="detail-tag">${rotulo}${valor}</span>`;
                })
                .join('');
            
            if (tags) {
                complementosHtml = `<div class="timeline-details">${tags}</div>`;
            }
        }

        // Órgão julgador da movimentação se houver
        let orgaoHtml = '';
        if (mov.orgaoJulgador?.nome) {
            orgaoHtml = `
                <div class="timeline-orgao">
                    <i class="fa-solid fa-gavel"></i>
                    <span>${escapeHtml(mov.orgaoJulgador.nome)}</span>
                </div>
            `;
        }

        return `
            <div class="timeline-item ${isLatest ? 'latest' : ''}">
                <div class="timeline-dot"></div>
                <div class="timeline-meta">
                    <div class="timeline-date">
                        <i class="fa-regular fa-clock"></i>
                        <span>${dataFormatada}</span>
                    </div>
                    ${isLatest ? '<span class="timeline-badge-latest">Última Movimentação</span>' : ''}
                </div>
                <h4 class="timeline-title">${nomeMovimento}</h4>
                ${complementosHtml}
                ${orgaoHtml}
            </div>
        `;
    }).join('');

    timelineList.innerHTML = htmlItens;
};

// --- FILTRO DE MOVIMENTAÇÕES EM TEMPO REAL ---
const filtrarMovimentacoes = (termo) => {
    if (!termo || !termo.trim()) {
        renderizarTimeline(movimentacoesAtuais);
        return;
    }

    const termoBusca = termo.trim().toLowerCase();

    const filtrados = movimentacoesAtuais.filter(mov => {
        const nome = (mov.nome || '').toLowerCase();
        const orgao = (mov.orgaoJulgador?.nome || '').toLowerCase();
        
        let complementosTexto = '';
        if (Array.isArray(mov.complementosTabelados)) {
            complementosTexto = mov.complementosTabelados
                .map(c => `${c.descricao || ''} ${c.nome || ''}`)
                .join(' ')
                .toLowerCase();
        }

        return nome.includes(termoBusca) || orgao.includes(termoBusca) || complementosTexto.includes(termoBusca);
    });

    renderizarTimeline(filtrados);
};

// --- COPIAR NÚMERO DO PROCESSO ---
const copiarNumeroProcesso = () => {
    if (!numeroProcessoFormatadoAtual) return;

    navigator.clipboard.writeText(numeroProcessoFormatadoAtual).then(() => {
        const btn = document.getElementById('btnCopyNumber');
        if (!btn) return;

        const tooltip = btn.querySelector('.copy-tooltip');
        const originalText = tooltip ? tooltip.textContent : 'Copiar';

        if (tooltip) tooltip.textContent = 'Copiado!';
        btn.style.color = 'var(--success, #10b981)';
        btn.style.borderColor = 'var(--success, #10b981)';

        setTimeout(() => {
            if (tooltip) tooltip.textContent = originalText;
            btn.style.color = '';
            btn.style.borderColor = '';
        }, 2000);
    }).catch(err => {
        console.error('Falha ao copiar:', err);
    });
};

// --- ATALHO PARA CADASTRO DE NOVA PASTA ---
const redirecionarParaCadastro = () => {
    if (!numeroProcessoFormatadoAtual) return;

    const classe = dadosProcessoAtual?.classe?.nome || '';
    const params = new URLSearchParams();
    params.set('proc', numeroProcessoFormatadoAtual);
    if (classe) params.set('acao', classe);

    window.location.href = `/pages/register?${params.toString()}`;
};
