/**
 * API key authentication middleware.
 *
 * Flow:
 *   1. Read X-Api-Key header (format: "cdp_<32+ chars>")
 *   2. Extract prefix (chars 4–12, i.e. 8 chars after "cdp_")
 *   3. Check Redis cache: "apikey:platform:<prefix>" → platform string
 *   4. Cache miss → DB lookup by prefix → bcrypt.compare(rawKey, hash)
 *   5. On success → cache result + set req.resolvedApiKey + call next()
 *   6. On failure → throw UnauthorisedError (caught by errorHandler)
 *
 * This middleware is applied to all routes EXCEPT /health and /api/auth/*.
 */

import type { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import { findApiKeyByPrefix, touchApiKey } from '../db/queries/apiKeys';
import redis from '../db/redis';
import { UnauthorisedError } from '../types/errors';
import { API_KEY_CACHE_PREFIX, API_KEY_CACHE_TTL_SECONDS } from '../config/limits';
import { logger } from './logger';
import type { Platform } from '../types/models';

const API_KEY_HEADER = 'x-api-key';
const API_KEY_RAW_PREFIX = 'cdp_'; // All keys start with this
const API_KEY_PREFIX_LENGTH = 8;   // 8 chars after "cdp_" used as lookup prefix

function extractPrefix(rawKey: string): string | null {
  if (!rawKey.startsWith(API_KEY_RAW_PREFIX)) return null;
  const afterPrefix = rawKey.slice(API_KEY_RAW_PREFIX.length);
  if (afterPrefix.length < API_KEY_PREFIX_LENGTH) return null;
  return afterPrefix.slice(0, API_KEY_PREFIX_LENGTH);
}

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  void (async (): Promise<void> => {
    try {
      const rawKey = req.headers[API_KEY_HEADER];
      if (!rawKey || typeof rawKey !== 'string') {
        next(new UnauthorisedError('Missing X-Api-Key header'));
        return;
      }

      const prefix = extractPrefix(rawKey);
      if (!prefix) {
        next(new UnauthorisedError('Invalid API key format'));
        return;
      }

      // ── Cache check ────────────────────────────────────────────────────────
      const cacheKey = `${API_KEY_CACHE_PREFIX}${prefix}`;
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        // Stale cache check: if canViewRaw is missing, re-fetch from DB
        if (parsed.canViewRaw !== undefined) {
          const { platform, keyId, canViewRaw } = parsed as { 
            platform: Platform; 
            keyId: string; 
            canViewRaw: boolean 
          };
          req.resolvedApiKey = { platform, keyPrefix: prefix, keyId, canViewRaw };
          
          void touchApiKey(keyId).catch((err: Error) =>
            logger.warn({ message: 'Failed to touch api key', err: err.message }),
          );
          next();
          return;
        }
        logger.info({ message: 'Stale API key cache detected, re-fetching from DB', prefix });
      }

      // ── DB lookup ─────────────────────────────────────────────────────────
      const record = await findApiKeyByPrefix(prefix);
      if (!record) {
        next(new UnauthorisedError('Invalid or revoked API key'));
        return;
      }

      const isValid = await bcrypt.compare(rawKey, record.key_hash);
      if (!isValid) {
        next(new UnauthorisedError('Invalid API key'));
        return;
      }

      // ── Cache the resolution ──────────────────────────────────────────────
      await redis.setex(
        cacheKey,
        API_KEY_CACHE_TTL_SECONDS,
        JSON.stringify({ 
          platform: record.platform, 
          keyId: record.id, 
          canViewRaw: record.can_view_raw 
        }),
      );

      req.resolvedApiKey = {
        platform: record.platform,
        keyPrefix: prefix,
        keyId: record.id,
        canViewRaw: record.can_view_raw,
      };

      void touchApiKey(record.id).catch((err: Error) =>
        logger.warn({ message: 'Failed to touch api key', err: err.message }),
      );

      next();
    } catch (err) {
      next(err);
    }
  })();
}
