import { Router } from 'express';
import { clienteController } from '../controllers/clienteController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { requirePolicy } from '../middleware/authMiddleware.js';

const router = Router();

router.use(apiLimiter);

router.get('/', clienteController.listClientes);
router.get('/proxima-pasta', clienteController.obterProximaPasta);
router.get('/tipos', clienteController.listTiposProcesso);
router.post('/tipos', requirePolicy('create_records'), clienteController.createTipoProcesso);
router.delete('/tipos/:id', requirePolicy('delete_records'), clienteController.deleteTipoProcesso);
router.get('/vinculo/:numeroProc', clienteController.obterVinculoProcesso);
router.get('/consulta/:numeroProc', clienteController.consultarProcessoCliente);
router.get('/:id', clienteController.getClienteById);
router.post('/', requirePolicy('create_records'), clienteController.createCliente);
router.post('/:id/resincronizar-datajud', requirePolicy('edit_records'), clienteController.resincronizarDatajudCliente);
router.put('/:id', requirePolicy('edit_records'), clienteController.updateCliente);
router.delete('/:id', requirePolicy('delete_records'), clienteController.deleteCliente);

export default router;
