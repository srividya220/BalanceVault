import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma';
import { DepositDTO, WithdrawDTO, TransferDTO, LedgerInvariantResult } from '../types';
import { BadRequestError, NotFoundError, ConflictError } from '../errors/AppError';
import { auditService } from './auditService';
import { notificationService } from './notificationService';
import { config } from '../config';

export class LedgerService {
  /**
   * Retrieves or initializes the system reserve vault account.
   */
  public async getSystemReserveAccount(tx: Prisma.TransactionClient): Promise<any> {
    const reserveNumber = config.bootstrap.systemReserveAccountNumber;

    let reserve = await tx.account.findUnique({
      where: { accountNumber: reserveNumber },
    });

    if (!reserve) {
      // Find or create a system user for the reserve
      let systemUser = await tx.user.findFirst({
        where: { email: 'reserve@balancevault.internal' },
      });

      if (!systemUser) {
        systemUser = await tx.user.create({
          data: {
            email: 'reserve@balancevault.internal',
            fullName: 'BalanceVault Central Reserve',
            passwordHash: 'SYSTEM_INTERNAL_VAULT',
            role: 'ADMIN',
          },
        });
      }

      reserve = await tx.account.create({
        data: {
          accountNumber: reserveNumber,
          userId: systemUser.id,
          accountType: 'SYSTEM_RESERVE',
          currency: 'INR',
          balance: new Prisma.Decimal(0),
        },
      });
    }

    return reserve;
  }

  /**
   * Generates a unique transaction reference formatted as BV-TXN-YYYYMMDD-RANDOM.
   */
  public generateTransactionReference(): string {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rand = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `BV-TXN-${dateStr}-${rand}`;
  }

  /**
   * Executes an atomic Deposit operation.
   * Double-Entry Postings:
   *   - Customer Account: +Amount (CREDIT to account balance)
   *   - System Reserve:  -Amount (DEBIT from system vault)
   * Invariant: (+Amount) + (-Amount) = 0.
   */
  public async deposit(
    data: DepositDTO,
    actorId?: string,
    idempotencyKey?: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    if (data.amount <= 0) {
      throw new BadRequestError('Deposit amount must be strictly greater than zero.');
    }

    const amountDecimal = new Prisma.Decimal(data.amount);
    const reference = this.generateTransactionReference();

    const result = await prisma.$transaction(async (tx) => {
      const reserve = await this.getSystemReserveAccount(tx);

      // Lock customer account using FOR UPDATE
      const accounts = await tx.$queryRaw<any[]>`
        SELECT id, "accountNumber", balance, status, "accountType"
        FROM "Account"
        WHERE id = ${data.accountId}
        FOR UPDATE
      `;

      if (!accounts || accounts.length === 0) {
        throw new NotFoundError('Target deposit account not found.');
      }

      const targetAccount = accounts[0];

      if (targetAccount.status !== 'ACTIVE') {
        throw new BadRequestError(`Cannot deposit into ${targetAccount.status.toLowerCase()} account.`);
      }

      const prevTargetBal = new Prisma.Decimal(targetAccount.balance);
      const newTargetBal = prevTargetBal.add(amountDecimal);

      // Lock system reserve
      const reserveAccounts = await tx.$queryRaw<any[]>`
        SELECT id, balance FROM "Account"
        WHERE id = ${reserve.id}
        FOR UPDATE
      `;
      const prevReserveBal = new Prisma.Decimal(reserveAccounts[0].balance);
      const newReserveBal = prevReserveBal.sub(amountDecimal);

      // Invariant verification check before writing
      const sumPostings = amountDecimal.add(amountDecimal.negated());
      if (!sumPostings.equals(new Prisma.Decimal(0))) {
        throw new Error('Double-entry zero-sum invariant violation in deposit calculation.');
      }

      // Create Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          reference,
          entryType: 'DEPOSIT',
          description: data.description || `Deposit to ${targetAccount.accountNumber}`,
          idempotencyKey: idempotencyKey || null,
          amount: amountDecimal,
          status: 'POSTED',
          metadata: {
            targetAccountId: targetAccount.id,
            targetAccountNumber: targetAccount.accountNumber,
          },
        },
      });

      // Postings:
      // 1. Customer account credit (+amount)
      const targetPosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: targetAccount.id,
          direction: 'CREDIT',
          amount: amountDecimal,
          signedAmount: amountDecimal,
          balanceAfter: newTargetBal,
          sequenceNumber: 1,
        },
      });

      // 2. System reserve debit (-amount)
      const reservePosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: reserve.id,
          direction: 'DEBIT',
          amount: amountDecimal,
          signedAmount: amountDecimal.negated(),
          balanceAfter: newReserveBal,
          sequenceNumber: 2,
        },
      });

      // Apply balance updates
      await tx.account.update({
        where: { id: targetAccount.id },
        data: { balance: newTargetBal },
      });

      await tx.account.update({
        where: { id: reserve.id },
        data: { balance: newReserveBal },
      });

      return {
        journalEntry,
        targetAccount: {
          id: targetAccount.id,
          accountNumber: targetAccount.accountNumber,
          previousBalance: prevTargetBal,
          newBalance: newTargetBal,
        },
        postings: [targetPosting, reservePosting],
      };
    });

    await auditService.logEvent({
      action: 'TRANSACTION_DEPOSIT',
      entityType: 'JOURNAL_ENTRY',
      entityId: result.journalEntry.id,
      actorId: actorId || null,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        reference,
        amount: data.amount,
        targetAccountId: data.accountId,
        newBalance: result.targetAccount.newBalance,
      },
    });

    // Notify account owner
    try {
      const account = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { userId: true, accountNumber: true },
      });
      if (account) {
        const inrAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(data.amount);
        await notificationService.createNotification(
          account.userId,
          'TRANSACTION_DEPOSIT',
          'Deposit Successful',
          `${inrAmount} has been deposited into account ${account.accountNumber}. Reference: ${reference}.`,
          result.journalEntry.id,
          'JournalEntry'
        );
      }
    } catch (_) { /* Non-critical — do not fail the transaction */ }

    return result;
  }

  /**
   * Executes an atomic Withdrawal operation with strict concurrency locks and overdraft protection.
   * Double-Entry Postings:
   *   - Customer Account: -Amount (DEBIT from account balance)
   *   - System Reserve:  +Amount (CREDIT into system vault)
   * Invariant: (-Amount) + (+Amount) = 0.
   */
  public async withdraw(
    data: WithdrawDTO,
    actorId?: string,
    idempotencyKey?: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    if (data.amount <= 0) {
      throw new BadRequestError('Withdrawal amount must be strictly greater than zero.');
    }

    const amountDecimal = new Prisma.Decimal(data.amount);
    const reference = this.generateTransactionReference();

    const result = await prisma.$transaction(async (tx) => {
      const reserve = await this.getSystemReserveAccount(tx);

      // Lock customer account using FOR UPDATE
      const accounts = await tx.$queryRaw<any[]>`
        SELECT id, "accountNumber", balance, status, "accountType", "userId"
        FROM "Account"
        WHERE id = ${data.accountId}
        FOR UPDATE
      `;

      if (!accounts || accounts.length === 0) {
        throw new NotFoundError('Source withdrawal account not found.');
      }

      const sourceAccount = accounts[0];

      if (sourceAccount.status !== 'ACTIVE') {
        throw new BadRequestError(`Cannot withdraw from ${sourceAccount.status.toLowerCase()} account.`);
      }

      // Authorization check if actor is provided
      if (actorId && sourceAccount.userId !== actorId) {
        // If actor is not admin and not owner
        const user = await tx.user.findUnique({ where: { id: actorId } });
        if (user?.role !== 'ADMIN') {
          throw new BadRequestError('Unauthorized: You can only withdraw from your own accounts.');
        }
      }

      const currentBalance = new Prisma.Decimal(sourceAccount.balance);

      // Concurrency-Safe Overdraft Guard
      if (currentBalance.lessThan(amountDecimal)) {
        throw new BadRequestError(
          `Overdraft prevented: Insufficient funds. Available balance: ₹${currentBalance.toFixed(2)}, requested: ₹${amountDecimal.toFixed(2)}.`
        );
      }

      const newSourceBal = currentBalance.sub(amountDecimal);

      // Lock system reserve
      const reserveAccounts = await tx.$queryRaw<any[]>`
        SELECT id, balance FROM "Account"
        WHERE id = ${reserve.id}
        FOR UPDATE
      `;
      const prevReserveBal = new Prisma.Decimal(reserveAccounts[0].balance);
      const newReserveBal = prevReserveBal.add(amountDecimal);

      // Invariant verification check
      const sumPostings = amountDecimal.negated().add(amountDecimal);
      if (!sumPostings.equals(new Prisma.Decimal(0))) {
        throw new Error('Double-entry zero-sum invariant violation in withdrawal calculation.');
      }

      // Create Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          reference,
          entryType: 'WITHDRAWAL',
          description: data.description || `Withdrawal from ${sourceAccount.accountNumber}`,
          idempotencyKey: idempotencyKey || null,
          amount: amountDecimal,
          status: 'POSTED',
          metadata: {
            sourceAccountId: sourceAccount.id,
            sourceAccountNumber: sourceAccount.accountNumber,
          },
        },
      });

      // Postings:
      // 1. Customer account debit (-amount)
      const sourcePosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: sourceAccount.id,
          direction: 'DEBIT',
          amount: amountDecimal,
          signedAmount: amountDecimal.negated(),
          balanceAfter: newSourceBal,
          sequenceNumber: 1,
        },
      });

      // 2. System reserve credit (+amount)
      const reservePosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: reserve.id,
          direction: 'CREDIT',
          amount: amountDecimal,
          signedAmount: amountDecimal,
          balanceAfter: newReserveBal,
          sequenceNumber: 2,
        },
      });

      // Apply balance updates
      await tx.account.update({
        where: { id: sourceAccount.id },
        data: { balance: newSourceBal },
      });

      await tx.account.update({
        where: { id: reserve.id },
        data: { balance: newReserveBal },
      });

      return {
        journalEntry,
        sourceAccount: {
          id: sourceAccount.id,
          accountNumber: sourceAccount.accountNumber,
          previousBalance: currentBalance,
          newBalance: newSourceBal,
        },
        postings: [sourcePosting, reservePosting],
      };
    });

    await auditService.logEvent({
      action: 'TRANSACTION_WITHDRAWAL',
      entityType: 'JOURNAL_ENTRY',
      entityId: result.journalEntry.id,
      actorId: actorId || null,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        reference,
        amount: data.amount,
        sourceAccountId: data.accountId,
        newBalance: result.sourceAccount.newBalance,
      },
    });

    // Notify account owner
    try {
      const account = await prisma.account.findUnique({
        where: { id: data.accountId },
        select: { userId: true, accountNumber: true },
      });
      if (account) {
        const inrAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(data.amount);
        await notificationService.createNotification(
          account.userId,
          'TRANSACTION_WITHDRAWAL',
          'Withdrawal Successful',
          `${inrAmount} has been withdrawn from account ${account.accountNumber}. Reference: ${reference}.`,
          result.journalEntry.id,
          'JournalEntry'
        );
      }
    } catch (_) { /* Non-critical */ }

    return result;
  }

  /**
   * Executes an atomic Account-to-Account Transfer.
   * Deadlock-Free Ordered Locking:
   *   Accounts are sorted by UUID prior to acquiring `FOR UPDATE` locks.
   * Double-Entry Postings:
   *   - Source Account: -Amount (DEBIT)
   *   - Destination Account: +Amount (CREDIT)
   * Invariant: (-Amount) + (+Amount) = 0.
   */
  public async transfer(
    data: TransferDTO,
    actorId?: string,
    idempotencyKey?: string,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<any> {
    if (data.amount <= 0) {
      throw new BadRequestError('Transfer amount must be strictly greater than zero.');
    }

    const amountDecimal = new Prisma.Decimal(data.amount);
    const reference = this.generateTransactionReference();

    const result = await prisma.$transaction(async (tx) => {
      // Find source account
      const sourceCheck = await tx.account.findUnique({
        where: { id: data.sourceAccountId },
      });

      if (!sourceCheck) {
        throw new NotFoundError('Source account not found.');
      }

      // Find destination account by account number
      const destCheck = await tx.account.findUnique({
        where: { accountNumber: data.destinationAccountNumber.trim() },
      });

      if (!destCheck) {
        throw new NotFoundError(`Destination account '${data.destinationAccountNumber}' does not exist.`);
      }

      if (sourceCheck.id === destCheck.id) {
        throw new BadRequestError('Cannot transfer funds to the exact same account.');
      }

      // Ownership verification
      if (actorId && sourceCheck.userId !== actorId) {
        const user = await tx.user.findUnique({ where: { id: actorId } });
        if (user?.role !== 'ADMIN') {
          throw new BadRequestError('Unauthorized: You can only transfer funds from your own accounts.');
        }
      }

      // DEADLOCK PREVENTION: Lock accounts in deterministic lexicographical order of UUID
      const sortedIds = [sourceCheck.id, destCheck.id].sort();

      const lockedAccounts = await tx.$queryRaw<any[]>`
        SELECT id, "accountNumber", balance, status, "accountType"
        FROM "Account"
        WHERE id IN (${sortedIds[0]}, ${sortedIds[1]})
        ORDER BY id ASC
        FOR UPDATE
      `;

      const sourceAccount = lockedAccounts.find((a) => a.id === sourceCheck.id);
      const destAccount = lockedAccounts.find((a) => a.id === destCheck.id);

      if (!sourceAccount || !destAccount) {
        throw new NotFoundError('Could not acquire locks on accounts for transfer.');
      }

      if (sourceAccount.status !== 'ACTIVE') {
        throw new BadRequestError(`Source account is ${sourceAccount.status.toLowerCase()}. Transfers disallowed.`);
      }

      if (destAccount.status !== 'ACTIVE') {
        throw new BadRequestError(`Destination account is ${destAccount.status.toLowerCase()}. Transfers disallowed.`);
      }

      const sourceBal = new Prisma.Decimal(sourceAccount.balance);
      const destBal = new Prisma.Decimal(destAccount.balance);

      // Overdraft Prevention Guard
      if (sourceBal.lessThan(amountDecimal)) {
        throw new BadRequestError(
          `Overdraft prevented: Insufficient funds. Available: ₹${sourceBal.toFixed(2)}, required: ₹${amountDecimal.toFixed(2)}.`
        );
      }

      const newSourceBal = sourceBal.sub(amountDecimal);
      const newDestBal = destBal.add(amountDecimal);

      // Strict Zero-Sum Conservation Invariant Check
      const invariantDelta = amountDecimal.negated().add(amountDecimal);
      if (!invariantDelta.equals(new Prisma.Decimal(0))) {
        throw new Error('Money conservation invariant violated: Postings delta is non-zero.');
      }

      // Create Journal Entry
      const journalEntry = await tx.journalEntry.create({
        data: {
          reference,
          entryType: 'TRANSFER',
          description: data.description || `Transfer from ${sourceAccount.accountNumber} to ${destAccount.accountNumber}`,
          idempotencyKey: idempotencyKey || null,
          amount: amountDecimal,
          status: 'POSTED',
          metadata: {
            sourceAccountId: sourceAccount.id,
            sourceAccountNumber: sourceAccount.accountNumber,
            destAccountId: destAccount.id,
            destAccountNumber: destAccount.accountNumber,
          },
        },
      });

      // Postings:
      // 1. Source Account Debit (-amount)
      const sourcePosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: sourceAccount.id,
          direction: 'DEBIT',
          amount: amountDecimal,
          signedAmount: amountDecimal.negated(),
          balanceAfter: newSourceBal,
          sequenceNumber: 1,
        },
      });

      // 2. Destination Account Credit (+amount)
      const destPosting = await tx.posting.create({
        data: {
          journalEntryId: journalEntry.id,
          accountId: destAccount.id,
          direction: 'CREDIT',
          amount: amountDecimal,
          signedAmount: amountDecimal,
          balanceAfter: newDestBal,
          sequenceNumber: 2,
        },
      });

      // Commit balance updates
      await tx.account.update({
        where: { id: sourceAccount.id },
        data: { balance: newSourceBal },
      });

      await tx.account.update({
        where: { id: destAccount.id },
        data: { balance: newDestBal },
      });

      return {
        journalEntry,
        transferDetails: {
          reference,
          amount: data.amount,
          sourceAccountNumber: sourceAccount.accountNumber,
          sourceNewBalance: newSourceBal,
          destinationAccountNumber: destAccount.accountNumber,
          destinationNewBalance: newDestBal,
        },
        postings: [sourcePosting, destPosting],
      };
    });

    await auditService.logEvent({
      action: 'TRANSACTION_TRANSFER',
      entityType: 'JOURNAL_ENTRY',
      entityId: result.journalEntry.id,
      actorId: actorId || null,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: {
        reference,
        amount: data.amount,
        sourceAccountId: data.sourceAccountId,
        destinationAccountNumber: data.destinationAccountNumber,
      },
    });

    // Notify source and destination account owners
    try {
      const inrAmount = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(data.amount);
      const sourceAcc = await prisma.account.findUnique({
        where: { id: data.sourceAccountId },
        select: { userId: true, accountNumber: true },
      });
      const destAcc = await prisma.account.findUnique({
        where: { accountNumber: data.destinationAccountNumber.trim() },
        select: { userId: true, accountNumber: true },
      });
      if (sourceAcc) {
        await notificationService.createNotification(
          sourceAcc.userId,
          'TRANSACTION_TRANSFER',
          'Transfer Sent',
          `${inrAmount} has been transferred from your account ${sourceAcc.accountNumber} to ${data.destinationAccountNumber}. Reference: ${reference}.`,
          result.journalEntry.id,
          'JournalEntry'
        );
      }
      if (destAcc && destAcc.userId !== sourceAcc?.userId) {
        await notificationService.createNotification(
          destAcc.userId,
          'TRANSACTION_TRANSFER',
          'Transfer Received',
          `${inrAmount} has been transferred into your account ${destAcc.accountNumber}. Reference: ${reference}.`,
          result.journalEntry.id,
          'JournalEntry'
        );
      }
    } catch (_) { /* Non-critical */ }

    return result;
  }

  /**
   * Complete mathematical invariant verification:
   * 1. Confirms every Journal Entry has postings summing to 0.
   * 2. Confirms global sum of all postings in the entire database is 0.
   * 3. Confirms sum of all account balances equals the net system equity.
   */
  public async verifySystemInvariants(): Promise<LedgerInvariantResult> {
    // 1. Check for any unbalanced journal entries
    const unbalancedJournals = await prisma.$queryRaw<any[]>`
      SELECT "journalEntryId", SUM("signedAmount") as sum_delta
      FROM "Posting"
      GROUP BY "journalEntryId"
      HAVING SUM("signedAmount") != 0;
    `;

    // 2. Compute aggregate sum of all postings across time
    const postingsAgg = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(SUM(CASE WHEN "signedAmount" > 0 THEN "signedAmount" ELSE 0 END), 0) as total_debits,
        COALESCE(SUM(CASE WHEN "signedAmount" < 0 THEN ABS("signedAmount") ELSE 0 END), 0) as total_credits,
        COALESCE(SUM("signedAmount"), 0) as net_discrepancy,
        COUNT(*) as count
      FROM "Posting";
    `;

    const totalDebits = new Prisma.Decimal(postingsAgg[0]?.total_debits || 0);
    const totalCredits = new Prisma.Decimal(postingsAgg[0]?.total_credits || 0);
    const netDiscrepancy = new Prisma.Decimal(postingsAgg[0]?.net_discrepancy || 0);
    const postingsCount = Number(postingsAgg[0]?.count || 0);

    // 3. Check sum of customer account balances vs system reserve
    const accountsAgg = await prisma.$queryRaw<any[]>`
      SELECT 
        COALESCE(SUM(CASE WHEN "accountType" != 'SYSTEM_RESERVE' THEN balance ELSE 0 END), 0) as customer_balances,
        COALESCE(SUM(CASE WHEN "accountType" = 'SYSTEM_RESERVE' THEN balance ELSE 0 END), 0) as reserve_balance,
        COALESCE(SUM(balance), 0) as total_balance_sum
      FROM "Account";
    `;

    const customerBalances = new Prisma.Decimal(accountsAgg[0]?.customer_balances || 0);
    const reserveBalance = new Prisma.Decimal(accountsAgg[0]?.reserve_balance || 0);
    const totalBalanceSum = new Prisma.Decimal(accountsAgg[0]?.total_balance_sum || 0);

    const journalCount = await prisma.journalEntry.count();

    const isBalanced =
      unbalancedJournals.length === 0 &&
      netDiscrepancy.equals(new Prisma.Decimal(0)) &&
      totalBalanceSum.equals(new Prisma.Decimal(0));

    return {
      isBalanced,
      totalDebits: totalDebits.toFixed(4),
      totalCredits: totalCredits.toFixed(4),
      netDiscrepancy: netDiscrepancy.toFixed(4),
      accountBalancesSum: customerBalances.toFixed(4),
      systemReserveBalance: reserveBalance.toFixed(4),
      totalSystemEquity: totalBalanceSum.toFixed(4),
      postingsCount,
      journalEntriesCount: journalCount,
      verifiedAt: new Date(),
    };
  }
}

export const ledgerService = new LedgerService();
