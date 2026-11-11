import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { ledgerService } from '../services/ledgerService';
import { AuthenticatedRequest } from '../types';

const depositSchema = z.object({
  accountId: z.string().uuid('Invalid account ID format'),
  amount: z.number().positive('Deposit amount must be positive'),
  description: z.string().optional(),
});

const withdrawSchema = z.object({
  accountId: z.string().uuid('Invalid account ID format'),
  amount: z.number().positive('Withdrawal amount must be positive'),
  description: z.string().optional(),
});

const transferSchema = z.object({
  sourceAccountId: z.string().uuid('Invalid source account ID format'),
  destinationAccountNumber: z.string().min(5, 'Valid destination account number required'),
  amount: z.number().positive('Transfer amount must be positive'),
  description: z.string().optional(),
});

export class TransactionController {
  public async deposit(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = depositSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await ledgerService.deposit(
        validated,
        req.user?.id,
        req.idempotencyKey,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: 'Deposit executed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async withdraw(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = withdrawSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await ledgerService.withdraw(
        validated,
        req.user?.id,
        req.idempotencyKey,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: 'Withdrawal executed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  public async transfer(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = transferSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await ledgerService.transfer(
        validated,
        req.user?.id,
        req.idempotencyKey,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: 'Transfer executed successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const transactionController = new TransactionController();
