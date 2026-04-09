/**
 * All SQL for the api_keys table.
 *
 * API key lookup flow:
 *   1. Client sends "cdp_a3f8b2c1..." header
 *   2. We take the prefix (first 8 chars): "a3f8b2c1"
 *   3. Look up the row by key_prefix → get key_hash + platform
 *   4. bcrypt.compare(rawKey, key_hash) to verify
 *   5. Cache platform in Redis for 5 minutes
 *
 * NEVER log or return the key_hash field.
 */

import db from '../knex';
import type { ApiKeyRecord, Platform } from '../../types/models';

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Find an active API key record by its prefix.
 * Returns null if the key does not exist or is deactivated.
 */
export async function findApiKeyByPrefix(
  prefix: string,
): Promise<Pick<ApiKeyRecord, 'id' | 'key_hash' | 'platform' | 'key_prefix' | 'can_view_raw'> | null> {
  const row = (await db('api_keys')
    .select('id', 'key_hash', 'platform', 'key_prefix', 'can_view_raw')
    .where({ key_prefix: prefix, active: true })
    .first()) as Pick<ApiKeyRecord, 'id' | 'key_hash' | 'platform' | 'key_prefix' | 'can_view_raw'> | undefined;

  return row ?? null;
}

/**
 * Update the last_used_at timestamp for a key (fire-and-forget).
 * Errors here should never block the request — call without await where possible.
 */
export async function touchApiKey(keyId: string): Promise<void> {
  await db('api_keys')
    .where({ id: keyId })
    .update({ last_used_at: db.fn.now() });
}

/**
 * Deactivate an API key (revocation).
 * After this, the caller should also flush the Redis cache for this prefix.
 */
export async function deactivateApiKey(keyPrefix: string): Promise<void> {
  await db('api_keys')
    .where({ key_prefix: keyPrefix })
    .update({ active: false });
}

/**
 * List all API keys (redacted — no hash returned).
 * Used by the admin portal for key management UI.
 */
export async function listApiKeys(): Promise<Omit<ApiKeyRecord, 'key_hash'>[]> {
  return db('api_keys')
    .select('id', 'name', 'key_prefix', 'platform', 'active', 'can_view_raw', 'last_used_at', 'created_at')
    .orderBy('created_at', 'desc') as Promise<Omit<ApiKeyRecord, 'key_hash'>[]>;
}

/**
 * Insert a new API key record.
 * The raw key must be bcrypt-hashed by the caller before passing keyHash.
 */
export async function insertApiKey(input: {
  name: string;
  keyHash: string;    // bcrypt hash — not the raw key
  keyPrefix: string;  // First 8 chars of raw key
  platform: Platform;
  canViewRaw?: boolean;
}): Promise<string> {
  const [row] = (await db('api_keys')
    .insert({
      name: input.name,
      key_hash: input.keyHash,
      key_prefix: input.keyPrefix,
      platform: input.platform,
      can_view_raw: input.canViewRaw ?? false,
    })
    .returning('id')) as { id: string }[];

  return row?.id ?? '';
}
