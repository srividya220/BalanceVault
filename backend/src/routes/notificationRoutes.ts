import { Router } from 'express';
import { notificationController } from '../controllers/notificationController';
import { authenticate } from '../middlewares/auth';

const router = Router();

router.use(authenticate);

// GET /notifications — list user's notifications
router.get('/', notificationController.listNotifications.bind(notificationController));

// GET /notifications/unread-count — count unread
router.get('/unread-count', notificationController.getUnreadCount.bind(notificationController));

// PATCH /notifications/read-all — mark all as read
router.patch('/read-all', notificationController.markAllAsRead.bind(notificationController));

// PATCH /notifications/:id/read — mark single as read
router.patch('/:id/read', notificationController.markAsRead.bind(notificationController));

// DELETE /notifications/:id — dismiss
router.delete('/:id', notificationController.dismissNotification.bind(notificationController));

export default router;
