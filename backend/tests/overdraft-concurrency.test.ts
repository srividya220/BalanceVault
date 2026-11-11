import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';

describe('Concurrency Safety & Overdraft Prevention', () => {
  let userToken: string;
  let accountId: string;
  let targetAccountNumber: string;

  beforeAll(async () => {
    // Register test user
    const email = `concurrency.test.${Date.now()}@test.com`;
    const regRes = await request(app).post('/api/auth/register').send({
      email,
      password: 'StrongPassword123!',
      fullName: 'Concurrency Tester',
    });
    userToken = regRes.body.data.token;

    const accRes = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${userToken}`);
    accountId = accRes.body.data[0].id;

    // Register second user for transfer target
    const regRes2 = await request(app).post('/api/auth/register').send({
      email: `target.user.${Date.now()}@test.com`,
      password: 'StrongPassword123!',
      fullName: 'Target User',
    });
    const accRes2 = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${regRes2.body.data.token}`);
    targetAccountNumber = accRes2.body.data[0].accountNumber;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Overdraft is prevented when withdrawing more than current balance', async () => {
    // Current balance is 0.00
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        accountId,
        amount: 50.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Overdraft prevented/i);
  });

  it('2. Overdraft is prevented when transferring more than current balance', async () => {
    const res = await request(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        sourceAccountId: accountId,
        destinationAccountNumber: targetAccountNumber,
        amount: 1000.0,
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Overdraft prevented/i);
  });

  it('3. Concurrency Stress Test: 10 simultaneous debit requests cannot overdraft the account', async () => {
    // First, deposit exactly $100.00
    const depRes = await request(app)
      .post('/api/transactions/deposit')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        accountId,
        amount: 100.0,
      });
    expect(depRes.status).toBe(200);

    // Now fire 10 concurrent withdrawal requests of $25.00 each ($250 total requested)
    const withdrawalPromises = Array.from({ length: 10 }, (_, i) =>
      request(app)
        .post('/api/transactions/withdraw')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          accountId,
          amount: 25.0,
          description: `Concurrent request #${i + 1}`,
        })
    );

    const responses = await Promise.all(withdrawalPromises);

    const succeeded = responses.filter((r) => r.status === 200);
    const failed = responses.filter((r) => r.status === 400);

    // Exactly 4 requests should succeed ($25 x 4 = $100)
    expect(succeeded.length).toBe(4);
    // Exactly 6 requests should fail due to overdraft protection
    expect(failed.length).toBe(6);

    for (const failure of failed) {
      expect(failure.body.error).toMatch(/Overdraft prevented/i);
    }

    // Verify final account balance is exactly 0.00 and NEVER negative
    const finalAccount = await prisma.account.findUnique({ where: { id: accountId } });
    expect(Number(finalAccount?.balance)).toBe(0.0);
    expect(Number(finalAccount?.balance)).toBeGreaterThanOrEqual(0.0);
  });
});
