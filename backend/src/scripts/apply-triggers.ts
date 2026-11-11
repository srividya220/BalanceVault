import { prisma } from '../database/prisma';

export async function applyDatabaseHardening(): Promise<void> {
  console.log('🔒 Applying database hardening triggers and constraints...');

  // 1. PL/pgSQL function to prevent mutation on append-only financial records
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION prevent_audit_ledger_mutation()
    RETURNS TRIGGER AS $$
    BEGIN
      RAISE EXCEPTION 'Audit ledger and financial postings are append-only. UPDATE and DELETE operations are strictly prohibited by database security policy.';
    END;
    $$ LANGUAGE plpgsql;
  `);

  // 2. Triggers on AuditLedger
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS audit_ledger_immutable_trigger ON "AuditLedger";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER audit_ledger_immutable_trigger
    BEFORE UPDATE OR DELETE ON "AuditLedger"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_ledger_mutation();
  `);

  // 3. Triggers on Posting
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS postings_immutable_trigger ON "Posting";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER postings_immutable_trigger
    BEFORE UPDATE OR DELETE ON "Posting"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_ledger_mutation();
  `);

  // 4. Triggers on JournalEntry
  await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS journal_entries_immutable_trigger ON "JournalEntry";`);
  await prisma.$executeRawUnsafe(`
    CREATE TRIGGER journal_entries_immutable_trigger
    BEFORE UPDATE OR DELETE ON "JournalEntry"
    FOR EACH ROW
    EXECUTE FUNCTION prevent_audit_ledger_mutation();
  `);

  // 5. Database-level Check Constraint for Overdraft Protection
  await prisma.$executeRawUnsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'account_balance_non_negative_check'
      ) THEN
        ALTER TABLE "Account"
        ADD CONSTRAINT account_balance_non_negative_check
        CHECK (balance >= 0 OR "accountType" = 'SYSTEM_RESERVE');
      END IF;
    END $$;
  `);

  console.log('✓ Successfully applied database-level immutable triggers and overdraft check constraints.');
}

if (require.main === module) {
  applyDatabaseHardening()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to apply database hardening:', err);
      process.exit(1);
    });
}
