import { prisma } from '../src/database/prisma';
import { auditService } from '../src/services/auditService';

describe('Append-Only Audit Ledger & Database Trigger Protection', () => {
  beforeAll(async () => {
    // Ensure test event exists
    await auditService.logEvent({
      action: 'TRIGGER_TEST_EVENT',
      entityType: 'TEST',
      entityId: 'test-entity-1',
      payload: { test: true },
    });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Database trigger prevents UPDATE on AuditLedger table', async () => {
    const testLog = await prisma.auditLedger.findFirst({
      where: { action: 'TRIGGER_TEST_EVENT' },
    });
    expect(testLog).toBeDefined();

    let errorThrown = false;
    try {
      await prisma.$executeRawUnsafe(
        `UPDATE "AuditLedger" SET action = 'TAMPERED_ACTION' WHERE id = '${testLog!.id}'`
      );
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toMatch(/append-only/i);
    }

    expect(errorThrown).toBe(true);

    // Verify record was untouched
    const freshLog = await prisma.auditLedger.findUnique({ where: { id: testLog!.id } });
    expect(freshLog?.action).toBe('TRIGGER_TEST_EVENT');
  });

  it('2. Database trigger prevents DELETE on AuditLedger table', async () => {
    const testLog = await prisma.auditLedger.findFirst({
      where: { action: 'TRIGGER_TEST_EVENT' },
    });

    let errorThrown = false;
    try {
      await prisma.$executeRawUnsafe(
        `DELETE FROM "AuditLedger" WHERE id = '${testLog!.id}'`
      );
    } catch (err: any) {
      errorThrown = true;
      expect(err.message).toMatch(/append-only/i);
    }

    expect(errorThrown).toBe(true);

    // Verify record still exists
    const freshLog = await prisma.auditLedger.findUnique({ where: { id: testLog!.id } });
    expect(freshLog).toBeDefined();
  });

  it('3. Database trigger prevents UPDATE on Posting table', async () => {
    const posting = await prisma.posting.findFirst();
    if (posting) {
      let errorThrown = false;
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Posting" SET amount = 99999 WHERE id = '${posting.id}'`
        );
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/append-only/i);
      }
      expect(errorThrown).toBe(true);
    }
  });

  it('4. Database trigger prevents DELETE on Posting table', async () => {
    const posting = await prisma.posting.findFirst();
    if (posting) {
      let errorThrown = false;
      try {
        await prisma.$executeRawUnsafe(
          `DELETE FROM "Posting" WHERE id = '${posting.id}'`
        );
      } catch (err: any) {
        errorThrown = true;
        expect(err.message).toMatch(/append-only/i);
      }
      expect(errorThrown).toBe(true);
    }
  });

  it('5. Tamper-evident cryptographic hash chain is valid across all audit entries', async () => {
    const verification = await auditService.verifyAuditChainIntegrity();
    expect(verification.isValid).toBe(true);
    expect(verification.totalVerified).toBeGreaterThan(0);
  });
});
