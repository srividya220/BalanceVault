import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { ledgerService } from '../src/services/ledgerService';

describe('Double-Entry Accounting & Money Conservation Invariants', () => {
  let customerToken: string;
  let customerAccountId: string;
  let destAccountId: string;
  let destAccountNumber: string;

  beforeAll(async () => {
    // Register User A
    const userAEmail = `user.a.${Date.now()}@test.com`;
    const regResA = await request(app).post('/api/auth/register').send({
      email: userAEmail,
      password: 'Password123!',
      fullName: 'Alice Invariant',
    });
    customerToken = regResA.body.data.token;

    // Get User A's account
    const accountsResA = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${customerToken}`);
    customerAccountId = accountsResA.body.data[0].id;

    // Register User B
    const userBEmail = `user.b.${Date.now()}@test.com`;
    const regResB = await request(app).post('/api/auth/register').send({
      email: userBEmail,
      password: 'Password123!',
      fullName: 'Bob Invariant',
    });
    const tokenB = regResB.body.data.token;

    const accountsResB = await request(app)
      .get('/api/accounts')
      .set('Authorization', `Bearer ${tokenB}`);
    destAccountId = accountsResB.body.data[0].id;
    destAccountNumber = accountsResB.body.data[0].accountNumber;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('1. Deposit maintains strict zero-sum postings and increases balance', async () => {
    const depositAmount = 500.0;
    const res = await request(app)
      .post('/api/transactions/deposit')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        accountId: customerAccountId,
        amount: depositAmount,
        description: 'Test invariant deposit',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Number(res.body.data.targetAccount.newBalance)).toBeGreaterThanOrEqual(depositAmount);

    // Verify journal postings balance to 0
    const journalId = res.body.data.journalEntry.id;
    const postings = await prisma.posting.findMany({ where: { journalEntryId: journalId } });
    expect(postings.length).toBe(2);

    const sumSigned = postings.reduce((acc, p) => acc + Number(p.signedAmount), 0);
    expect(Math.abs(sumSigned)).toBeLessThan(0.0001);
  });

  it('2. Account-to-Account Transfer conserves exact money across accounts', async () => {
    const transferAmount = 150.0;
    const res = await request(app)
      .post('/api/transactions/transfer')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        sourceAccountId: customerAccountId,
        destinationAccountNumber: destAccountNumber,
        amount: transferAmount,
        description: 'Test invariant transfer',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const journalId = res.body.data.journalEntry.id;
    const postings = await prisma.posting.findMany({ where: { journalEntryId: journalId } });
    expect(postings.length).toBe(2);

    const sumSigned = postings.reduce((acc, p) => acc + Number(p.signedAmount), 0);
    expect(Math.abs(sumSigned)).toBeLessThan(0.0001);
  });

  it('3. Withdrawal maintains zero-sum postings', async () => {
    const withdrawAmount = 50.0;
    const res = await request(app)
      .post('/api/transactions/withdraw')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        accountId: customerAccountId,
        amount: withdrawAmount,
        description: 'Test invariant withdrawal',
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const journalId = res.body.data.journalEntry.id;
    const postings = await prisma.posting.findMany({ where: { journalEntryId: journalId } });
    expect(postings.length).toBe(2);

    const sumSigned = postings.reduce((acc, p) => acc + Number(p.signedAmount), 0);
    expect(Math.abs(sumSigned)).toBeLessThan(0.0001);
  });

  it('4. Global System Invariant: Net balance across all accounts and system reserve equals strictly 0', async () => {
    const invariantReport = await ledgerService.verifySystemInvariants();
    expect(invariantReport.isBalanced).toBe(true);
    expect(Number(invariantReport.netDiscrepancy)).toBe(0);
    expect(Number(invariantReport.totalSystemEquity)).toBe(0);
  });
});
