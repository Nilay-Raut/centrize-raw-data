/**
 * Migration 001 — Initial schema
 *
 * Creates:
 *   contacts     — core contact table with GIN tag index + unique(phone, segment)
 *   upload_jobs  — tracks file ingestion progress
 *   api_keys     — hashed platform API keys
 *   admin_users  — internal login for admin portal
 */

import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── contacts ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('phone', 20).notNullable();             // E.164 format: +919876543210
    t.string('email', 255).nullable();
    t.string('name', 255).nullable();
    t.string('language', 10).notNullable().defaultTo('en');
    t.specificType('tags', 'text[]').nullable();      // GIN indexed — used for tag filters
    t.string('segment', 100).notNullable();
    t.string('source_batch_id', 100).nullable();      // Which upload_job created/updated this
    t.jsonb('custom').notNullable().defaultTo('{}');  // Overflow for unmapped CSV columns
    t.boolean('opt_out_whatsapp').notNullable().defaultTo(false);
    t.boolean('opt_out_email').notNullable().defaultTo(false);
    t.boolean('opt_out_call').notNullable().defaultTo(false);
    t.timestamps(true, true);                         // created_at, updated_at
  });

  // Standard indexes
  await knex.raw('CREATE INDEX contacts_phone_idx ON contacts (phone)');
  await knex.raw('CREATE INDEX contacts_email_idx ON contacts (email)');
  await knex.raw('CREATE INDEX contacts_segment_idx ON contacts (segment)');
  await knex.raw('CREATE INDEX contacts_language_idx ON contacts (language)');
  // GIN index for array containment queries (@> operator)
  await knex.raw('CREATE INDEX contacts_tags_gin_idx ON contacts USING GIN (tags)');
  // Composite index for cursor-based pagination
  await knex.raw('CREATE INDEX contacts_segment_id_idx ON contacts (segment, id)');
  // Unique constraint — deduplication key
  await knex.raw('CREATE UNIQUE INDEX contacts_phone_segment_uniq ON contacts (phone, segment)');

  // ── upload_jobs ───────────────────────────────────────────────────────────
  await knex.schema.createTable('upload_jobs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('filename', 255).notNullable();
    t.string('status', 20).notNullable().defaultTo('queued'); // queued|processing|done|failed
    t.integer('total_rows').notNullable().defaultTo(0);
    t.integer('processed_rows').notNullable().defaultTo(0);
    t.integer('failed_rows').notNullable().defaultTo(0);
    t.string('segment', 100).notNullable();
    t.text('error_log').nullable();
    t.timestamps(true, true);
  });

  await knex.raw('CREATE INDEX upload_jobs_status_idx ON upload_jobs (status)');
  await knex.raw('CREATE INDEX upload_jobs_segment_idx ON upload_jobs (segment)');

  // ── api_keys ──────────────────────────────────────────────────────────────
  await knex.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();            // Human-readable label, e.g. "WhatsApp Prod"
    t.string('key_hash', 255).notNullable();        // bcrypt hash — never the raw key
    t.string('key_prefix', 8).notNullable();        // First 8 chars of raw key — for prefix lookup
    t.string('platform', 20).notNullable();         // whatsapp | email | admin | csv_export
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('last_used_at').nullable();
    t.timestamps(true, true);
  });

  await knex.raw('CREATE UNIQUE INDEX api_keys_prefix_uniq ON api_keys (key_prefix)');
  await knex.raw('CREATE INDEX api_keys_active_platform_idx ON api_keys (active, platform)');

  // ── admin_users ───────────────────────────────────────────────────────────
  await knex.schema.createTable('admin_users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('admin_users');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('upload_jobs');
  await knex.schema.dropTableIfExists('contacts');
}
