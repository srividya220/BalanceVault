# BalanceVault Demo Video Recording Guide (DEMO_GUIDE.md)

This guide provides a structured, timestamped script and walkthrough for recording an impressive, high-scoring technical demo video of the **BalanceVault** banking platform.

---

## 1. Pre-Recording Preparation Checklist

Before recording:
1. Ensure PostgreSQL 17 is running on port 5432.
2. Ensure you have run:
   ```bash
   npm run seed:admin
   npm run db:harden
   ```
3. Start the backend API server:
   ```bash
   npm run dev:backend
   ```
   *(Running on `http://localhost:8080`)*
4. Start the React frontend dev server:
   ```bash
   npm run dev:frontend
   ```
   *(Open in browser at `http://localhost:5173` or `http://localhost:3000`)*
5. Have a terminal window open side-by-side to show test execution (`npm test`).

---

## 2. Recommended Video Structure & Timing (5-Minute Walkthrough)

| Segment | Duration | Focus Area | Action in Demo |
|---|---|---|---|
| **1. Introduction** | 0:00 – 0:45 | Architecture Overview | Show login screen, highlight security badges, explain double-entry zero-sum guarantees. |
| **2. Customer Onboarding** | 0:45 – 1:30 | Registration & Account Creation | Register a new user, show automatic checking account issuance, open a secondary savings account. |
| **3. Financial Transactions** | 1:30 – 2:30 | Deposits, Withdrawals, Transfers | Execute deposit, perform withdrawal, trigger overdraft rejection to prove constraint defense. Execute transfer. |
| **4. Double-Entry Invariants** | 2:30 – 3:30 | Invariant Inspector & Statements | Show account statement with Debit/Credit postings; switch to Invariant Inspector showing $\sum \text{Postings} = \$0.00$. |
| **5. Concurrency & Tests** | 3:30 – 4:30 | Automated Tests & Immutability | Run `npm test` in terminal. Point out passing concurrency stress test, idempotency replay, and DB trigger rejections. |
| **6. Conclusion** | 4:30 – 5:00 | Production Readiness | Show `/api/health/ready` endpoint, highlight Docker Compose readiness and wrap up. |

---

## 3. Step-by-Step Narration Script

### [0:00 - 0:45] Introduction & System Overview
> *"Hello! Today I am presenting BalanceVault, an enterprise-grade financial banking and ledger management system engineered from the ground up to solve the hardest challenges in fintech: mathematical money conservation, concurrency-safe transactions, operation idempotency, and database-level ledger immutability.*
>
> *Here on the login screen, notice the enterprise security architecture: 256-bit encryption, Redis rate limiting, and append-only database triggers. Let's log in and see the system in action."*

### [0:45 - 1:30] Customer Onboarding & Multi-Account Management
> *"First, let's switch to 'Create an Account'. I'll register a new customer, Sarah Connor. When Sarah registers, our backend hashes her password using bcrypt, creates an immutable audit event, and automatically provisions her primary checking account with a unique account number.*
>
> *Once inside the dashboard, we see Sarah's portfolio. She can also open an additional high-yield savings account by clicking '+ Open New Account'. Notice how each account maintains an isolated balance and unique identifier."*

### [1:30 - 2:30] Financial Transactions & Overdraft Prevention
> *"Now let's move some money. First, I'll deposit $500.00 into Sarah's checking account. Behind the scenes, BalanceVault performs a double-entry transaction: crediting Sarah's account and debiting the Central System Reserve vault. The net change across the bank is strictly zero.*
>
> *Next, let's test our overdraft prevention. Sarah has $500.00. What happens if she tries to withdraw $800.00?*
> *(Click Withdraw $800)*
> *Notice the immediate error: 'Overdraft prevented: Insufficient funds.' BalanceVault implements dual-layer overdraft defense: row-level locks in application logic, plus a PostgreSQL check constraint ensuring balances can never drop below zero.*
>
> *Now let's execute a valid transfer of $150.00 to another user's account number. The transfer executes atomically with row-locking and idempotency protection."*

### [2:30 - 3:30] Audit Statements & Invariant Inspector
> *"Let's look at the Account Statement. Notice how every transaction displays exact double-entry metadata: reference code, direction (+CREDIT / -DEBIT), amount, and post-transaction balance snapshot.*
>
> *Now, let's log in as an Auditor or Administrator to inspect the mathematical integrity of the bank.*
> *(Click 'Invariant Inspector')*
> *Here in the Double-Entry Invariant Inspector, the system verifies that the sum of all debits equals the sum of all credits across the entire history of the bank. Net discrepancy is exactly $0.0000. Furthermore, our tamper-evident audit hash chain confirms that zero records have been altered."*

### [3:30 - 4:30] Live Automated Tests & Concurrency Stress Test
> *"To prove that these guarantees hold under extreme real-world conditions, let's switch to the terminal and run our automated test suite.*
> *(Run: `npm test`)*
> *Notice all 16 tests passing across 5 suites:*
> *1. Money conservation test proving zero-sum equilibrium.*
> *2. Concurrency stress test: 10 simultaneous debit requests on a $100 account. Exactly 4 succeed, 6 fail, and balance remains strictly non-negative.*
> *3. Idempotency test: duplicate requests return cached responses with header `X-Idempotent-Replay: true` without deducting twice.*
> *4. Append-only triggers test: raw SQL UPDATE and DELETE statements are rejected by PostgreSQL triggers.*
> *5. Redis rate limiting test: burst traffic receives HTTP 429 Too Many Requests."*

### [4:30 - 5:00] Deployment Health & Conclusion
> *"Finally, let's look at our deployment health check endpoint at `/api/health/ready`. It reports real-time database query latency, rate limiter operational mode, and financial invariant health. BalanceVault also includes full Docker Compose configuration with multi-stage Dockerfiles and comprehensive THREATS.md and API documentation.*
>
> *BalanceVault delivers the rock-solid reliability, mathematical precision, and security required for modern financial applications. Thank you!"*

---

## 4. Tips for High Production Quality
- **Screen Resolution**: Record in 1080p (1920x1080) or 1440p with browser zoom at 100% or 110%.
- **Audio Quality**: Use a clear microphone with minimal background noise.
- **Pacing**: Speak at a steady, confident pace. Pause for 1-2 seconds after clicking actions to let viewers see the UI notifications.
- **Mouse Movement**: Move the cursor smoothly without frantic shaking.
