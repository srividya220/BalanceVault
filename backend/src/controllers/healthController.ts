import { Request, Response, NextFunction } from 'express';
import { prisma } from '../database/prisma';
import { rateLimitService } from '../services/rateLimitService';
import { ledgerService } from '../services/ledgerService';

export class HealthController {
  public async getLiveness(req: Request, res: Response): Promise<void> {
    res.status(200).json({
      status: 'UP',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      service: 'balancevault-api',
      version: '1.0.0',
    });
  }

  public async getReadiness(req: Request, res: Response, next: NextFunction): Promise<void> {
    const checks: Record<string, any> = {
      database: { status: 'PENDING' },
      redis: { status: 'PENDING' },
      ledgerInvariants: { status: 'PENDING' },
    };

    let overallHealthy = true;

    // 1. Check PostgreSQL Database
    try {
      const dbStart = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      checks.database = {
        status: 'UP',
        latencyMs: Date.now() - dbStart,
      };
    } catch (err: any) {
      overallHealthy = false;
      checks.database = {
        status: 'DOWN',
        error: err.message,
      };
    }

    // 2. Check Redis
    checks.redis = {
      status: rateLimitService.isConnected() ? 'UP' : 'DEGRADED',
      mode: rateLimitService.isConnected() ? 'REDIS_CLUSTER' : 'IN_MEMORY_FALLBACK',
    };

    // 3. Check Financial Invariants
    try {
      const invariantReport = await ledgerService.verifySystemInvariants();
      checks.ledgerInvariants = {
        status: invariantReport.isBalanced ? 'UP' : 'UNBALANCED',
        netDiscrepancy: invariantReport.netDiscrepancy,
        totalPostings: invariantReport.postingsCount,
      };
      if (!invariantReport.isBalanced) {
        overallHealthy = false;
      }
    } catch (err: any) {
      overallHealthy = false;
      checks.ledgerInvariants = {
        status: 'DOWN',
        error: err.message,
      };
    }

    const statusCode = overallHealthy ? 200 : 503;

    res.status(statusCode).json({
      status: overallHealthy ? 'UP' : 'DEGRADED',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      checks,
    });
  }
}

export const healthController = new HealthController();
