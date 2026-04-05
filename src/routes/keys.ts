/**
 * GET  /api/keys      — list all API keys (name, prefix, platform, status, last_used_at)
 * DELETE /api/keys/:id — deactivate a key (sets active=false, flushes Redis cache)
 *
 * Auth: JWT only (admin portal). No platform API key required.
 *
 * Security notes:
 *   - key_hash is NEVER returned — only prefix and metadata.
 *   - Deactivation is soft (active=false) so audit trail is preserved.
 *   - Redis cache is flushed on deactivation so the key stops working immediately,
 *     without waiting for the 5-minute TTL to expire.
 */

import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { jwtAuth } from '../middleware/jwtAuth';
import { listApiKeys } from '../db/queries/apiKeys';
import db from '../db/knex';
import redis from '../db/redis';
import { API_KEY_CACHE_PREFIX } from '../config/limits';
import { NotFoundError, ValidationError } from '../types/errors';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';
import type { ApiKeyRecord } from '../types/models';

const router = Router();

// ─── GET /api/keys ────────────────────────────────────────────────────────────
// Returns all API key records (no hashes). Ordered newest first.

router.get(
  '/keys',
  jwtAuth,
  catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const keys = await listApiKeys();
    res.json(keys);
  }),
);

// ─── DELETE /api/keys/:id ─────────────────────────────────────────────────────
// Deactivates a key. After this call, the key is rejected by apiKeyAuth
// immediately (Redis cache flushed) regardless of remaining TTL.

router.delete(
  '/keys/:id',
  jwtAuth,
  [param('id').isUUID().withMessage('id must be a valid UUID')],
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid API key ID', errorData));
      return;
    }

    const { id } = req.params as { id: string };

    // 1. Fetch the record so we know the prefix for cache invalidation
    const record = await db('api_keys')
      .select('id', 'key_prefix', 'active')
      .where({ id })
      .first() as Pick<ApiKeyRecord, 'id' | 'key_prefix' | 'active'> | undefined;

    if (!record) {
      next(new NotFoundError('API key', id));
      return;
    }

    // 2. Soft-deactivate in the DB
    await db('api_keys').where({ id }).update({ active: false });

    // 3. Flush Redis cache so the key is rejected immediately
    const cacheKey = `${API_KEY_CACHE_PREFIX}${record.key_prefix}`;
    await redis.del(cacheKey);

    res.status(204).end();
  }),
);

export default router;
