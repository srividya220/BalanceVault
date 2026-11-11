-- BalanceVault Production Database Roles & Least-Privilege Access Control
-- Run this script as the PostgreSQL superuser to configure hardened roles

-- 1. Create Application Role (Used by backend API runtime)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'balancevault_app') THEN
    CREATE ROLE balancevault_app WITH LOGIN PASSWORD 'vault_app_secure_pwd_2026';
  END IF;
END
$$;

-- Grant permissions for runtime application
GRANT CONNECT ON DATABASE balancevault TO balancevault_app;
GRANT USAGE ON SCHEMA public TO balancevault_app;

-- Tables where APP needs INSERT, SELECT, UPDATE
GRANT SELECT, INSERT, UPDATE ON "Account", "User", "IdempotencyRecord" TO balancevault_app;

-- Tables where APP strictly needs INSERT & SELECT (Append-Only)
GRANT SELECT, INSERT ON "JournalEntry", "Posting", "AuditLedger" TO balancevault_app;

-- Revoke dangerous permissions
REVOKE UPDATE, DELETE ON "JournalEntry", "Posting", "AuditLedger" FROM balancevault_app;

-- 2. Create Auditor Role (Read-only access for compliance and audit logging)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'balancevault_auditor') THEN
    CREATE ROLE balancevault_auditor WITH LOGIN PASSWORD 'vault_auditor_secure_pwd_2026';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE balancevault TO balancevault_auditor;
GRANT USAGE ON SCHEMA public TO balancevault_auditor;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO balancevault_auditor;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO balancevault_auditor;

-- 3. Create Admin / Migration Role (Used by CI/CD migrations)
DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'balancevault_admin') THEN
    CREATE ROLE balancevault_admin WITH LOGIN CREATEDB PASSWORD 'vault_admin_secure_pwd_2026';
  END IF;
END
$$;

GRANT ALL PRIVILEGES ON DATABASE balancevault TO balancevault_admin;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO balancevault_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO balancevault_admin;
