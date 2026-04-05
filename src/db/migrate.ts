/* eslint-disable no-console */
/**
 * Migration runner — called by `npm run migrate` and `npm run migrate:rollback`.
 *
 * Usage:
 *   npm run migrate           → apply all pending migrations
 *   npm run migrate:rollback  → roll back the last batch (LOCAL DEV ONLY)
 */

import db from './knex';

async function run(): Promise<void> {
  const isRollback = process.argv[2] === 'rollback';

  try {
    if (isRollback) {
      console.log('[migrate] Rolling back last batch...');
      const [batchNo, list] = (await db.migrate.rollback()) as [number, string[]];
      console.log(`[migrate] Rolled back batch ${batchNo}: ${list.join(', ')}`);
    } else {
      console.log('[migrate] Running pending migrations...');
      const [batchNo, list] = (await db.migrate.latest()) as [number, string[]];
      if (list.length === 0) {
        console.log('[migrate] Already up to date.');
      } else {
        console.log(`[migrate] Applied batch ${batchNo}: ${list.join(', ')}`);
      }
    }
  } catch (err) {
    console.error('[migrate] Migration failed:', err);
    process.exit(1);
  } finally {
    await db.destroy();
  }
}

void run();
