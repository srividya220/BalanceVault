# BalanceVault AI Assistance & Prompt Engineering Log (PROMPTS.md)

This log records the prompts, technical reasoning, and engineering decisions utilized during the construction of the **BalanceVault** financial banking application.

---

## 1. System Prompt & High-Level Directives

### Primary User Instruction
```text
Build a complete, production-oriented financial application named BalanceVault from scratch, based on my Snovasys challenge requirements.
Do not stop after generating a basic frontend or backend. Build the complete working project, including:
1. React frontend with a professional banking dashboard and responsive design.
2. Backend REST APIs with authentication and authorization.
3. PostgreSQL database with Prisma ORM, schema and migrations.
4. User registration, login, first-admin bootstrap script and role-based access control (RBAC).
5. Account creation and management.
6. Deposits, withdrawals and account-to-account transfers.
7. Double-entry accounting with strict money-conservation invariants.
8. Idempotency protection for financial operations.
9. Concurrency-safe transactions and overdraft prevention.
10. Append-only audit ledger, including database-level protection against UPDATE and DELETE.
11. Redis-based rate limiting.
12. Database roles and deployment health checks.
13. Automated tests covering concurrency, idempotency, overdrafts and money conservation.
14. THREATS.md documenting security threats and mitigations.
15. PROMPTS.md documenting AI assistance used.
16. Complete API documentation.
17. Deployment configuration and environment-variable examples.
18. Technical write-up and instructions for recording a demo video.
```

---

## 2. Iterative Engineering Prompts & Rationale

### Prompt Sequence 1: System Inspection & Pre-Flight Discovery
- **Engineering Goal**: Assess existing environment, identify installed binaries (Node 24, npm 11, PostgreSQL 17), detect running services on port 5432 and 6379, and verify database credentials.
- **AI Decision Log**: Discovered PostgreSQL 17 running on localhost:5432 with credential `Srividya@2005`. Created a dedicated database `balancevault`.

### Prompt Sequence 2: Prisma Schema & Double-Entry Data Modeling
- **Engineering Goal**: Define relational models for double-entry bookkeeping, strict money conservation, idempotency caching, and audit logging.
- **Architectural Rationale**:
  - `JournalEntry`: Represents the business transaction event (DEPOSIT, WITHDRAWAL, TRANSFER).
  - `Posting`: Represents the balanced legs of each transaction (DEBIT and CREDIT), storing `signedAmount` and `balanceAfter`.
  - `IdempotencyRecord`: Stores `key`, `requestHash`, `status`, `statusCode`, and `responseBody`.
  - `AuditLedger`: Stores append-only audit events with `prevHash` and `currentHash` for SHA-256 blockchain-style chaining.

### Prompt Sequence 3: Database Hardening (Append-Only Triggers & Constraints)
- **Engineering Goal**: Implement database-level guarantees that cannot be bypassed by application code or accidental ORM updates.
- **AI Decision Log**:
  - Authored PL/pgSQL function `prevent_audit_ledger_mutation()` and attached triggers to `AuditLedger`, `Posting`, and `JournalEntry` on `BEFORE UPDATE OR DELETE`.
  - Added PostgreSQL check constraint: `CHECK (balance >= 0 OR "accountType" = 'SYSTEM_RESERVE')`.
  - Split multiple SQL statements to avoid PostgreSQL prepared statement error `42601`.

### Prompt Sequence 4: Concurrency Locking & Deadlock Elimination
- **Engineering Goal**: Ensure account-to-account transfers are completely race-condition free and deadlock-proof.
- **Architectural Rationale**:
  - Implemented lexicographical ordering of account IDs prior to `SELECT ... FOR UPDATE` acquisition:
    ```typescript
    const sortedIds = [sourceCheck.id, destCheck.id].sort();
    ```
  - Ordering ensures concurrent reciprocal transfers (A $\rightarrow$ B and B $\rightarrow$ A) always lock accounts in identical sequence ($A$ then $B$), eliminating relational deadlocks.

### Prompt Sequence 5: Idempotency Protection System
- **Engineering Goal**: Guarantee safe retries for financial operations without duplicate postings.
- **Architectural Rationale**:
  - Implemented `idempotencyMiddleware` using SHA-256 fingerprinting of `method + url + user + body`.
  - Handles concurrent in-flight requests with HTTP 409 Conflict.
  - Returns cached response with `X-Idempotent-Replay: true` on identical duplicate submission.
  - Rejects mismatched payloads reusing the same key with HTTP 422 Unprocessable Entity.

### Prompt Sequence 6: Resilient Rate Limiting Architecture
- **Engineering Goal**: Protect against credential brute-forcing and API flooding using Redis, with reliable fallback.
- **AI Decision Log**:
  - Designed sliding-window counter algorithm with Redis multi-pipeline (`zremrangebyscore`, `zadd`, `zcard`, `pexpire`).
  - Added in-memory fallback that smoothly activates if Redis is offline, preventing service disruption during local development and testing.

### Prompt Sequence 7: Automated Test Suite & Verification
- **Engineering Goal**: Validate all financial guarantees with automated integration tests.
- **AI Decision Log**:
  - Created 5 test suites covering 16 comprehensive test cases:
    1. `append-only-triggers.test.ts`: DB triggers reject raw UPDATE and DELETE; validates audit hash chain.
    2. `rate-limiting.test.ts`: Header verification; 429 Too Many Requests enforcement.
    3. `overdraft-concurrency.test.ts`: Single overdraft rejection; 10 concurrent requests stress test on $100 balance.
    4. `money-conservation.test.ts`: Zero-sum verification ($\sum \Delta = 0$); global invariant check.
    5. `idempotency.test.ts`: Cache replay without balance change; payload alteration detection.
  - Resolved TypeScript strict type mismatch on `actorId`.
  - All 16 tests executed and verified with 100% pass rate.

### Prompt Sequence 8: Frontend Banking Dashboard (React + Vite)
- **Engineering Goal**: Provide a responsive, high-assurance banking dashboard matching enterprise aesthetics.
- **Architectural Rationale**:
  - Created portfolio overview, multi-account switcher, direct deposit/withdraw/transfer modals with automatic idempotency key generation.
  - Built an Auditor & Invariant Inspector view providing real-time mathematical proof that the ledger is balanced ($\Delta = 0.0000$).
  - Added bank administration controls for freezing/unfreezing accounts and auditing user directories.
