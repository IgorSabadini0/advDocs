import {
    escapeHtml,
    formatDate,
    formatDateTime,
    mascaraProcessoCNJ,
    normalizeText,
    apiFetch,
    mostrarToast,
    resolverSeloSincronizacao,
    abrirPdfDocumentoAutenticado,
    baixarDocumentoMniSobDemanda
} from '../../../utils/utils.js';
import { initThemeManager } from '../../../utils/themeManager.js';
import { initNotificationsWidget } from '../../../utils/notificationsWidget.js';
import { resolverIconeTipo, buscarTiposProcesso } from '../../../utils/tiposService.js';

initThemeManager();

let processoAtual = null;
let instanciaSelecionadaIndex = 0;
let loadingInterval = null;
let loadingStartTime = 0;
let ultimoTempoConsulta = null;

const showLoading = (show) => {
    const loading = document.getElementById('loading');
    const btn = document.getElementById('btnConsultar');
    const timerEl = document.getElementById('loadingTimer');
    const subhintEl = document.getElementById('loadingSubhint');

    if (show) {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
        loadingStartTime = performance.now();
        ultimoTempoConsulta = null;

        if (timerEl) timerEl.textContent = '0s';
        if (subhintEl) subhintEl.textContent = 'A resposta depende da disponibilidade do tribunal no CNJ.';
        if (loading) loading.classList.add('show');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando... (0s)';
        }

        loadingInterval = setInterval(() => {
            const segundos = Math.floor((performance.now() - loadingStartTime) / 1000);
            if (timerEl) timerEl.textContent = `${segundos}s`;
            if (btn) btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Consultando... (${segundos}s)`;
            if (subhintEl && segundos >= 10) {
                subhintEl.textContent = 'O tribunal está demorando um pouco mais para responder. Aguardando retorno do CNJ...';
            }
        }, 200);
    } else {
        if (loadingInterval) {
            clearInterval(loadingInterval);
            loadingInterval = null;
        }
        if (loadingStartTime > 0) {
            ultimoTempoConsulta = ((performance.now() - loadingStartTime) / 1000).toFixed(1);
            loadingStartTime = 0;
        }
        if (loading) loading.classList.remove('show');
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Consultar Processo';
        }
    }
};

const showEmpty = (mensagem) => {
    const emptyState = document.getElementById('emptyState');
    const emptyMessage = document.getElementById('emptyMessage');
    const resultadoContainer = document.getElementById('resultadoContainer');

    resultadoContainer.style.display = 'none';
    emptyMessage.textContent = mensagem;
    emptyState.style.display = 'flex';
};

const hideEmpty = () => {
    document.getElementById('emptyState').style.display = 'none';
};

const renderizarPastaVinculada = (pastaVinculada, numeroFormatado, classeProcessual, menorPastaDisponivel, autorProcesso) => {
    const container = document.getElementById('pastaVinculadaContainer');

    if (pastaVinculada) {
        const iconeTipo = resolverIconeTipo(pastaVinculada.tipo, pastaVinculada.tipo_icone);
        container.innerHTML = `
            <div class="folder-banner linked">
                <div class="folder-banner-info">
                    <div class="folder-banner-icon">
                        <i class="${escapeHtml(iconeTipo)}"></i>
                    </div>
                    <div class="folder-banner-text">
                        <h3>Pasta Vinculada no Escritório: Nº ${escapeHtml(pastaVinculada.numeroPasta)} — ${escapeHtml(pastaVinculada.nome)}</h3>
                        <p>
                            <strong>Ação:</strong> ${escapeHtml(pastaVinculada.acao || 'N/A')} &bull;
                            <strong>Categoria:</strong> <i class="${escapeHtml(iconeTipo)}" style="color: var(--brand-gold); margin: 0 3px;"></i> ${escapeHtml(pastaVinculada.tipo || 'N/A')} &bull;
                            <strong>Status:</strong> ${escapeHtml(pastaVinculada.status)}
                        </p>
                    </div>
                </div>
                <button class="btn-view" id="btnEditarPastaVinculada">
                    <i class="fa-solid fa-pen-to-square"></i> Editar Pasta
                </button>
            </div>
        `;

        document.getElementById('btnEditarPastaVinculada')?.addEventListener('click', () => {
            sessionStorage.setItem('itemEmEdicao', JSON.stringify(pastaVinculada));
            window.location.href = '/pages/edit/';
        });
    } else {
        const params = new URLSearchParams({
            proc: numeroFormatado,
            origem: 'consulta'
        });
        if (classeProcessual && classeProcessual !== 'Não informada') {
            params.set('acao', classeProcessual);
        }
        if (menorPastaDisponivel) {
            params.set('pasta', String(menorPastaDisponivel));
        }
        if (autorProcesso) {
            params.set('nome', autorProcesso);
        }

        container.innerHTML = `
            <div class="folder-banner">
                <div class="folder-banner-info">
                    <div class="folder-banner-icon">
                        <i class="fa-solid fa-folder-plus"></i>
                    </div>
                    <div class="folder-banner-text">
                        <h3>Processo ainda não vinculado a uma pasta</h3>
                        <p>Deseja cadastrar uma nova pasta no sistema com os dados deste processo?${menorPastaDisponivel ? ` (Pasta livre sugerida: <strong>Nº ${escapeHtml(menorPastaDisponivel)}</strong>)` : ''}</p>
                    </div>
                </div>
                <a href="/pages/register/?${params.toString()}" class="btn-view" style="text-decoration: none;">
                    <i class="fa-solid fa-plus"></i> Cadastrar Pasta
                </a>
            </div>
        `;
    }
};

const renderizarMovimentacoes = (movimentos, filtroTexto = '') => {
    const timelineList = document.getElementById('timelineList');
    if (!timelineList) return;

    const query = normalizeText(filtroTexto);
    const filtrados = movimentos.filter(m => {
        if (!query) return true;
        const matchNome = normalizeText(m.nome).includes(query);
        const matchComp = (m.complementos || []).some(c =>
            normalizeText(c.nome).includes(query) || normalizeText(c.descricao).includes(query)
        );
        return matchNome || matchComp;
    });

    if (filtrados.length === 0) {
        timelineList.innerHTML = `
            <div class="timeline-item">
                <span class="timeline-complementos">Nenhuma movimentação encontrada para o filtro informado.</span>
            </div>
        `;
        return;
    }

    timelineList.innerHTML = filtrados.map(mov => {
        const complementosHtml = (mov.complementos && mov.complementos.length > 0)
            ? `<div class="timeline-complementos">${mov.complementos.map(c => `${escapeHtml(c.nome)}${c.descricao ? `: ${escapeHtml(c.descricao)}` : ''}`).join(' | ')}</div>`
            : '';

        return `
            <div class="timeline-item">
                <div class="timeline-item-top">
                    <span class="timeline-title">${escapeHtml(mov.nome)}</span>
                    <span class="timeline-date">
                        <i class="fa-regular fa-clock"></i> ${escapeHtml(formatDateTime(mov.dataHora) || 'Data não informada')}
                    </span>
                </div>
                ${complementosHtml}
            </div>
        `;
    }).join('');
};

const renderizarDadosProcesso = (processo, aviso) => {
    const container = document.getElementById('dadosProcessoContainer');

    if (!processo) {
        container.innerHTML = `
            <div class="process-card">
                <p style="color: var(--text-secondary);">
                    ${escapeHtml(aviso || 'Este processo está cadastrado no escritório, mas não retornou registros públicos na base do DataJud.')}
                </p>
            </div>
        `;
        return;
    }

    const instancias = Array.isArray(processo.instancias) && processo.instancias.length > 0
        ? processo.instancias
        : [processo];

    const dadosAtivos = instancias[instanciaSelecionadaIndex] || processo;
    const numFormatado = mascaraProcessoCNJ(dadosAtivos.numeroProcesso);

    const tabsInstanciasHtml = instancias.length > 1
        ? `
            <div class="instancias-tabs">
                ${instancias.map((inst, idx) => `
                    <button type="button" class="instancia-btn ${idx === instanciaSelecionadaIndex ? 'active' : ''}" data-idx="${idx}">
                        ${escapeHtml(inst.grau || `${idx + 1}ª Instância`)} - ${escapeHtml(inst.orgaoJulgador)}
                    </button>
                `).join('')}
            </div>
        `
        : '';

    const assuntosHtml = (dadosAtivos.assuntos && dadosAtivos.assuntos.length > 0)
        ? dadosAtivos.assuntos.map(a => `<span class="assunto-tag">${escapeHtml(a)}</span>`).join('')
        : `<span class="assunto-tag">Assunto não informado</span>`;

    container.innerHTML = `
        <div class="process-card">
            ${tabsInstanciasHtml}

            <div class="process-header">
                <div class="process-title-group">
                    <h2>${escapeHtml(numFormatado)}</h2>
                    <p>${escapeHtml(dadosAtivos.classe)}</p>
                </div>
                <div class="process-badges">
                    <span class="proc-badge gold">${escapeHtml(dadosAtivos.tribunal)}</span>
                    <span class="proc-badge">Grau: ${escapeHtml(dadosAtivos.grau)}</span>
                    <span class="proc-badge">${escapeHtml(dadosAtivos.formato)}</span>
                    ${ultimoTempoConsulta ? `<span class="proc-badge time-badge" title="Tempo de resposta da consulta"><i class="fa-solid fa-bolt"></i> ${escapeHtml(ultimoTempoConsulta)}s</span>` : ''}
                </div>
            </div>

            <div class="process-grid">
                <div class="process-info-box">
                    <span class="label">Polo Ativo (Autor)</span>
                    <strong class="value">${escapeHtml(dadosAtivos.autor || 'Não divulgado na API pública (LGPD)')}</strong>
                </div>
                ${dadosAtivos.reu ? `
                <div class="process-info-box">
                    <span class="label">Polo Passivo (Réu)</span>
                    <strong class="value">${escapeHtml(dadosAtivos.reu)}</strong>
                </div>` : ''}
                <div class="process-info-box">
                    <span class="label">Órgão Julgador</span>
                    <strong class="value">${escapeHtml(dadosAtivos.orgaoJulgador)}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Data de Ajuizamento</span>
                    <strong class="value">${escapeHtml(formatDate(dadosAtivos.dataAjuizamento) || 'Não informada')}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Última Atualização</span>
                    <strong class="value">${escapeHtml(formatDateTime(dadosAtivos.dataHoraUltimaAtualizacao) || 'Não informada')}</strong>
                </div>
                <div class="process-info-box">
                    <span class="label">Sistema Processual</span>
                    <strong class="value">${escapeHtml(dadosAtivos.sistema)}</strong>
                </div>
            </div>

            <div class="assuntos-section">
                <h3><i class="fa-solid fa-tags"></i> Assuntos do Processo</h3>
                <div class="assuntos-list">
                    ${assuntosHtml}
                </div>
            </div>

            <div class="consult-hybrid-panel" id="consultHybridPanel">
                <div class="modal-hybrid-toolbar">
                    <div class="modal-hybrid-badges">
                        <span id="consultSyncBadge" class="sync-status-badge pendente">
                            <i class="fa-solid fa-clock"></i> MONITORAMENTO
                        </span>
                        <span id="consultUnreadBadge" class="unread-movs-pill" style="display: none;"></span>
                    </div>
                    <div class="modal-hybrid-actions">
                        <button type="button" class="btn-sync-now" id="consultSyncNowBtn">
                            <i class="fa-solid fa-arrows-rotate"></i> Atualizar Agora
                        </button>
                        <button type="button" class="btn-mark-read-movs" id="consultMarkReadBtn" style="display: none;">
                            <i class="fa-solid fa-check-double"></i> Marcar movimentações como lidas
                        </button>
                    </div>
                </div>
                <div id="consultDocsListContainer"></div>
            </div>

            <div class="timeline-section">
                <div class="timeline-header">
                    <h3>
                        <i class="fa-solid fa-list-check"></i>
                        Movimentações Processuais (${dadosAtivos.movimentos?.length || 0})
                    </h3>
                    <input type="text" id="filtroMovimentos" class="timeline-search" placeholder="Filtrar movimentações (ex: Sentença, Conclusos)...">
                </div>
                <div class="timeline-list" id="timelineList"></div>
            </div>
        </div>
    `;

    renderizarMovimentacoes(dadosAtivos.movimentos || []);

    const inputFiltroMov = document.getElementById('filtroMovimentos');
    if (inputFiltroMov) {
        inputFiltroMov.addEventListener('input', (e) => {
            renderizarMovimentacoes(dadosAtivos.movimentos || [], e.target.value);
        });
    }

    container.querySelectorAll('.instancia-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            instanciaSelecionadaIndex = Number(btn.dataset.idx);
            renderizarDadosProcesso(processo, aviso);
        });
    });

    // Painel de monitoramento híbrido e download de peças MNI na tela de Consulta
    const procDigitos = String(dadosAtivos.numeroProcesso || '').replace(/\D/g, '');
    const syncBadge = document.getElementById('consultSyncBadge');
    const unreadBadge = document.getElementById('consultUnreadBadge');
    const docsContainer = document.getElementById('consultDocsListContainer');
    const syncNowBtn = document.getElementById('consultSyncNowBtn');
    const markReadBtn = document.getElementById('consultMarkReadBtn');
    let procSyncId = null;

    const carregarPainelHibridoConsulta = async () => {
        if (procDigitos.length !== 20) return;
        try {
            const dados = await apiFetch(`/api/processos/cnj/${encodeURIComponent(procDigitos)}/status-sincronizacao`);
            if (!dados?.processo) return;
            procSyncId = dados.processo.id;

            const badgeInfo = resolverSeloSincronizacao(dados.processo.status_sincronizacao);
            if (syncBadge && badgeInfo) {
                syncBadge.className = `sync-status-badge ${badgeInfo.cls}`;
                syncBadge.innerHTML = `<i class="fa-solid ${badgeInfo.icon}"></i> ${badgeInfo.label}`;
            }

            const naoLidos = Number(dados.nao_lidos || 0);
            if (unreadBadge) {
                unreadBadge.style.display = naoLidos > 0 ? 'inline-flex' : 'none';
                unreadBadge.innerHTML = `<i class="fa-solid fa-bell"></i> ${naoLidos} nova(s) movimentação(ões)`;
            }
            if (markReadBtn) {
                markReadBtn.style.display = naoLidos > 0 ? 'inline-flex' : 'none';
            }

            const docs = Array.isArray(dados.documentos) ? dados.documentos : [];
            if (docsContainer) {
                docsContainer.innerHTML = docs.length > 0 ? `
                    <div class="modal-docs-list">
                        ${docs.map(doc => `
                            <div class="modal-doc-row">
                                <div class="modal-doc-info">
                                    <strong>${escapeHtml(doc.tipo_documento || 'Documento MNI')}${doc.descricao ? ` — ${escapeHtml(doc.descricao)}` : ''}</strong>
                                    <small>ID: ${escapeHtml(doc.id_documento_tribunal)} &bull; ${escapeHtml(doc.instancia || '1G')}</small>
                                </div>
                                <button type="button"
                                    class="btn-download-pdf"
                                    data-consult-download-doc="${escapeHtml(doc.id)}"
                                    data-instancia="${escapeHtml(doc.instancia || '1G')}"
                                    data-baixado="${doc.baixado ? '1' : '0'}">
                                    <i class="fa-solid ${doc.baixado ? 'fa-file-pdf' : 'fa-download'}"></i>
                                    ${doc.baixado ? 'Abrir PDF' : 'Baixar PDF'}
                                </button>
                            </div>
                        `).join('')}
                    </div>
                ` : '';

                docsContainer.querySelectorAll('[data-consult-download-doc]').forEach(btn => {
                    btn.addEventListener('click', async () => {
                        if (!procSyncId) return;
                        const docId = btn.dataset.consultDownloadDoc;
                        const inst = btn.dataset.instancia || '1G';
                        const baixado = btn.dataset.baixado === '1';
                        const orig = btn.innerHTML;
                        btn.disabled = true;

                        try {
                            if (baixado) {
                                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Abrindo...';
                                await abrirPdfDocumentoAutenticado(procSyncId, docId, mostrarToast);
                            } else {
                                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Baixando...';
                                const resDl = await baixarDocumentoMniSobDemanda({ processoId: procSyncId, docId, instancia: inst });
                                if (resDl.concluido) {
                                    btn.dataset.baixado = '1';
                                    btn.innerHTML = '<i class="fa-solid fa-file-pdf"></i> Abrir PDF';
                                    await abrirPdfDocumentoAutenticado(procSyncId, docId, mostrarToast);
                                } else {
                                    mostrarToast('Download enfileirado via MNI. Tente abrir em instantes.', 'info');
                                }
                            }
                        } catch (err) {
                            mostrarToast(err.message || 'Falha ao baixar PDF.', 'error');
                        } finally {
                            btn.disabled = false;
                            if (btn.dataset.baixado !== '1') btn.innerHTML = orig;
                        }
                    });
                });
            }
        } catch {
            // Silencioso caso ainda não sincronizado
        }
    };

    carregarPainelHibridoConsulta();

    if (syncNowBtn && procDigitos.length === 20) {
        syncNowBtn.addEventListener('click', async () => {
            const orig = syncNowBtn.innerHTML;
            syncNowBtn.disabled = true;
            syncNowBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Enfileirando...';
            try {
                const resp = await apiFetch('/api/processos/sincronizar', {
                    method: 'POST',
                    body: JSON.stringify({ numero_cnj: procDigitos })
                });
                procSyncId = resp.processo_id;
                mostrarToast('Atualização enfileirada no motor híbrido!', 'info');
                setTimeout(carregarPainelHibridoConsulta, 800);
            } catch (err) {
                mostrarToast(err.data?.mensagem || 'Erro ao enfileirar atualização.', 'error');
            } finally {
                syncNowBtn.disabled = false;
                syncNowBtn.innerHTML = orig;
            }
        });
    }

    if (markReadBtn) {
        markReadBtn.addEventListener('click', async () => {
            if (!procSyncId) return;
            await apiFetch(`/api/processos/${encodeURIComponent(procSyncId)}/movimentacoes/ler`, { method: 'PATCH' });
            await carregarPainelHibridoConsulta();
            mostrarToast('Movimentações marcadas como lidas!', 'success');
        });
    }
};

const restaurarConsultaEmCache = async (numeroFormatado) => {
    const numeroLimpo = numeroFormatado.replace(/\D/g, '');
    const cacheRaw = sessionStorage.getItem('ultimaConsultaDatajud');
    if (!cacheRaw) return false;

    try {
        const cache = JSON.parse(cacheRaw);
        if (cache.numeroLimpo !== numeroLimpo) return false;

        // Busca apenas o vínculo específico e a menor pasta disponível (evita baixar toda a tabela de clientes)
        const { pastaVinculada, menorPastaDisponivel } = await apiFetch(`/clientes/vinculo/${encodeURIComponent(numeroLimpo)}`);

        processoAtual = cache.processo;
        instanciaSelecionadaIndex = 0;

        renderizarPastaVinculada(
            pastaVinculada,
            numeroFormatado,
            cache.processo?.classe,
            menorPastaDisponivel,
            cache.processo?.autor
        );
        renderizarDadosProcesso(cache.processo, cache.aviso);
        document.getElementById('resultadoContainer').style.display = 'flex';
        return true;
    } catch (e) {
        console.error('Erro ao restaurar consulta em cache:', e);
        return false;
    }
};

const consultarProcesso = async (event) => {
    if (event) event.preventDefault();

    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }

    const inputProc = document.getElementById('numeroProcesso');
    const selectTribunal = document.getElementById('tribunalSelect');

    const numeroFormatado = mascaraProcessoCNJ(inputProc.value);
    inputProc.value = numeroFormatado;

    const numeroLimpo = numeroFormatado.replace(/\D/g, '');
    if (numeroLimpo.length !== 20) {
        showEmpty('Informe um número de processo válido com os 20 dígitos do padrão CNJ.');
        return;
    }

    hideEmpty();
    showLoading(true);
    document.getElementById('resultadoContainer').style.display = 'none';

    try {
        const queryParams = selectTribunal.value ? `?tribunal=${encodeURIComponent(selectTribunal.value)}` : '';
        const data = await apiFetch(`/clientes/consulta/${encodeURIComponent(numeroLimpo)}${queryParams}`);

        showLoading(false);

        processoAtual = data.processo;
        instanciaSelecionadaIndex = 0;

        // Salva no sessionStorage para retorno rápido caso o usuário vá para a tela de cadastro e volte
        sessionStorage.setItem('ultimaConsultaDatajud', JSON.stringify({
            numeroLimpo,
            numeroFormatado,
            processo: data.processo,
            aviso: data.aviso
        }));

        renderizarPastaVinculada(
            data.pastaVinculada,
            numeroFormatado,
            data.processo?.classe,
            data.menorPastaDisponivel,
            data.processo?.autor
        );
        renderizarDadosProcesso(data.processo, data.aviso);

        document.getElementById('resultadoContainer').style.display = 'flex';
    } catch (error) {
        console.error('Erro ao consultar processo:', error);
        if (error.message === 'UNAUTHORIZED' || error.message === 'TOKEN_MISSING') {
            return;
        }
        showEmpty(error.data?.mensagem || 'Não foi possível localizar o processo informado.');
    } finally {
        showLoading(false);
    }
};

document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/pages/auth/';
        return;
    }

    initNotificationsWidget();
    buscarTiposProcesso().catch(() => {});

    const inputProc = document.getElementById('numeroProcesso');
    const form = document.getElementById('consultForm');

    inputProc.addEventListener('input', (e) => {
        e.target.value = mascaraProcessoCNJ(e.target.value);
    });

    form.addEventListener('submit', consultarProcesso);

    // Se vier um número de processo pela URL (?proc=...), restaura do cache se estiver retornando do cadastro ou executa a consulta
    const params = new URLSearchParams(window.location.search);
    const procInicial = params.get('proc');
    const retornouDoCadastro = params.get('retornou') === '1';

    if (procInicial) {
        const formatado = mascaraProcessoCNJ(procInicial);
        inputProc.value = formatado;

        if (retornouDoCadastro) {
            const restaurado = await restaurarConsultaEmCache(formatado);
            if (restaurado) return;
        }

        consultarProcesso();
    } else {
        inputProc.focus();
    }
});
