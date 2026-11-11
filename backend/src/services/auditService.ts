import crypto from 'crypto';
import { prisma } from '../database/prisma';

export interface CreateAuditLogParams {
  action: string;
  entityType: string;
  entityId: string;
  actorId?: string | null;
  actorRole?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  payload?: any;
}

export class AuditService {
  /**
   * Appends an immutable audit event to the AuditLedger with cryptographic hash chaining.
   */
  public async logEvent(params: CreateAuditLogParams): Promise<void> {
    try {
      // Get the latest audit log to establish hash link
      const lastLog = await prisma.auditLedger.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { currentHash: true },
      });

      const prevHash = lastLog?.currentHash || 'GENESIS_HASH_000000000000000000000000000000000000000000000000000000000000';
      const timestamp = new Date();

      // Compute tamper-evident SHA-256 hash
      const payloadString = params.payload ? JSON.stringify(params.payload) : '';
      const rawData = `${prevHash}|${params.action}|${params.entityType}|${params.entityId}|${params.actorId || 'SYSTEM'}|${payloadString}|${timestamp.toISOString()}`;
      const currentHash = crypto.createHash('sha256').update(rawData).digest('hex');

      await prisma.auditLedger.create({
        data: {
          action: params.action,
          entityType: params.entityType,
          entityId: params.entityId,
          actorId: params.actorId || null,
          actorRole: params.actorRole || null,
          ipAddress: params.ipAddress || null,
          userAgent: params.userAgent || null,
          payload: params.payload || undefined,
          prevHash,
          currentHash,
          createdAt: timestamp,
        },
      });
    } catch (error) {
      console.error('Failed to append audit event:', error);
      // Non-fatal logging failure should not crash application unless strict mode is enabled
    }
  }

  /**
   * Verifies the cryptographic chain of all audit logs to detect any out-of-band tampering.
   */
  public async verifyAuditChainIntegrity(): Promise<{
    isValid: boolean;
    totalVerified: number;
    tamperedRecordId?: string;
  }> {
    const logs = await prisma.auditLedger.findMany({
      orderBy: { createdAt: 'asc' },
    });

    let expectedPrevHash = 'GENESIS_HASH_000000000000000000000000000000000000000000000000000000000000';

    for (const log of logs) {
      if (log.prevHash !== expectedPrevHash) {
        return {
          isValid: false,
          totalVerified: logs.length,
          tamperedRecordId: log.id,
        };
      }

      const payloadString = log.payload ? JSON.stringify(log.payload) : '';
      const rawData = `${expectedPrevHash}|${log.action}|${log.entityType}|${log.entityId}|${log.actorId || 'SYSTEM'}|${payloadString}|${log.createdAt.toISOString()}`;
      const computedHash = crypto.createHash('sha256').update(rawData).digest('hex');

      if (log.currentHash !== computedHash) {
        return {
          isValid: false,
          totalVerified: logs.length,
          tamperedRecordId: log.id,
        };
      }

      expectedPrevHash = log.currentHash;
    }

    return {
      isValid: true,
      totalVerified: logs.length,
    };
  }
}

export const auditService = new AuditService();
