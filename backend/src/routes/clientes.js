import { Router } from 'express';
import { clienteController } from '../controllers/clienteController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/', clienteController.listClientes);
router.get('/proxima-pasta', clienteController.obterProximaPasta);
router.get('/tipos', clienteController.listTiposProcesso);
router.post('/tipos', clienteController.createTipoProcesso);
router.delete('/tipos/:id', clienteController.deleteTipoProcesso);
router.get('/consulta/:numeroProc', clienteController.consultarProcessoCliente);
router.post('/', clienteController.createCliente);
router.put('/:id', clienteController.updateCliente);
router.delete('/:id', clienteController.deleteCliente);

export default router;
