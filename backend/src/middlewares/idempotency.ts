import { Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../database/prisma';
import { AuthenticatedRequest } from '../types';
import { ConflictError, UnprocessableEntityError } from '../errors/AppError';

export function idempotencyMiddleware(options?: { ttlHours?: number }) {
  const ttlHours = options?.ttlHours || 24;

  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    // Only apply to state-modifying requests (POST, PUT, PATCH)
    if (!['POST', 'PUT', 'PATCH'].includes(req.method)) {
      return next();
    }

    const idempotencyKey = (
      req.headers['idempotency-key'] ||
      req.headers['x-idempotency-key']
    ) as string | undefined;

    // If no idempotency key was supplied, proceed normally
    if (!idempotencyKey) {
      return next();
    }

    req.idempotencyKey = idempotencyKey;

    try {
      // Create deterministic request fingerprint
      const serializedBody = JSON.stringify(req.body || {});
      const userPart = req.user?.id || 'anonymous';
      const hashInput = `${req.method}|${req.baseUrl}${req.path}|${userPart}|${serializedBody}`;
      const requestHash = crypto.createHash('sha256').update(hashInput).digest('hex');

      // Check for existing idempotency record
      const existing = await prisma.idempotencyRecord.findUnique({
        where: { key: idempotencyKey },
      });

      if (existing) {
        // Check for payload tampering / mismatched request
        if (existing.requestHash !== requestHash) {
          throw new UnprocessableEntityError(
            'Idempotency key has already been used with a different request payload or endpoint.'
          );
        }

        // If still in progress, prevent race condition double-submit
        if (existing.status === 'IN_PROGRESS') {
          throw new ConflictError(
            'A request with this Idempotency-Key is currently in progress. Please retry after a few moments.'
          );
        }

        // Replay cached response
        if (existing.status === 'COMPLETED' && existing.statusCode && existing.responseBody) {
          res.setHeader('X-Idempotent-Replay', 'true');
          res.setHeader('X-Idempotency-Key', idempotencyKey);
          res.status(existing.statusCode).json(existing.responseBody);
          return;
        }
      }

      // Create new in-progress record
      const expiresAt = new Date(Date.now() + ttlHours * 3600 * 1000);

      await prisma.idempotencyRecord.create({
        data: {
          key: idempotencyKey,
          userId: req.user?.id || null,
          endpoint: `${req.method} ${req.baseUrl}${req.path}`,
          requestHash,
          status: 'IN_PROGRESS',
          expiresAt,
        },
      });

      // Intercept response to store result upon successful completion
      const originalJson = res.json.bind(res);

      res.json = function (body: any): Response {
        res.setHeader('X-Idempotency-Key', idempotencyKey);

        // Asynchronously update idempotency record upon successful completion
        const statusCode = res.statusCode || 200;
        if (statusCode >= 200 && statusCode < 400) {
          prisma.idempotencyRecord
            .update({
              where: { key: idempotencyKey },
              data: {
                status: 'COMPLETED',
                statusCode,
                responseBody: body,
              },
            })
            .catch((err) => console.error('Failed to update idempotency cache:', err));
        } else {
          // If application returned an error, mark FAILED so client can retry with same key
          prisma.idempotencyRecord
            .update({
              where: { key: idempotencyKey },
              data: {
                status: 'FAILED',
                statusCode,
                responseBody: body,
              },
            })
            .catch(() => {});
        }

        return originalJson(body);
      };

      next();
    } catch (error) {
      next(error);
    }
  };
}
