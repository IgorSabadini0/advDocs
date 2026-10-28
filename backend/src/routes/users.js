import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';
import { requireAdmin } from '../middleware/authMiddleware.js';

const router = Router();

router.use(apiLimiter);

router.get('/me', userController.getMe);
router.put('/me', userController.updateMyProfile);
router.put('/me/password', userController.updateMyPassword);

router.get('/', requireAdmin, userController.listUsers);
router.post('/', requireAdmin, userController.createUser);
router.patch('/:id/status', requireAdmin, userController.toggleUserStatus);
router.delete('/:id', requireAdmin, userController.deleteUser);

export default router;
