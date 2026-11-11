import { Request } from 'express';
import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
  idempotencyKey?: string;
}

export interface RegisterDTO {
  email: string;
  password: string;
  fullName: string;
  role?: UserRole;
}

export interface LoginDTO {
  email: string;
  password: string;
}

export interface CreateAccountDTO {
  accountType?: 'CHECKING' | 'SAVINGS';
  currency?: string;
  initialDeposit?: number;
}

export interface DepositDTO {
  accountId: string;
  amount: number;
  description?: string;
}

export interface WithdrawDTO {
  accountId: string;
  amount: number;
  description?: string;
}

export interface TransferDTO {
  sourceAccountId: string;
  destinationAccountNumber: string;
  amount: number;
  description?: string;
}

export interface LedgerInvariantResult {
  isBalanced: boolean;
  totalDebits: string;
  totalCredits: string;
  netDiscrepancy: string;
  accountBalancesSum: string;
  systemReserveBalance: string;
  totalSystemEquity: string;
  postingsCount: number;
  journalEntriesCount: number;
  verifiedAt: Date;
}
