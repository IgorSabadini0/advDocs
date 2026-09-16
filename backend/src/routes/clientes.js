import { Router } from 'express';
import { listClientes, createCliente } from '../controllers/clienteController.js';
import { apiLimiter, authLimiter } from '../middleware/rateLimiter.js'; // Importa o middleware de rate limiting
import { verifyToken } from '../middleware/authMiddleware.js'; // Importa o middleware de verificação de token

const router = Router();

router.use(apiLimiter); // Aplica o rate limiter para TODAS as rotas deste router

router.get('/', apiLimiter, listClientes);
router.post('/', authLimiter, createCliente);

export default router;