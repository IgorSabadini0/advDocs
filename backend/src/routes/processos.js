import { Router } from 'express';
import { processoSyncController } from '../controllers/processoSyncController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.post('/sincronizar', processoSyncController.sincronizarProcesso);
router.get('/cnj/:numeroCnj/status-sincronizacao', processoSyncController.obterStatusPorNumeroCnj);
router.get('/:id/status-sincronizacao', processoSyncController.obterStatusSincronizacao);
router.patch('/:id/movimentacoes/ler', processoSyncController.marcarMovimentacoesComoLidas);
router.post('/:id/documentos/:docId/baixar', processoSyncController.solicitarDownloadDocumento);
router.get('/:id/documentos/:docId/arquivo', processoSyncController.servirArquivoDocumentoBaixado);

export default router;
