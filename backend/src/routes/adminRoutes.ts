import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { authenticate, authorizeRoles } from '../middlewares/auth';
import { standardRateLimiter } from '../middlewares/rateLimiter';
import { UserRole } from '@prisma/client';

const router = Router();

router.use(authenticate);
router.use(standardRateLimiter);

// Auditor & Admin endpoints
router.get(
  '/accounts',
  authorizeRoles(UserRole.ADMIN, UserRole.AUDITOR),
  (req, res, next) => adminController.listAllAccounts(req, res, next)
);

router.get(
  '/users',
  authorizeRoles(UserRole.ADMIN, UserRole.AUDITOR),
  (req, res, next) => adminController.listAllUsers(req, res, next)
);

router.get(
  '/audit-logs',
  authorizeRoles(UserRole.ADMIN, UserRole.AUDITOR),
  (req, res, next) => adminController.listAuditLogs(req, res, next)
);

router.get(
  '/ledger/verify-invariants',
  authorizeRoles(UserRole.ADMIN, UserRole.AUDITOR),
  (req, res, next) => adminController.verifyInvariants(req, res, next)
);

router.get(
  '/audit/verify-chain',
  authorizeRoles(UserRole.ADMIN, UserRole.AUDITOR),
  (req, res, next) => adminController.verifyAuditChain(req, res, next)
);

// Admin-only mutation endpoints
router.patch(
  '/accounts/:id/status',
  authorizeRoles(UserRole.ADMIN),
  (req, res, next) => adminController.updateAccountStatus(req, res, next)
);

export default router;
