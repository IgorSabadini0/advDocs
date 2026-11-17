import express, { Router } from 'express';
import { webhookProcessoController } from '../controllers/webhookProcessoController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);
router.use(express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
        req.rawBody = buf;
    }
}));

router.post('/processos', webhookProcessoController.receberWebhookProcesso);

export default router;
