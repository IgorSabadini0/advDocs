import { Router } from 'express';
import { notificacaoController } from '../controllers/notificacaoController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/', notificacaoController.listarNotificacoes);
router.patch('/ler-todas', notificacaoController.marcarTodasLidas);
router.patch('/:id/lida', notificacaoController.marcarLida);
router.delete('/', notificacaoController.excluirTodasNotificacoes);
router.delete('/:id', notificacaoController.excluirNotificacao);

export default router;
