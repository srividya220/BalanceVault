import { Router } from 'express';
import { healthController } from '../controllers/healthController';

const router = Router();

router.get('/', (req, res) => healthController.getLiveness(req, res));
router.get('/ready', (req, res, next) => healthController.getReadiness(req, res, next));

export default router;
