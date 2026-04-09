
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('campaign_history', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('contact_id').notNullable().references('id').inTable('contacts').onDelete('CASCADE');
    t.string('campaign_name', 255).notNullable();
    t.string('campaign_type', 50).notNullable();     // whatsapp | email | call | etc.
    t.string('platform', 50).nullable();            // Meta | Twilio | SendGrid
    t.timestamp('used_at').notNullable().defaultTo(knex.fn.now());
  });

  // Indexes for fast filtering
  await knex.raw('CREATE INDEX campaign_history_contact_id_idx ON campaign_history (contact_id)');
  await knex.raw('CREATE INDEX campaign_history_name_idx ON campaign_history (campaign_name)');
  await knex.raw('CREATE INDEX campaign_history_type_idx ON campaign_history (campaign_type)');
  await knex.raw('CREATE INDEX campaign_history_used_at_idx ON campaign_history (used_at)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('campaign_history');
}
