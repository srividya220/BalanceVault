# BalanceVault REST API Documentation (API_DOCS.md)

BalanceVault provides a hardened, RESTful JSON API for double-entry financial transactions, account management, and auditable ledger operations.

- **Base URL**: `http://localhost:8080/api`
- **Authentication**: `Authorization: Bearer <JWT_TOKEN>`
- **Idempotency**: `Idempotency-Key: <UUID_OR_UNIQUE_STRING>` (Required/Recommended on state-modifying requests)
- **Rate Limit Headers**: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

---

## Table of Contents
1. [Authentication Endpoints](#1-authentication-endpoints)
2. [Account Management Endpoints](#2-account-management-endpoints)
3. [Financial Transaction Endpoints](#3-financial-transaction-endpoints)
4. [Governance & Audit Endpoints](#4-governance--audit-endpoints)
5. [Health & Deployment Observability](#5-health--deployment-observability)
6. [HTTP Status Codes & Error Formats](#6-http-status-codes--error-formats)

---

## 1. Authentication Endpoints

### 1.1 Register New User
Creates a user profile, hashes password with bcrypt, and automatically provisions an initial primary checking account.

- **Method**: `POST`
- **Path**: `/api/auth/register`
- **Rate Limit**: 15 requests / minute
- **Request Body**:
  ```json
  {
    "email": "alice@example.com",
    "password": "StrongPassword123!",
    "fullName": "Alice Johnson",
    "role": "CUSTOMER"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "User registered successfully. Primary account created.",
    "data": {
      "user": {
        "id": "787c8808-8e62-4e89-bd66-bf5f7957ee01",
        "email": "alice@example.com",
        "fullName": "Alice Johnson",
        "role": "CUSTOMER"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

---

### 1.2 User Login
Authenticates credentials and returns a signed JWT bearer token.

- **Method**: `POST`
- **Path**: `/api/auth/login`
- **Rate Limit**: 15 requests / minute
- **Request Body**:
  ```json
  {
    "email": "alice@example.com",
    "password": "StrongPassword123!"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Authentication successful",
    "data": {
      "user": {
        "id": "787c8808-8e62-4e89-bd66-bf5f7957ee01",
        "email": "alice@example.com",
        "fullName": "Alice Johnson",
        "role": "CUSTOMER"
      },
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
    }
  }
  ```

---

### 1.3 Get Current User Profile
Returns authenticated user identity and associated account overview.

- **Method**: `GET`
- **Path**: `/api/auth/me`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "id": "787c8808-8e62-4e89-bd66-bf5f7957ee01",
      "email": "alice@example.com",
      "fullName": "Alice Johnson",
      "role": "CUSTOMER",
      "isActive": true,
      "accounts": [
        {
          "id": "acc-uuid-1",
          "accountNumber": "BV-84920145",
          "accountType": "CHECKING",
          "currency": "USD",
          "status": "ACTIVE",
          "balance": "500.0000"
        }
      ]
    }
  }
  ```

---

## 2. Account Management Endpoints

### 2.1 List User Accounts
Returns all bank accounts owned by the authenticated caller.

- **Method**: `GET`
- **Path**: `/api/accounts`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": [
      {
        "id": "acc-uuid-1",
        "accountNumber": "BV-84920145",
        "userId": "user-uuid-1",
        "accountType": "CHECKING",
        "currency": "USD",
        "status": "ACTIVE",
        "balance": "500.0000",
        "createdAt": "2026-11-10T14:00:00.000Z"
      }
    ]
  }
  ```

---

### 2.2 Create Additional Account
Opens a new Checking or Savings account under the authenticated user.

- **Method**: `POST`
- **Path**: `/api/accounts`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  {
    "accountType": "SAVINGS",
    "currency": "USD"
  }
  ```
- **Response (201 Created)**:
  ```json
  {
    "success": true,
    "message": "Account created successfully",
    "data": {
      "id": "acc-uuid-2",
      "accountNumber": "BV-91238472",
      "accountType": "SAVINGS",
      "balance": "0.0000",
      "status": "ACTIVE"
    }
  }
  ```

---

### 2.3 Get Account Statement
Returns chronological double-entry postings for an account, with balance snapshots after each transaction.

- **Method**: `GET`
- **Path**: `/api/accounts/:id/statement?limit=50`
- **Headers**: `Authorization: Bearer <TOKEN>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "account": {
        "id": "acc-uuid-1",
        "accountNumber": "BV-84920145",
        "balance": "425.0000"
      },
      "statement": [
        {
          "postingId": "post-uuid-2",
          "reference": "BV-TXN-20261110-8A9C12",
          "entryType": "TRANSFER",
          "description": "Transfer to BV-91238472",
          "direction": "DEBIT",
          "amount": "75.0000",
          "signedAmount": "-75.0000",
          "balanceAfter": "425.0000",
          "timestamp": "2026-11-10T14:15:00.000Z"
        },
        {
          "postingId": "post-uuid-1",
          "reference": "BV-TXN-20261110-3F1B90",
          "entryType": "DEPOSIT",
          "description": "Initial deposit",
          "direction": "CREDIT",
          "amount": "500.0000",
          "signedAmount": "500.0000",
          "balanceAfter": "500.0000",
          "timestamp": "2026-11-10T14:05:00.000Z"
        }
      ]
    }
  }
  ```

---

## 3. Financial Transaction Endpoints

### 3.1 Deposit Funds
Transfers funds from the central system reserve into a customer account. Maintains strict zero-sum postings: (+Amount to Customer) + (-Amount to Reserve) = 0.

- **Method**: `POST`
- **Path**: `/api/transactions/deposit`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  {
    "accountId": "acc-uuid-1",
    "amount": 250.00,
    "description": "Liquidity top-up"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Deposit executed successfully",
    "data": {
      "journalEntry": {
        "id": "je-uuid-1",
        "reference": "BV-TXN-20261110-8A19B2",
        "entryType": "DEPOSIT",
        "amount": "250.0000",
        "status": "POSTED"
      },
      "targetAccount": {
        "id": "acc-uuid-1",
        "accountNumber": "BV-84920145",
        "previousBalance": "500.0000",
        "newBalance": "750.0000"
      }
    }
  }
  ```

---

### 3.2 Withdraw Funds
Debits an account with row-level locks and strict overdraft prevention. Transfers funds back to the central reserve.

- **Method**: `POST`
- **Path**: `/api/transactions/withdraw`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  {
    "accountId": "acc-uuid-1",
    "amount": 100.00,
    "description": "ATM cash withdrawal"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Withdrawal executed successfully",
    "data": {
      "journalEntry": {
        "id": "je-uuid-2",
        "reference": "BV-TXN-20261110-99AC23",
        "entryType": "WITHDRAWAL",
        "amount": "100.0000",
        "status": "POSTED"
      },
      "sourceAccount": {
        "id": "acc-uuid-1",
        "accountNumber": "BV-84920145",
        "previousBalance": "750.0000",
        "newBalance": "650.0000"
      }
    }
  }
  ```
- **Error (400 Bad Request - Overdraft Prevented)**:
  ```json
  {
    "success": false,
    "error": "Overdraft prevented: Insufficient funds. Available balance: $50.00, requested: $100.00.",
    "statusCode": 400
  }
  ```

---

### 3.3 Account-to-Account Transfer
Executes an atomic transfer between two accounts using sorted row-level locks to prevent deadlocks and race conditions.

- **Method**: `POST`
- **Path**: `/api/transactions/transfer`
- **Headers**: `Authorization: Bearer <TOKEN>`, `Idempotency-Key: <UUID>`
- **Request Body**:
  ```json
  {
    "sourceAccountId": "acc-uuid-1",
    "destinationAccountNumber": "BV-91238472",
    "amount": 75.00,
    "description": "Invoice payment"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Transfer executed successfully",
    "data": {
      "journalEntry": {
        "id": "je-uuid-3",
        "reference": "BV-TXN-20261110-44AA19",
        "entryType": "TRANSFER",
        "amount": "75.0000"
      },
      "transferDetails": {
        "reference": "BV-TXN-20261110-44AA19",
        "amount": 75.0,
        "sourceAccountNumber": "BV-84920145",
        "sourceNewBalance": "575.0000",
        "destinationAccountNumber": "BV-91238472",
        "destinationNewBalance": "75.0000"
      }
    }
  }
  ```

---

## 4. Governance & Audit Endpoints

*Requires Role: `ADMIN` or `AUDITOR`*

### 4.1 Verify System Invariants
Computes real-time mathematical proof that the ledger is balanced to zero.

- **Method**: `GET`
- **Path**: `/api/admin/ledger/verify-invariants`
- **Headers**: `Authorization: Bearer <ADMIN_OR_AUDITOR_TOKEN>`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "isBalanced": true,
      "totalDebits": "1500.0000",
      "totalCredits": "1500.0000",
      "netDiscrepancy": "0.0000",
      "accountBalancesSum": "1500.0000",
      "systemReserveBalance": "-1500.0000",
      "totalSystemEquity": "0.0000",
      "postingsCount": 14,
      "journalEntriesCount": 7,
      "verifiedAt": "2026-11-10T14:20:00.000Z"
    }
  }
  ```

---

### 4.2 Verify Cryptographic Audit Chain
Traverses all historical `AuditLedger` records and validates SHA-256 links to detect any unauthorized database tampering.

- **Method**: `GET`
- **Path**: `/api/admin/audit/verify-chain`
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "data": {
      "isValid": true,
      "totalVerified": 28
    }
  }
  ```

---

### 4.3 Update Account Status (Freeze/Unfreeze)
*Requires Role: `ADMIN`*

- **Method**: `PATCH`
- **Path**: `/api/admin/accounts/:id/status`
- **Request Body**:
  ```json
  { "status": "FROZEN" }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "message": "Account status updated to FROZEN",
    "data": { "id": "acc-uuid-1", "status": "FROZEN" }
  }
  ```

---

## 5. Health & Deployment Observability

### 5.1 Liveness Probe
- **Method**: `GET`
- **Path**: `/api/health`
- **Response (200 OK)**:
  ```json
  {
    "status": "UP",
    "uptime": 1284.5,
    "service": "balancevault-api",
    "version": "1.0.0"
  }
  ```

---

### 5.2 Readiness Probe
Deep check evaluating PostgreSQL query latency, Redis rate limiter mode, and financial ledger zero-sum equilibrium.

- **Method**: `GET`
- **Path**: `/api/health/ready`
- **Response (200 OK)**:
  ```json
  {
    "status": "UP",
    "timestamp": "2026-11-10T14:22:00.000Z",
    "uptime": 1284.5,
    "checks": {
      "database": {
        "status": "UP",
        "latencyMs": 4
      },
      "redis": {
        "status": "DEGRADED",
        "mode": "IN_MEMORY_FALLBACK"
      },
      "ledgerInvariants": {
        "status": "UP",
        "netDiscrepancy": "0.0000",
        "totalPostings": 14
      }
    }
  }
  ```

---

## 6. HTTP Status Codes & Error Formats

| Status Code | Meaning | Example Scenario |
|---|---|---|
| `200 OK` | Request succeeded | Successful GET, withdrawal, or transfer. |
| `201 Created` | Resource created | Successful registration or account opening. |
| `400 Bad Request` | Validation failure / Overdraft | Overdraft prevented; negative transaction amount. |
| `401 Unauthorized` | Missing or invalid authentication | Expired JWT token; missing Bearer header. |
| `403 Forbidden` | Access control violation | Customer attempting to access Admin endpoints; DB trigger preventing UPDATE. |
| `404 Not Found` | Target not found | Account number does not exist. |
| `409 Conflict` | Unique conflict / In-flight idempotency | Email already in use; duplicate in-flight idempotency request. |
| `422 Unprocessable` | Idempotency payload mismatch | Same idempotency key reused with different amount or payload. |
| `429 Too Many Requests` | Rate limit breached | Exceeded sliding-window request threshold. |
| `500 Server Error` | Internal system error | Unexpected database or runtime fault. |

### Standard Error Response Schema:
```json
{
  "success": false,
  "error": "Error description message",
  "statusCode": 400,
  "details": null
}
```
