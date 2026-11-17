import { buscarProcesso } from './datajudServices.js';
import { clienteModel } from '../models/clienteModel.js';
import { notificacaoModel } from '../models/notificacaoModel.js';

const MAX_CONCORRENCIA = 3;
const consultasAtivasPorCliente = new Set();
const filaConsultas = [];
let consultasEmExecucao = 0;

const extrairDigitos = (valor) => String(valor || '').replace(/\D/g, '');

export const estaSincronizandoCliente = (clienteId) => {
    return consultasAtivasPorCliente.has(Number(clienteId));
};

const pastaAindaCorrespondeAoProcesso = async (clienteId, numeroProcessoEsperado) => {
    const clienteAtual = await clienteModel.findById(clienteId);
    if (!clienteAtual) return null;
    if (extrairDigitos(clienteAtual.numeroProc) !== extrairDigitos(numeroProcessoEsperado)) {
        return null;
    }
    return clienteAtual;
};

const executarConsultaTarefa = async ({ clienteId, usuarioId, numeroProcesso, tribunal }) => {
    try {
        const clienteInicial = await pastaAindaCorrespondeAoProcesso(clienteId, numeroProcesso);
        if (!clienteInicial) {
            return;
        }

        const rotuloPasta = clienteInicial.numeroPasta ? `Pasta Nº ${clienteInicial.numeroPasta}` : `Pasta #${clienteId}`;
        const nomeCliente = clienteInicial.nome ? ` (${clienteInicial.nome})` : '';

        const dadosProcesso = await buscarProcesso(numeroProcesso, tribunal || null);

        const clientePos = await pastaAindaCorrespondeAoProcesso(clienteId, numeroProcesso);
        if (!clientePos) {
            return;
        }

        if (!dadosProcesso) {
            const msgNaoEncontrado = 'Processo não localizado na base pública do DataJud até o momento.';
            await clienteModel.atualizarStatusDatajud(clienteId, {
                status: 'erro',
                mensagem: msgNaoEncontrado
            });

            if (usuarioId) {
                await notificacaoModel.create({
                    usuario_id: usuarioId,
                    cliente_id: clienteId,
                    titulo: `DataJud: Processo não localizado (${rotuloPasta})`,
                    mensagem: `A consulta do processo ${numeroProcesso}${nomeCliente} foi concluída sem retorno na base pública do CNJ.`,
                    tipo: 'erro'
                });
            }
            return;
        }

        const msgSucesso = `Sincronizado (${dadosProcesso.tribunal} - ${dadosProcesso.classe}).`;
        await clienteModel.atualizarStatusDatajud(clienteId, {
            status: 'concluido',
            mensagem: msgSucesso,
            dadosProcesso
        });

        if (usuarioId) {
            await notificacaoModel.create({
                usuario_id: usuarioId,
                cliente_id: clienteId,
                titulo: `DataJud concluído (${rotuloPasta})`,
                mensagem: `${dadosProcesso.tribunal} — ${dadosProcesso.classe}. Metadados da pasta${nomeCliente} atualizados automaticamente.`,
                tipo: 'sucesso'
            });
        }
    } catch (error) {
        console.error(`[Worker DataJud] Erro na consulta em background (clienteId=${clienteId}):`, error.message);

        let rotuloPasta = `Pasta #${clienteId}`;
        try {
            const clientePos = await pastaAindaCorrespondeAoProcesso(clienteId, numeroProcesso);
            if (!clientePos) {
                return;
            }
            if (clientePos.numeroPasta) {
                rotuloPasta = `Pasta Nº ${clientePos.numeroPasta}`;
            }
        } catch (_) {
            // Ignora erro secundário ao buscar rótulo
        }

        const msgErro = String(error.message || 'Falha ao consultar a API pública do DataJud no momento.').slice(0, 250);
        try {
            await clienteModel.atualizarStatusDatajud(clienteId, {
                status: 'erro',
                mensagem: msgErro
            });
        } catch (dbErr) {
            console.error('[Worker DataJud] Erro ao gravar status de falha no cliente:', dbErr);
        }

        if (usuarioId) {
            try {
                await notificacaoModel.create({
                    usuario_id: usuarioId,
                    cliente_id: clienteId,
                    titulo: `Falha na consulta DataJud (${rotuloPasta})`,
                    mensagem: `Não foi possível sincronizar o processo ${numeroProcesso}: ${msgErro}`,
                    tipo: 'erro'
                });
            } catch (notifErr) {
                console.error('[Worker DataJud] Erro ao registrar notificação de falha:', notifErr);
            }
        }
    }
};

const processarFila = () => {
    while (consultasEmExecucao < MAX_CONCORRENCIA && filaConsultas.length > 0) {
        const tarefa = filaConsultas.shift();
        consultasEmExecucao++;
        executarConsultaTarefa(tarefa).finally(() => {
            consultasAtivasPorCliente.delete(tarefa.clienteId);
            consultasEmExecucao = Math.max(0, consultasEmExecucao - 1);
            processarFila();
        });
    }
};

/**
 * Agenda a consulta à API pública do DataJud em segundo plano após o retorno HTTP imediato,
 * evitando execuções duplicadas para a mesma pasta e limitando a concorrência simultânea.
 */
export const agendarConsultaDatajud = ({ clienteId, usuarioId, numeroProcesso, tribunal = null }) => {
    const idNumerico = Number(clienteId);
    if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
        return false;
    }

    if (consultasAtivasPorCliente.has(idNumerico)) {
        return false;
    }

    consultasAtivasPorCliente.add(idNumerico);
    filaConsultas.push({
        clienteId: idNumerico,
        usuarioId,
        numeroProcesso,
        tribunal
    });

    setImmediate(processarFila);
    return true;
};
