import { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/AppError';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Handle AppError
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      statusCode: err.statusCode,
      details: err.details || null,
    });
    return;
  }

  // Handle Zod Validation Error
  if (err instanceof ZodError) {
    const formattedErrors = err.errors.map((e) => ({
      field: e.path.join('.'),
      message: e.message,
    }));
    res.status(400).json({
      success: false,
      error: 'Validation failed',
      statusCode: 400,
      details: formattedErrors,
    });
    return;
  }

  // Handle Prisma Database Errors
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({
        success: false,
        error: 'A unique constraint violation occurred.',
        statusCode: 409,
        details: err.meta,
      });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({
        success: false,
        error: 'Record not found.',
        statusCode: 404,
      });
      return;
    }
  }

  // Handle custom DB append-only trigger exceptions or check constraint failures
  const errorMessage = err?.message || '';
  if (errorMessage.includes('append-only') || errorMessage.includes('prevent_audit_ledger_mutation')) {
    res.status(403).json({
      success: false,
      error: 'Database ledger is append-only. Modification and deletion are prohibited by database security triggers.',
      statusCode: 403,
    });
    return;
  }

  if (errorMessage.includes('balance_non_negative') || errorMessage.includes('violates check constraint')) {
    res.status(400).json({
      success: false,
      error: 'Transaction rejected: Insufficient funds would cause account balance to fall below zero.',
      statusCode: 400,
    });
    return;
  }

  console.error('Unhandled Server Error:', err);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    statusCode: 500,
  });
}
