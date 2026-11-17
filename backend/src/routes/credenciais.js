import { Router } from 'express';
import { credencialController } from '../controllers/credencialController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/', credencialController.listarCredenciais);
router.get('/resumo-motor', credencialController.obterResumoMotor);
router.post('/certificado-a1', credencialController.cadastrarCertificadoA1);
router.post('/login-portal', credencialController.cadastrarLoginPortal);
router.post('/varredura-manual', credencialController.executarVarreduraManual);
router.patch('/:id/ativo', credencialController.alternarAtivoCredencial);
router.delete('/:id', credencialController.removerCredencial);

export default router;
