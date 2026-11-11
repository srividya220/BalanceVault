import request from 'supertest';
import { app } from '../src/app';
import { prisma } from '../src/database/prisma';
import { rateLimitService } from '../src/services/rateLimitService';

describe('Rate Limiting System', () => {
  afterAll(async () => {
    await rateLimitService.close();
    await prisma.$disconnect();
  });

  it('1. Returns rate limit headers on API requests', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'nonexistent@test.com',
      password: 'password123',
    });

    expect(res.headers['x-ratelimit-limit']).toBeDefined();
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('2. Enforces HTTP 429 Too Many Requests when rate threshold is breached', async () => {
    // Auth endpoint limit is 15 requests per minute
    // We send 18 requests rapidly
    const burstPromises = Array.from({ length: 18 }, () =>
      request(app).post('/api/auth/login').send({
        email: 'attacker@test.com',
        password: 'wrongpassword',
      })
    );

    const responses = await Promise.all(burstPromises);
    const throttled = responses.filter((r) => r.status === 429);

    expect(throttled.length).toBeGreaterThan(0);
    const sample429 = throttled[0];
    expect(sample429.body.error).toMatch(/Rate limit exceeded/i);
    expect(sample429.headers['retry-after']).toBeDefined();
  });
});
