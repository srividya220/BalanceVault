import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/prisma';
import { config } from '../config';
import { RegisterDTO, LoginDTO, AuthenticatedUser } from '../types';
import { BadRequestError, UnauthorizedError, ConflictError } from '../errors/AppError';
import { auditService } from './auditService';
import { UserRole } from '@prisma/client';

export class AuthService {
  /**
   * Registers a new user with hashed password and initial checking account.
   */
  public async register(
    data: RegisterDTO,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const existing = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (existing) {
      throw new ConflictError('A user with this email address already exists.');
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(data.password, salt);

    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: data.email.toLowerCase().trim(),
          passwordHash,
          fullName: data.fullName.trim(),
          role: data.role || UserRole.CUSTOMER,
        },
      });

      // Automatically generate a primary checking account for the new user
      const randDigits = Math.floor(10000000 + Math.random() * 90000000);
      const accountNumber = `BV-${randDigits}`;

      await tx.account.create({
        data: {
          accountNumber,
          userId: newUser.id,
          accountType: 'CHECKING',
          currency: 'INR',
          balance: 0.0,
        },
      });

      return newUser;
    });

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const token = this.generateToken(authenticatedUser);

    await auditService.logEvent({
      action: 'USER_REGISTERED',
      entityType: 'USER',
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      payload: { email: user.email, role: user.role },
    });

    return { user: authenticatedUser, token };
  }

  /**
   * Validates credentials and returns JWT session token.
   */
  public async login(
    data: LoginDTO,
    context?: { ipAddress?: string; userAgent?: string }
  ): Promise<{ user: AuthenticatedUser; token: string }> {
    const user = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase().trim() },
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedError('Invalid email or password.');
    }

    const isMatch = await bcrypt.compare(data.password, user.passwordHash);
    if (!isMatch) {
      await auditService.logEvent({
        action: 'USER_LOGIN_FAILED',
        entityType: 'USER',
        entityId: user.id,
        actorId: user.id,
        actorRole: user.role,
        ipAddress: context?.ipAddress,
        userAgent: context?.userAgent,
      });
      throw new UnauthorizedError('Invalid email or password.');
    }

    const authenticatedUser: AuthenticatedUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };

    const token = this.generateToken(authenticatedUser);

    await auditService.logEvent({
      action: 'USER_LOGIN_SUCCESS',
      entityType: 'USER',
      entityId: user.id,
      actorId: user.id,
      actorRole: user.role,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
    });

    return { user: authenticatedUser, token };
  }

  /**
   * Retrieves user profile and account details.
   */
  public async getProfile(userId: string): Promise<any> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        isActive: true,
        createdAt: true,
        accounts: {
          select: {
            id: true,
            accountNumber: true,
            accountType: true,
            currency: true,
            status: true,
            balance: true,
            createdAt: true,
          },
        },
      },
    });

    if (!user) {
      throw new BadRequestError('User profile not found.');
    }

    return user;
  }

  private generateToken(user: AuthenticatedUser): string {
    return jwt.sign(
      {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
      },
      config.jwtSecret,
      { expiresIn: '24h' }
    );
  }
}

export const authService = new AuthService();
