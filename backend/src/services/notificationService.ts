import { NotificationType } from '@prisma/client';
import { prisma } from '../database/prisma';

export class NotificationService {
  /**
   * Creates a notification for a user.
   */
  public async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    message: string,
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<any> {
    return prisma.notification.create({
      data: {
        userId,
        type,
        title,
        message,
        relatedEntityId: relatedEntityId || null,
        relatedEntityType: relatedEntityType || null,
      },
    });
  }

  /**
   * Returns non-dismissed notifications for a user (newest first).
   */
  public async getUserNotifications(userId: string, limit = 50): Promise<any[]> {
    return prisma.notification.findMany({
      where: { userId, isDismissed: false },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  /**
   * Returns count of unread, non-dismissed notifications.
   */
  public async getUnreadCount(userId: string): Promise<number> {
    return prisma.notification.count({
      where: { userId, isRead: false, isDismissed: false },
    });
  }

  /**
   * Marks a single notification as read (verifies ownership).
   */
  public async markAsRead(notificationId: string, userId: string): Promise<any> {
    const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.userId !== userId) {
      throw new Error('Notification not found or access denied.');
    }
    return prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });
  }

  /**
   * Marks all notifications for a user as read.
   */
  public async markAllAsRead(userId: string): Promise<void> {
    await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });
  }

  /**
   * Soft-dismisses a notification (verifies ownership).
   */
  public async dismissNotification(notificationId: string, userId: string): Promise<void> {
    const notif = await prisma.notification.findUnique({ where: { id: notificationId } });
    if (!notif || notif.userId !== userId) {
      throw new Error('Notification not found or access denied.');
    }
    await prisma.notification.update({
      where: { id: notificationId },
      data: { isDismissed: true },
    });
  }

  /**
   * Sends a notification to all admin users.
   */
  public async notifyAllAdmins(
    type: NotificationType,
    title: string,
    message: string,
    relatedEntityId?: string,
    relatedEntityType?: string
  ): Promise<void> {
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', isActive: true },
      select: { id: true },
    });

    if (admins.length === 0) return;

    await prisma.notification.createMany({
      data: admins.map((admin) => ({
        userId: admin.id,
        type,
        title,
        message,
        relatedEntityId: relatedEntityId || null,
        relatedEntityType: relatedEntityType || null,
      })),
    });
  }
}

export const notificationService = new NotificationService();
