
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (t) => {
    t.boolean('can_view_raw').notNullable().defaultTo(false);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('api_keys', (t) => {
    t.dropColumn('can_view_raw');
  });
}
