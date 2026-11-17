import { Router } from 'express';
import { notificacaoController } from '../controllers/notificacaoController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/', notificacaoController.listarNotificacoes);
router.patch('/ler-todas', notificacaoController.marcarTodasLidas);
router.patch('/:id/lida', notificacaoController.marcarLida);

export default router;
