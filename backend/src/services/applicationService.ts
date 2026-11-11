import { AccountType } from '@prisma/client';
import { prisma } from '../database/prisma';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { BadRequestError, NotFoundError, ForbiddenError } from '../errors/AppError';

export class ApplicationService {
  /**
   * Generates a unique account number in the BV-XXXXXXXX format.
   */
  private generateAccountNumber(): string {
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
    return `BV-${randomDigits}`;
  }

  /**
   * Customer submits a new account application.
   * Creates a PENDING_APPROVAL record — does NOT create a live account.
   */
  public async submitApplication(
    userId: string,
    accountType: AccountType,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    // Check for existing pending application of the same type
    const existingPending = await prisma.accountApplication.findFirst({
      where: { userId, accountType, status: 'PENDING_APPROVAL' },
    });
    if (existingPending) {
      throw new BadRequestError(
        `You already have a pending ${accountType.toLowerCase()} account application. Please wait for administrator review.`
      );
    }

    const application = await prisma.accountApplication.create({
      data: {
        userId,
        accountType,
        currency: 'INR',
        status: 'PENDING_APPROVAL',
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Notify customer
    await notificationService.createNotification(
      userId,
      'ACCOUNT_APPLICATION_SUBMITTED',
      'Account Application Submitted',
      `Your ${accountType.toLowerCase()} account application has been submitted and is pending administrator review.`,
      application.id,
      'AccountApplication'
    );

    // Notify all admins
    await notificationService.notifyAllAdmins(
      'ADMIN_NEW_APPLICATION',
      'New Account Application Received',
      `${application.user.fullName} has submitted a new ${accountType.toLowerCase()} account application and requires your review.`,
      application.id,
      'AccountApplication'
    );

    await auditService.logEvent({
      action: 'APPLICATION_SUBMITTED',
      entityType: 'AccountApplication',
      entityId: application.id,
      actorId: userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: { accountType, userId },
    });

    return application;
  }

  /**
   * Returns all applications for a customer.
   */
  public async getCustomerApplications(userId: string): Promise<any[]> {
    return prisma.accountApplication.findMany({
      where: { userId },
      include: {
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        account: { select: { id: true, accountNumber: true, status: true, balance: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns all applications — admin view.
   */
  public async getAllApplications(statusFilter?: string): Promise<any[]> {
    const whereClause: any = {};
    if (statusFilter && ['PENDING_APPROVAL', 'APPROVED', 'REJECTED'].includes(statusFilter)) {
      whereClause.status = statusFilter;
    }

    return prisma.accountApplication.findMany({
      where: whereClause,
      include: {
        user: { select: { id: true, fullName: true, email: true, role: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        account: { select: { id: true, accountNumber: true, status: true, balance: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Returns a specific application by ID.
   */
  public async getApplicationById(
    applicationId: string,
    requesterId: string,
    isAdmin: boolean
  ): Promise<any> {
    const application = await prisma.accountApplication.findUnique({
      where: { id: applicationId },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
        reviewedBy: { select: { id: true, fullName: true, email: true } },
        account: { select: { id: true, accountNumber: true, status: true, balance: true } },
      },
    });

    if (!application) {
      throw new NotFoundError('Account application not found.');
    }

    if (!isAdmin && application.userId !== requesterId) {
      throw new ForbiddenError('You do not have permission to view this application.');
    }

    return application;
  }

  /**
   * Admin approves an application: creates the actual bank account.
   */
  public async approveApplication(
    applicationId: string,
    adminId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    const application = await prisma.accountApplication.findUnique({
      where: { id: applicationId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    if (!application) {
      throw new NotFoundError('Account application not found.');
    }

    if (application.status !== 'PENDING_APPROVAL') {
      throw new BadRequestError(
        `Cannot approve an application with status "${application.status}". Only PENDING_APPROVAL applications can be approved.`
      );
    }

    // Prevent self-approval
    if (application.userId === adminId) {
      throw new ForbiddenError('Administrators cannot approve their own account applications.');
    }

    // Generate unique account number
    let accountNumber = this.generateAccountNumber();
    let attempts = 0;
    while (attempts < 10) {
      const existing = await prisma.account.findUnique({ where: { accountNumber } });
      if (!existing) break;
      accountNumber = this.generateAccountNumber();
      attempts++;
    }

    // Atomically create the account and update application
    const result = await prisma.$transaction(async (tx) => {
      // Create the actual bank account
      const account = await tx.account.create({
        data: {
          accountNumber,
          userId: application.userId,
          accountType: application.accountType,
          currency: 'INR',
          status: 'ACTIVE',
          balance: 0,
        },
      });

      // Update application status
      const updatedApplication = await tx.accountApplication.update({
        where: { id: applicationId },
        data: {
          status: 'APPROVED',
          reviewedById: adminId,
          reviewedAt: new Date(),
          accountId: account.id,
        },
        include: {
          user: { select: { id: true, fullName: true, email: true } },
          account: { select: { id: true, accountNumber: true, status: true } },
        },
      });

      return { application: updatedApplication, account };
    });

    // Notify customer
    await notificationService.createNotification(
      application.userId,
      'ACCOUNT_APPLICATION_APPROVED',
      'Account Application Approved ✓',
      `Your ${application.accountType.toLowerCase()} account application has been approved! Your new account number is ${accountNumber}. You can now use it for deposits and transactions.`,
      applicationId,
      'AccountApplication'
    );

    // Notify admin (self-confirmation)
    await notificationService.createNotification(
      adminId,
      'GENERAL',
      'Account Application Approved',
      `You approved the ${application.accountType.toLowerCase()} account application from ${application.user.fullName}. Account ${accountNumber} is now active.`,
      applicationId,
      'AccountApplication'
    );

    await auditService.logEvent({
      action: 'APPLICATION_APPROVED',
      entityType: 'AccountApplication',
      entityId: applicationId,
      actorId: adminId,
      actorRole: 'ADMIN',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        applicationId,
        customerId: application.userId,
        accountType: application.accountType,
        newAccountNumber: accountNumber,
      },
    });

    return result;
  }

  /**
   * Admin rejects an application with a mandatory reason.
   */
  public async rejectApplication(
    applicationId: string,
    adminId: string,
    reason: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    if (!reason || reason.trim().length < 5) {
      throw new BadRequestError('A rejection reason of at least 5 characters is required.');
    }

    const application = await prisma.accountApplication.findUnique({
      where: { id: applicationId },
      include: { user: { select: { id: true, fullName: true, email: true } } },
    });

    if (!application) {
      throw new NotFoundError('Account application not found.');
    }

    if (application.status !== 'PENDING_APPROVAL') {
      throw new BadRequestError(
        `Cannot reject an application with status "${application.status}". Only PENDING_APPROVAL applications can be rejected.`
      );
    }

    if (application.userId === adminId) {
      throw new ForbiddenError('Administrators cannot reject their own account applications.');
    }

    const updatedApplication = await prisma.accountApplication.update({
      where: { id: applicationId },
      data: {
        status: 'REJECTED',
        rejectionReason: reason.trim(),
        reviewedById: adminId,
        reviewedAt: new Date(),
      },
      include: {
        user: { select: { id: true, fullName: true, email: true } },
      },
    });

    // Notify customer with reason
    await notificationService.createNotification(
      application.userId,
      'ACCOUNT_APPLICATION_REJECTED',
      'Account Application Not Approved',
      `Your ${application.accountType.toLowerCase()} account application was not approved. Reason: ${reason.trim()}. Please contact support for further assistance.`,
      applicationId,
      'AccountApplication'
    );

    // Notify admin (self-confirmation)
    await notificationService.createNotification(
      adminId,
      'GENERAL',
      'Account Application Rejected',
      `You rejected the ${application.accountType.toLowerCase()} account application from ${application.user.fullName}. Reason: ${reason.trim()}`,
      applicationId,
      'AccountApplication'
    );

    await auditService.logEvent({
      action: 'APPLICATION_REJECTED',
      entityType: 'AccountApplication',
      entityId: applicationId,
      actorId: adminId,
      actorRole: 'ADMIN',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        applicationId,
        customerId: application.userId,
        accountType: application.accountType,
        reason: reason.trim(),
      },
    });

    return updatedApplication;
  }
}

export const applicationService = new ApplicationService();
