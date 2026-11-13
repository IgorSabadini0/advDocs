import { Router } from 'express';
import { rbacController } from '../controllers/rbacController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

router.use(apiLimiter);
router.use(requireAdmin);

// Rotas de Grupos de Permissões
router.get('/grupos', rbacController.listGrupos);
router.post('/grupos', rbacController.createGrupo);
router.put('/grupos/:id', rbacController.updateGrupo);
router.put('/grupos/:id/politicas', rbacController.updateGrupoPoliticas);
router.delete('/grupos/:id', rbacController.deleteGrupo);

// Rotas de Políticas de Acesso
router.get('/politicas', rbacController.listPoliticas);
router.post('/politicas', rbacController.createPolitica);
router.put('/politicas/:id', rbacController.updatePolitica);
router.delete('/politicas/:id', rbacController.deletePolitica);

export default router;
