import { Router } from 'express';
import { processoController } from '../controllers/processoController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/consultar/:numeroProcesso', processoController.consultarProcesso);
router.get('/tribunal/:numeroProcesso', processoController.obterInfoTribunalController);
router.get('/:numeroProcesso', processoController.consultarProcesso);

export default router;
