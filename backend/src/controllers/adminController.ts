import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { prisma } from '../database/prisma';
import { accountService } from '../services/accountService';
import { ledgerService } from '../services/ledgerService';
import { auditService } from '../services/auditService';
import { AuthenticatedRequest } from '../types';

const updateStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'FROZEN', 'CLOSED']),
});

export class AdminController {
  public async listAllAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await prisma.account.findMany({
        include: {
          user: {
            select: { id: true, email: true, fullName: true, role: true },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  public async updateAccountStatus(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accountId = req.params.id;
      const validated = updateStatusSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const updated = await accountService.updateAccountStatus(
        accountId,
        validated.status,
        req.user!.id,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: `Account status updated to ${validated.status}`,
        data: updated,
      });
    } catch (error) {
      next(error);
    }
  }

  public async listAllUsers(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          isActive: true,
          createdAt: true,
          accounts: {
            select: {
              id: true,
              accountNumber: true,
              accountType: true,
              status: true,
              balance: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.status(200).json({
        success: true,
        data: users,
      });
    } catch (error) {
      next(error);
    }
  }

  public async listAuditLogs(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
      const logs = await prisma.auditLedger.findMany({
        include: {
          actor: {
            select: { id: true, email: true, fullName: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });

      res.status(200).json({
        success: true,
        data: logs,
      });
    } catch (error) {
      next(error);
    }
  }

  public async verifyInvariants(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const report = await ledgerService.verifySystemInvariants();
      res.status(200).json({
        success: true,
        data: report,
      });
    } catch (error) {
      next(error);
    }
  }

  public async verifyAuditChain(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await auditService.verifyAuditChainIntegrity();
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
