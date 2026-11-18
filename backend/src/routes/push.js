import express from 'express';
import { pushController } from '../controllers/pushController.js';

const router = express.Router();

router.get('/vapid-public-key', pushController.getPublicKey);
router.post('/subscribe', pushController.subscribe);
router.delete('/unsubscribe', pushController.unsubscribe);
router.post('/test', pushController.sendTest);

export default router;
