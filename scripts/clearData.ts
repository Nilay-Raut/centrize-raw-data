/**
 * clearData.ts — wipe all contact data and job history.
 *
 * KEEPS:   admin_users, api_keys (login + platform keys untouched)
 * DELETES: contacts, upload_jobs, campaign_history (DB)
 *          bull:* and rl:* keys (Redis queue + rate limit state)
 *
 * Usage:
 *   ts-node scripts/clearData.ts
 */

import '../src/config/env';
import db from '../src/db/knex';
import redis from '../src/db/redis';

async function clearData(): Promise<void> {
  console.log('Starting data clear...\n');

  // ── Postgres ──────────────────────────────────────────────────────────────
  console.log('[DB] Clearing campaign_history...');
  await db('campaign_history').delete();

  console.log('[DB] Clearing upload_jobs...');
  await db('upload_jobs').delete();

  console.log('[DB] Clearing contacts...');
  await db('contacts').delete();

  console.log('[DB] Done. admin_users and api_keys untouched.\n');

  // ── Redis ─────────────────────────────────────────────────────────────────
  const patterns = ['bull:*', 'rl:*'];

  for (const pattern of patterns) {
    let cursor = '0';
    let deleted = 0;

    do {
      const [nextCursor, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redis.del(...keys);
        deleted += keys.length;
      }
    } while (cursor !== '0');

    console.log(`[Redis] Deleted ${deleted} keys matching "${pattern}"`);
  }

  console.log('[Redis] Done. apikey:platform:* cache left intact.\n');

  await db.destroy();
  await redis.quit();

  console.log('All done.');
}

clearData().catch((err) => {
  console.error('clearData failed:', err);
  process.exit(1);
});
