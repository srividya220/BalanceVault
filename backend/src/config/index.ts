import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  port: parseInt(process.env.PORT || '8080', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/balancevault?schema=public',
  jwtSecret: process.env.JWT_SECRET || 'balancevault-default-secret-key-change-in-production',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    authMax: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '15', 10),
  },
  bootstrap: {
    adminEmail: process.env.ADMIN_EMAIL || 'admin@balancevault.com',
    adminPassword: process.env.ADMIN_PASSWORD || 'AdminVaultPassword2026!',
    adminFullName: process.env.ADMIN_FULL_NAME || 'System Administrator',
    systemReserveAccountNumber: process.env.SYSTEM_RESERVE_ACCOUNT_NUMBER || 'BV-SYS-RESERVE-001',
  },
};
