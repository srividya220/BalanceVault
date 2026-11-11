import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { v4 as uuidv4 } from 'uuid';

describe('Idempotency Protection for Financial Operations', () => {
  let userToken: string;
  let accountId: string;
  let targetAccountNumber: string;

  beforeAll(async () => {
    // Register user
    const email = `idempotency.test.${Date.now()}@test.com`;
    const regRes = await request(app).post('/api/auth/register').send({
      email,
      password: 'StrongPassword123!',
      fullName: 'Idempotency Tester',
    });
    userToken = regRes.body.data.token;

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${userToken}`);
    accountId = accRes.body.data[0].id;

    // Register target user
    const regRes2 = await request(app).post('/api/auth/register').send({
      email: `idemp.target.${Date.now()}@test.com`,
      password: 'StrongPassword123!',
      fullName: 'Idempotency Target',
    });
    const accRes2 = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${regRes2.body.data.token}`);
    targetAccountNumber = accRes2.body.data[0].accountNumber;

    // Deposit funds for transfer test
    await request(app)
      .post('/api/transactions/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        accountId,
        amount: 300.0,
      });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Replayed request with the same Idempotency-Key returns cached response without duplicate deduction', async () => {
    const idempotencyKey = `idemp-key-${uuidv4()}`;

    const initialAccount = await prisma.account.findUnique({ where: { id: accountId } });
    const initialBalance = Number(initialAccount?.balance);

    const payload = {
      sourceAccountId: accountId,
      destinationAccountNumber: targetAccountNumber,
      amount: 75.0,
      description: 'Idempotent transfer test',
    };

    // First Request
    const res1 = await request(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res1.status).toBe(200);
    expect(res1.headers['x-idempotent-replay']).toBeUndefined();
    const originalRef = res1.body.data.transferDetails.reference;

    // Balance should be decreased by 75
    const midAccount = await prisma.account.findUnique({ where: { id: accountId } });
    expect(Number(midAccount?.balance)).toBe(initialBalance - 75.0);

    // Second Duplicate Request with identical key and payload
    const res2 = await request(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload);

    expect(res2.status).toBe(200);
    expect(res2.headers['x-idempotent-replay']).toBe('true');
    expect(res2.body.data.transferDetails.reference).toBe(originalRef);

    // CRITICAL: Account balance must still be decreased by only 75, NOT 150!
    const finalAccount = await prisma.account.findUnique({ where: { id: accountId } });
    expect(Number(finalAccount?.balance)).toBe(initialBalance - 75.0);
  });

  it('2. Reusing an Idempotency-Key with a different payload is rejected with 422', async () => {
    const idempotencyKey = `idemp-key-${uuidv4()}`;

    const payload1 = {
      accountId,
      amount: 10.0,
      description: 'First payload',
    };

    const res1 = await request(app)
      .post('/api/transactions/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload1);

    expect(res1.status).toBe(200);

    // Modify payload with same key
    const payload2 = {
      accountId,
      amount: 99.0, // altered amount
      description: 'Different payload',
    };

    const res2 = await request(app)
      .post('/api/transactions/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .set('Idempotency-Key', idempotencyKey)
      .send(payload2);

    expect(res2.status).toBe(422);
    expect(res2.body.error).toMatch(/different request payload/i);
  });
});
