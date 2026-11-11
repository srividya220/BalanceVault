import { Response, NextFunction } from 'express';
import { notificationService } from '../services/notificationService';
import { AuthenticatedRequest } from '../types';

export class NotificationController {
  public async listNotifications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const notifications = await notificationService.getUserNotifications(req.user!.id, limit);
      res.status(200).json({ success: true, data: notifications });
    } catch (error) {
      next(error);
    }
  }

  public async getUnreadCount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const count = await notificationService.getUnreadCount(req.user!.id);
      res.status(200).json({ success: true, data: { count } });
    } catch (error) {
      next(error);
    }
  }

  public async markAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const notification = await notificationService.markAsRead(req.params.id, req.user!.id);
      res.status(200).json({ success: true, data: notification });
    } catch (error) {
      next(error);
    }
  }

  public async markAllAsRead(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.markAllAsRead(req.user!.id);
      res.status(200).json({ success: true, message: 'All notifications marked as read.' });
    } catch (error) {
      next(error);
    }
  }

  public async dismissNotification(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await notificationService.dismissNotification(req.params.id, req.user!.id);
      res.status(200).json({ success: true, message: 'Notification dismissed.' });
    } catch (error) {
      next(error);
    }
  }
}

export const notificationController = new NotificationController();
