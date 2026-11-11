import { prisma } from '../database/prisma';
import { CreateAccountDTO } from '../types';
import { BadRequestError, NotFoundError } from '../errors/AppError';
import { auditService } from './auditService';
import { AccountStatus } from '@prisma/client';

export class AccountService {
  /**
   * Generates a new unique bank account number formatted as BV-XXXXXXXX.
   */
  public generateAccountNumber(): string {
    const randomDigits = Math.floor(10000000 + Math.random() * 90000000);
    return `BV-${randomDigits}`;
  }

  /**
   * Creates an additional bank account for an authenticated user.
   */
  public async createAccount(
    userId: string,
    data: CreateAccountDTO,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    const accountNumber = this.generateAccountNumber();

    const account = await prisma.account.create({
      data: {
        accountNumber,
        userId,
        accountType: data.accountType || 'CHECKING',
        currency: data.currency || 'INR',
        balance: 0.0,
      },
    });

    await auditService.logEvent({
      action: 'ACCOUNT_CREATED',
      entityType: 'ACCOUNT',
      entityId: account.id,
      actorId: userId,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        accountNumber: account.accountNumber,
        accountType: account.accountType,
      },
    });

    return account;
  }

  /**
   * Returns all active accounts belonging to a given user.
   */
  public async getUserAccounts(userId: string): Promise<any[]> {
    return prisma.account.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Returns a specific account by ID, verifying ownership or admin authorization.
   */
  public async getAccountById(accountId: string, userId?: string, isAdmin: boolean = false): Promise<any> {
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        user: {
          select: { id: true, fullName: true, email: true },
        },
      },
    });

    if (!account) {
      throw new NotFoundError('Account not found.');
    }

    if (!isAdmin && userId && account.userId !== userId) {
      throw new BadRequestError('You do not have permission to view this account.');
    }

    return account;
  }

  /**
   * Returns account statement / transaction ledger postings.
   */
  public async getAccountStatement(
    accountId: string,
    userId?: string,
    isAdmin: boolean = false,
    limit: number = 50
  ): Promise<any> {
    const account = await this.getAccountById(accountId, userId, isAdmin);

    const postings = await prisma.posting.findMany({
      where: { accountId },
      include: {
        journalEntry: true,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return {
      account,
      statement: postings.map((p) => ({
        postingId: p.id,
        reference: p.journalEntry.reference,
        entryType: p.journalEntry.entryType,
        description: p.journalEntry.description,
        direction: p.direction,
        amount: p.amount,
        signedAmount: p.signedAmount,
        balanceAfter: p.balanceAfter,
        timestamp: p.createdAt,
      })),
    };
  }

  /**
   * Updates account status (ACTIVE, FROZEN, CLOSED) - restricted to ADMIN.
   */
  public async updateAccountStatus(
    accountId: string,
    status: AccountStatus,
    adminId: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    const account = await prisma.account.update({
      where: { id: accountId },
      data: { status },
    });

    await auditService.logEvent({
      action: `ACCOUNT_STATUS_CHANGED_${status}`,
      entityType: 'ACCOUNT',
      entityId: account.id,
      actorId: adminId,
      actorRole: 'ADMIN',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: { newStatus: status, accountNumber: account.accountNumber },
    });

    return account;
  }
}

export const accountService = new AccountService();
