import { Router } from 'express';
import { userController } from '../controllers/userController.js';
import { apiLimiter } from '../middleware/rateLimiter.js';

const router = Router();

router.use(apiLimiter);

router.get('/me', userController.getMe);
router.put('/me', userController.updateMyProfile);
router.put('/me/password', userController.updateMyPassword);

router.get('/', userController.listUsers);
router.post('/', userController.createUser);
router.patch('/:id/status', userController.toggleUserStatus);
router.delete('/:id', userController.deleteUser);

export default router;
