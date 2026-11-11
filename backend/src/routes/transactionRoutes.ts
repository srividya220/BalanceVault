import { Router } from 'express';
import { transactionController } from '../controllers/transactionController';
import { authenticate } from '../middlewares/auth';
import { financialRateLimiter } from '../middlewares/rateLimiter';
import { idempotencyMiddleware } from '../middlewares/idempotency';

const router = Router();

router.use(authenticate);
router.use(financialRateLimiter);
router.use(idempotencyMiddleware());

router.post('/deposit', (req, res, next) => transactionController.deposit(req, res, next));
router.post('/withdraw', (req, res, next) => transactionController.withdraw(req, res, next));
router.post('/transfer', (req, res, next) => transactionController.transfer(req, res, next));

export default router;
