# BalanceVault: High-Assurance Financial Banking & Ledger Platform

BalanceVault is a production-oriented double-entry financial application engineered with strict money conservation, idempotency protection, concurrency safety, and database-level append-only immutability.

---

## Key Highlights & Core Invariants

1. **Strict Double-Entry Equilibrium**: Every financial operation (Deposit, Withdrawal, Transfer) records balanced postings such that $\sum \Delta_{\text{Postings}} = 0.0000$.
2. **Dual-Layer Overdraft Defense**: Application pre-commit row checks combined with a PostgreSQL database check constraint (`CHECK (balance >= 0 OR "accountType" = 'SYSTEM_RESERVE')`).
3. **Deadlock-Free Lexicographical Row Locking**: Inter-account transfers sort UUIDs prior to acquiring `SELECT ... FOR UPDATE` locks, eliminating deadlocks under high concurrency.
4. **Idempotency Protection**: Deterministic SHA-256 fingerprinting on `Idempotency-Key` headers prevents accidental double debits or replay attacks.
5. **Database-Level Immutability**: PostgreSQL PL/pgSQL triggers reject any `UPDATE` or `DELETE` statements on `Posting`, `JournalEntry`, and `AuditLedger`.
6. **Cryptographic Audit Chain**: Every audit event links to the preceding record with a SHA-256 hash digest, creating a tamper-evident audit trail.
7. **Redis Rate Limiting**: Sliding-window rate limiter with graceful in-memory fallback.
8. **Role-Based Access Control**: Tiered security for `CUSTOMER`, `ADMIN`, and `AUDITOR` roles.

---

## Architecture & Technology Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 19, Vite 8, Modern CSS, Responsive Design |
| **Backend API** | Node.js (v24), TypeScript, Express.js |
| **Database & ORM** | PostgreSQL 17, Prisma ORM 5 |
| **Caching & Rate Limiting** | Redis 7 (`ioredis`) with sliding window counter & memory fallback |
| **Security & Auth** | bcryptjs, jsonwebtoken, SHA-256 tamper-evident hash chaining |
| **Testing** | Jest, ts-jest, Supertest |
| **Containerization** | Docker, Multi-stage Dockerfiles, Docker Compose |

---

## Project Structure

```text
├── backend/
│   ├── prisma/
│   │   └── schema.prisma         # Relational data models
│   ├── scripts/
│   │   ├── bootstrap-admin.ts    # First-admin seeding CLI
│   │   └── db-roles.sql          # Least-privilege PostgreSQL roles
│   ├── src/
│   │   ├── config/               # Typed environment variables
│   │   ├── controllers/          # Auth, Account, Transaction, Admin, Health
│   │   ├── database/             # Prisma client singleton
│   │   ├── errors/               # Custom HTTP error hierarchy
│   │   ├── middlewares/          # Auth, RBAC, Idempotency, Rate Limiting, Error Handler
│   │   ├── routes/               # Modular Express API routes
│   │   ├── scripts/              # Hardening triggers script
│   │   ├── services/             # Ledger, Account, Auth, Audit, Rate Limit
│   │   ├── app.ts                # Express app setup
│   │   └── server.ts             # Server entry point
│   ├── tests/                    # Integration & invariant test suites
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── App.jsx               # Banking dashboard component
│   │   ├── api.js                # Axios client with interceptors
│   │   └── index.css             # Responsive styling
│   ├── Dockerfile
│   └── nginx.conf
├── docker-compose.yml            # Complete stack orchestration
├── THREATS.md                    # Comprehensive STRIDE & OWASP security model
├── PROMPTS.md                    # AI assistance and engineering rationale log
├── API_DOCS.md                   # Full REST API documentation & curl examples
├── ARCHITECTURE.md               # Deep technical write-up & mathematical proofs
├── DEMO_GUIDE.md                 # 5-minute video recording script & walkthrough
└── README.md                     # This file
```

---

## Getting Started

### Prerequisites
- Node.js >= 20
- PostgreSQL >= 16
- Redis (Optional, automatic in-memory fallback enabled)

### Local Setup
1. **Clone and Install Dependencies**:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `backend/.env` and update credentials:
   ```env
   DATABASE_URL="postgresql://postgres:<password>@localhost:5432/balancevault?schema=public"
   JWT_SECRET="your-secure-jwt-secret-key"
   ADMIN_EMAIL="admin@balancevault.com"
   ADMIN_PASSWORD="AdminVaultPassword2026!"
   ```

3. **Run Migrations & Database Hardening**:
   ```bash
   cd backend
   npx prisma db push
   npm run db:harden
   ```

4. **Bootstrap First Administrator**:
   ```bash
   npm run seed:admin
   ```

5. **Execute Automated Tests**:
   ```bash
   npm test
   ```
   *(All 16 tests in 5 suites should pass)*

6. **Start Application**:
   ```bash
   # Terminal 1: Backend API (Port 8080)
   npm run start:backend

   # Terminal 2: React Frontend (Port 5173 / 3000)
   npm run dev:frontend
   ```

---

## Docker Compose Quickstart

To run the complete production stack (Postgres + Redis + Backend + Frontend Nginx) in containers:
```bash
docker compose up --build -d
```
- Frontend UI: `http://localhost:3000`
- Backend API: `http://localhost:8080`
- API Health Check: `http://localhost:8080/api/health/ready`

---

## Verification & Automated Test Suites

The test suite validates the core financial requirements:
- `append-only-triggers.test.ts`: Confirms PostgreSQL triggers reject raw `UPDATE` and `DELETE` on financial ledger and audit tables.
- `overdraft-concurrency.test.ts`: Fires 10 concurrent debit requests simultaneously against an account; verifies exactly 4 succeed, 6 fail, and balance remains $\ge 0$.
- `money-conservation.test.ts`: Proves $\sum \text{Postings} = 0$ for deposits, withdrawals, transfers, and global system reserve.
- `idempotency.test.ts`: Verifies duplicate requests with identical `Idempotency-Key` replay cached responses without secondary balance deductions.
- `rate-limiting.test.ts`: Validates rate limit headers and 429 throttling under burst traffic.
