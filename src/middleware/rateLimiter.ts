/**
 * Per-platform Redis-backed rate limiter.
 *
 * Limits are defined in config/limits.ts — never hardcode here.
 * Applied AFTER apiKeyAuth so req.resolvedApiKey.platform is available.
 *
 * Each platform gets its own sliding window:
 *   whatsapp  → 100 req / 1 min
 *   email     → 60  req / 1 min
 *   admin     → 300 req / 1 min
 *   csv_export → 5  req / 1 hour
 *
 * On 429: returns RateLimit-* headers so clients can back off correctly.
 */

import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import type { Request, Response, NextFunction } from 'express';
import redis from '../db/redis';
import { LIMITS } from '../config/limits';
import type { Platform } from '../types/models';

/** Build a rate limiter for a specific platform tier */
function buildLimiter(platform: Platform): ReturnType<typeof rateLimit> {
  const cfg = LIMITS[platform];
  if (!cfg) {
    throw new Error(`No rate limit defined for platform: ${platform}`);
  }

  return rateLimit({
    windowMs: cfg.windowMs,
    max: cfg.max,
    standardHeaders: true,   // Sends RateLimit-* headers (RFC 6585)
    legacyHeaders: false,
    keyGenerator: (req: Request) => {
      // Rate limit per API key prefix, not per IP (B2B use case)
      return `${platform}:${req.resolvedApiKey?.keyPrefix ?? req.ip ?? 'unknown'}`;
    },
    store: new RedisStore({
      // @ts-expect-error — sendCommand type mismatch between ioredis and the store
      sendCommand: (...args: string[]) => redis.call(...args),
      prefix: `rl:${platform}:`,
    }),
    handler: (_req, res): void => {
      res.status(429).json({
        error: `Rate limit exceeded`,
        code: 'RATE_LIMIT_EXCEEDED',
        platform,
        limit: cfg.max,
        window_seconds: cfg.windowMs / 1000,
        retry_after: Math.ceil(cfg.windowMs / 1000),
      });
    },
  });
}

// Pre-built limiters for each platform
const limiters: Record<Platform, ReturnType<typeof buildLimiter>> = {
  whatsapp: buildLimiter('whatsapp'),
  email: buildLimiter('email'),
  admin: buildLimiter('admin'),
  csv_export: buildLimiter('csv_export'),
  public: buildLimiter('public'),
};

/**
 * Dynamic rate limiter middleware.
 * Reads the platform from req.resolvedApiKey (set by apiKeyAuth).
 * Falls back to 'admin' tier if platform is unknown.
 */
export function rateLimiterMiddleware(req: Request, res: Response, next: NextFunction): void {
  const platform: Platform = req.resolvedApiKey?.platform ?? 'admin';
  const limiter = limiters[platform] ?? limiters.admin;
  limiter(req, res, next);
}
