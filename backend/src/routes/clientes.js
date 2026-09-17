import { Router } from 'express';
import { listClientes, createCliente } from '../controllers/clienteController.js';
import { apiLimiter, authLimiter } from '../middleware/rateLimiter.js'; // Importa o middleware de rate limiting

const router = Router();

router.use(apiLimiter); // Aplica o rate limiter para TODAS as rotas deste router

router.get('/clientes', apiLimiter, listClientes);
router.post('/clientes', authLimiter, createCliente);

export default router;