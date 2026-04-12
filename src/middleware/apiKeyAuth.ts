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
import type { Platform, ResolvedApiKey } from '../types/models';

export const API_KEY_RAW_PREFIX = 'cdp_'; // All keys start with this
export const API_KEY_PREFIX_LENGTH = 8;   // 8 chars after "cdp_" used as lookup prefix

export function extractPrefix(rawKey: string): string | null {
  if (!rawKey.startsWith(API_KEY_RAW_PREFIX)) return null;
  const afterPrefix = rawKey.slice(API_KEY_RAW_PREFIX.length);
  if (afterPrefix.length < API_KEY_PREFIX_LENGTH) return null;
  return afterPrefix.slice(0, API_KEY_PREFIX_LENGTH);
}

/** Verify an API key and return its metadata from DB or Cache */
export async function verifyApiKey(rawKey: string): Promise<ResolvedApiKey> {
  const prefix = extractPrefix(rawKey);
  if (!prefix) {
    throw new UnauthorisedError('Invalid API key format');
  }

  // ── Cache check ────────────────────────────────────────────────────────
  const cacheKey = `${API_KEY_CACHE_PREFIX}${prefix}`;
  const cached = await redis.get(cacheKey);

  if (cached) {
    const parsed = JSON.parse(cached);
    if (parsed.canViewRaw !== undefined) {
      const { platform, keyId, canViewRaw } = parsed as {
        platform: Platform;
        keyId: string;
        canViewRaw: boolean;
      };

      void touchApiKey(keyId).catch((err: Error) =>
        logger.warn({ message: 'Failed to touch api key', err: err.message }),
      );

      return { platform, keyPrefix: prefix, keyId, canViewRaw };
    }
  }

  // ── DB lookup ─────────────────────────────────────────────────────────
  const record = await findApiKeyByPrefix(prefix);
  if (!record) {
    throw new UnauthorisedError('Invalid or revoked API key');
  }

  const isValid = await bcrypt.compare(rawKey, record.key_hash);
  if (!isValid) {
    throw new UnauthorisedError('Invalid API key');
  }

  // ── Cache the resolution ──────────────────────────────────────────────
  await redis.setex(
    cacheKey,
    API_KEY_CACHE_TTL_SECONDS,
    JSON.stringify({
      platform: record.platform,
      keyId: record.id,
      canViewRaw: record.can_view_raw,
    }),
  );

  void touchApiKey(record.id).catch((err: Error) =>
    logger.warn({ message: 'Failed to touch api key', err: err.message }),
  );

  return {
    platform: record.platform,
    keyPrefix: prefix,
    keyId: record.id,
    canViewRaw: record.can_view_raw,
  };
}

export function apiKeyAuth(req: Request, _res: Response, next: NextFunction): void {
  const API_KEY_HEADER = 'x-api-key';
  void (async (): Promise<void> => {
    try {
      const rawKey = req.headers[API_KEY_HEADER];
      if (!rawKey || typeof rawKey !== 'string') {
        next(new UnauthorisedError('Missing X-Api-Key header'));
        return;
      }

      req.resolvedApiKey = await verifyApiKey(rawKey);
      next();
    } catch (err) {
      next(err);
    }
  })();
}
