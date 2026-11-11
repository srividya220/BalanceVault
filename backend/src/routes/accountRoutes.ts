import { Router } from 'express';
import { accountController } from '../controllers/accountController';
import { authenticate } from '../middlewares/auth';
import { standardRateLimiter } from '../middlewares/rateLimiter';
import { idempotencyMiddleware } from '../middlewares/idempotency';

const router = Router();

router.use(authenticate);
router.use(standardRateLimiter);

router.get('/', (req, res, next) => accountController.listAccounts(req, res, next));
router.post('/', idempotencyMiddleware(), (req, res, next) => accountController.createAccount(req, res, next));
router.get('/:id', (req, res, next) => accountController.getAccount(req, res, next));
router.get('/:id/statement', (req, res, next) => accountController.getStatement(req, res, next));

export default router;
