import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { rateLimitService } from '../services/rateLimitService';
import { TooManyRequestsError } from '../errors/AppError';
import { config } from '../config';

export function createRateLimiter(options?: {
  maxRequests?: number;
  windowMs?: number;
  keyPrefix?: string;
}) {
  const limit = options?.maxRequests || config.rateLimit.maxRequests;
  const windowMs = options?.windowMs || config.rateLimit.windowMs;
  const prefix = options?.keyPrefix || 'global';

  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const clientIp =
        (req.headers['x-forwarded-for'] as string)?.split(',')[0].trim() ||
        req.socket.remoteAddress ||
        '127.0.0.1';

      const actorKey = req.user ? `user:${req.user.id}` : `ip:${clientIp}`;
      const rateLimitKey = `${prefix}:${actorKey}`;

      const result = await rateLimitService.checkRateLimit(rateLimitKey, limit, windowMs);

      res.setHeader('X-RateLimit-Limit', result.limit.toString());
      res.setHeader('X-RateLimit-Remaining', result.remaining.toString());
      res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetTimeMs / 1000).toString());

      if (!result.allowed) {
        const retryAfterSec = Math.max(1, Math.ceil((result.resetTimeMs - Date.now()) / 1000));
        res.setHeader('Retry-After', retryAfterSec.toString());
        throw new TooManyRequestsError(
          `Rate limit exceeded. Maximum ${limit} requests per ${windowMs / 1000}s allowed. Try again in ${retryAfterSec}s.`
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

export const standardRateLimiter = createRateLimiter();
export const authRateLimiter = createRateLimiter({
  maxRequests: config.rateLimit.authMax,
  windowMs: 60000,
  keyPrefix: 'auth',
});
export const financialRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 60000,
  keyPrefix: 'financial',
});
