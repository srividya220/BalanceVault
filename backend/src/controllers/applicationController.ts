import { Response, NextFunction } from 'express';
import { z } from 'zod';
import { applicationService } from '../services/applicationService';
import { AuthenticatedRequest } from '../types';
import { ForbiddenError } from '../errors/AppError';

const submitApplicationSchema = z.object({
  accountType: z.enum(['CHECKING', 'SAVINGS']),
});

const rejectApplicationSchema = z.object({
  reason: z.string().min(5, 'Rejection reason must be at least 5 characters.'),
});

export class ApplicationController {
  /** Customer: Submit a new account application */
  public async submitApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const validated = submitApplicationSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const application = await applicationService.submitApplication(
        req.user!.id,
        validated.accountType,
        { ipAddress, userAgent }
      );

      res.status(201).json({
        success: true,
        message: 'Account application submitted successfully. Pending administrator review.',
        data: application,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Customer: Get own applications */
  public async getMyApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const applications = await applicationService.getCustomerApplications(req.user!.id);
      res.status(200).json({ success: true, data: applications });
    } catch (error) {
      next(error);
    }
  }

  /** Admin: Get all applications */
  public async getAllApplications(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw new ForbiddenError('Only administrators can view all account applications.');
      }
      const statusFilter = req.query.status as string | undefined;
      const applications = await applicationService.getAllApplications(statusFilter);
      res.status(200).json({ success: true, data: applications });
    } catch (error) {
      next(error);
    }
  }

  /** Admin: Approve an application */
  public async approveApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw new ForbiddenError('Only administrators can approve account applications.');
      }
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await applicationService.approveApplication(
        req.params.id,
        req.user!.id,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: 'Account application approved. Customer account is now active.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  /** Admin: Reject an application */
  public async rejectApplication(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.user?.role !== 'ADMIN') {
        throw new ForbiddenError('Only administrators can reject account applications.');
      }
      const validated = rejectApplicationSchema.parse(req.body);
      const ipAddress = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];

      const result = await applicationService.rejectApplication(
        req.params.id,
        req.user!.id,
        validated.reason,
        { ipAddress, userAgent }
      );

      res.status(200).json({
        success: true,
        message: 'Account application rejected.',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const applicationController = new ApplicationController();
