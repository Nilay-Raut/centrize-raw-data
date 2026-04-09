import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('admin_users', (t) => {
    // Existing admins default to full access (non-breaking change)
    t.boolean('can_view_raw').notNullable().defaultTo(true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('admin_users', (t) => {
    t.dropColumn('can_view_raw');
  });
}
