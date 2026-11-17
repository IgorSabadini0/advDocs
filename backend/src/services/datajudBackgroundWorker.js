import { buscarProcesso } from './datajudServices.js';
import { clienteModel } from '../models/clienteModel.js';
import { notificacaoModel } from '../models/notificacaoModel.js';

/**
 * Executa a consulta à API pública do DataJud em segundo plano após o retorno HTTP imediato
 * de cadastro/atualização da pasta, atualiza os metadados no banco e notifica o usuário.
 */
export const agendarConsultaDatajud = ({ clienteId, usuarioId, numeroProcesso, tribunal = null }) => {
    setImmediate(async () => {
        try {
            const clienteAtual = await clienteModel.findById(clienteId);
            const rotuloPasta = clienteAtual?.numeroPasta ? `Pasta Nº ${clienteAtual.numeroPasta}` : `Pasta #${clienteId}`;
            const nomeCliente = clienteAtual?.nome ? ` (${clienteAtual.nome})` : '';

            const dadosProcesso = await buscarProcesso(numeroProcesso, tribunal || null);

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
                const clienteAtual = await clienteModel.findById(clienteId);
                if (clienteAtual?.numeroPasta) {
                    rotuloPasta = `Pasta Nº ${clienteAtual.numeroPasta}`;
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
    });
};
