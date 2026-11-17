import { Router } from 'express';
import { credencialController } from '../controllers/credencialController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.post('/certificado-a1', credencialController.cadastrarCertificadoA1);

export default router;
