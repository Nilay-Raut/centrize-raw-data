/**
 * ioredis singleton — import this wherever you need Redis.
 *
 * Used by:
 *   - middleware/apiKeyAuth.ts  — cache resolved platform per key prefix
 *   - middleware/rateLimiter.ts — sliding window counters
 *   - workers/                  — BullMQ connection
 *
 * NEVER create a new Redis instance elsewhere.
 */

import Redis from 'ioredis';
import { env } from '../config/env';
import { logger } from '../middleware/logger';

const redis = new Redis(env.redisUrl, {
  maxRetriesPerRequest: null, // Required by BullMQ
  enableReadyCheck: false,    // Don't block startup while Redis is loading
});

redis.on('error', (err: Error) => {
  logger.error({ message: '[redis] Connection error', error: err.message });
});

redis.on('connect', () => {
  logger.info({ message: '[redis] Connected' });
});

export default redis;
