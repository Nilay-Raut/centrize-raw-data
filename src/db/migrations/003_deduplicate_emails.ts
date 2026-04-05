/**
 * Migration 003 — Email Deduplication
 *
 * 1. Cleanup: Identify rows with duplicate (email, segment) where phone is different.
 *    Keeps the most recently updated row.
 * 2. Constraint: Adds a UNIQUE index on (email, segment) for non-null emails.
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ─── Phase 1: Cleanup Existing Duplicates ───────────────────────────
  
  // This query identifies duplicates on (email, segment) and deletes all but the latest updated one.
  // We use a CTE to find all row IDs that should be deleted.
  await knex.raw(`
    DELETE FROM contacts
    WHERE id IN (
      SELECT id
      FROM (
        SELECT id,
               ROW_NUMBER() OVER (
                 PARTITION BY email, segment 
                 ORDER BY updated_at DESC, created_at DESC, id ASC
               ) as rnum
        FROM contacts
        WHERE email IS NOT NULL AND email != ''
      ) t
      WHERE t.rnum > 1
    )
  `);

  // ─── Phase 2: Add Unique Constraint ─────────────────────────────────
  
  // We use a partial index (WHERE email IS NOT NULL) to allow multiple NULL emails per segment
  // but enforce uniqueness for provided emails.
  await knex.raw('CREATE UNIQUE INDEX contacts_email_segment_uniq ON contacts (email, segment) WHERE email IS NOT NULL');
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw('DROP INDEX IF EXISTS contacts_email_segment_uniq');
}
