import { Router } from 'express';
import authRoutes from './authRoutes';
import accountRoutes from './accountRoutes';
import transactionRoutes from './transactionRoutes';
import adminRoutes from './adminRoutes';
import healthRoutes from './healthRoutes';
import notificationRoutes from './notificationRoutes';
import applicationRoutes from './applicationRoutes';

const router = Router();

router.use('/auth', authRoutes);
router.use('/accounts', accountRoutes);
router.use('/transactions', transactionRoutes);
router.use('/admin', adminRoutes);
router.use('/health', healthRoutes);
router.use('/notifications', notificationRoutes);
router.use('/applications', applicationRoutes);

export default router;
