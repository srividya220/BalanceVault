import Redis from 'ioredis';
import { config } from '../config';

interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTimeMs: number;
}

class MemoryRateLimiter {
  private hits: Map<string, number[]> = new Map();

  check(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = Date.now();
    const windowStart = now - windowMs;

    let timestamps = this.hits.get(key) || [];
    timestamps = timestamps.filter((t) => t > windowStart);

    if (timestamps.length >= limit) {
      const oldest = timestamps[0];
      const resetTimeMs = oldest + windowMs;
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetTimeMs,
      };
    }

    timestamps.push(now);
    this.hits.set(key, timestamps);

    return {
      allowed: true,
      limit,
      remaining: limit - timestamps.length,
      resetTimeMs: now + windowMs,
    };
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, timestamps] of this.hits.entries()) {
      const valid = timestamps.filter((t) => t > now - 300000);
      if (valid.length === 0) {
        this.hits.delete(key);
      } else {
        this.hits.set(key, valid);
      }
    }
  }

  clear(): void {
    this.hits.clear();
  }
}

export class RateLimitService {
  private redis: Redis | null = null;
  private isRedisConnected = false;
  private memoryLimiter = new MemoryRateLimiter();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.initRedis();
    this.cleanupInterval = setInterval(() => this.memoryLimiter.cleanup(), 60000);
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  private initRedis(): void {
    // In test environment or when redis is optional, do not hang on socket connection
    if (process.env.NODE_ENV === 'test' && !process.env.TEST_WITH_REDIS) {
      this.isRedisConnected = false;
      return;
    }

    try {
      this.redis = new Redis(config.redisUrl, {
        maxRetriesPerRequest: 0,
        enableOfflineQueue: false,
        retryStrategy: () => null, // Do not endlessly retry if redis is down
        lazyConnect: true,
        connectTimeout: 500,
      });

      this.redis.on('connect', () => {
        this.isRedisConnected = true;
        console.log('✓ Successfully connected to Redis for rate limiting');
      });

      this.redis.on('error', () => {
        this.isRedisConnected = false;
      });

      this.redis.connect().catch(() => {
        this.isRedisConnected = false;
      });
    } catch {
      this.isRedisConnected = false;
    }
  }

  public async checkRateLimit(
    key: string,
    limit: number = config.rateLimit.maxRequests,
    windowMs: number = config.rateLimit.windowMs
  ): Promise<RateLimitResult> {
    if (this.isRedisConnected && this.redis) {
      try {
        const now = Date.now();
        const windowStart = now - windowMs;
        const redisKey = `ratelimit:${key}`;

        const multi = this.redis.multi();
        multi.zremrangebyscore(redisKey, 0, windowStart);
        multi.zadd(redisKey, now, `${now}-${Math.random()}`);
        multi.zcard(redisKey);
        multi.pexpire(redisKey, windowMs);

        const results = await multi.exec();
        if (results && results[2] && !results[2][0]) {
          const count = Number(results[2][1]);
          const allowed = count <= limit;
          const remaining = Math.max(0, limit - count);
          const resetTimeMs = now + windowMs;

          return { allowed, limit, remaining, resetTimeMs };
        }
      } catch (err) {
        this.isRedisConnected = false;
      }
    }

    return this.memoryLimiter.check(key, limit, windowMs);
  }

  public isConnected(): boolean {
    return this.isRedisConnected;
  }

  public async close(): Promise<void> {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
      this.redis = null;
    }
  }
}

export const rateLimitService = new RateLimitService();
