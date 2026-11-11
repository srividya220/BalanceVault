import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { accountService } from '../services/accountService';
import { AuthenticatedRequest } from '../types';

const createAccountSchema = z.object({
  accountType: z.enum(['CHECKING', 'SAVINGS']).optional(),
  currency: z.string().default('INR'),
});

export class AccountController {
  public async listAccounts(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accounts = await accountService.getUserAccounts(req.user!.id);
      res.status(200).json({
        success: true,
        data: accounts,
      });
    } catch (error) {
      next(error);
    }
  }

  public async createAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = createAccountSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const account = await accountService.createAccount(req.user!.id, validated, { ipAddress, userAgent });

      res.status(201).json({
        success: true,
        message: 'Account created successfully',
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getAccount(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accountId = req.params.id;
      const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'AUDITOR';
      const account = await accountService.getAccountById(accountId, req.user!.id, isAdmin);

      res.status(200).json({
        success: true,
        data: account,
      });
    } catch (error) {
      next(error);
    }
  }

  public async getStatement(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const accountId = req.params.id;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const isAdmin = req.user?.role === 'ADMIN' || req.user?.role === 'AUDITOR';

      const result = await accountService.getAccountStatement(accountId, req.user!.id, isAdmin, limit);

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const accountController = new AccountController();
