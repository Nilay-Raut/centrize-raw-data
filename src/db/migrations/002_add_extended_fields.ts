import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contacts', (t) => {
    // Professional
    t.string('company_name', 255).nullable();
    t.string('designation', 255).nullable();
    t.string('sector', 100).nullable();
    t.string('sub_sector', 100).nullable();
    t.string('industry', 100).nullable();

    // Location
    t.text('address').nullable();
    t.string('city', 100).nullable();
    t.string('state', 100).nullable();
    t.string('pincode', 20).nullable();

    // Demographic
    t.string('gender', 20).nullable();
    t.date('dob').nullable();

    // Social/Web
    t.string('website', 255).nullable();
    t.string('linkedin_url', 255).nullable();
  });

  // Indices for frequently filtered fields
  await knex.raw('CREATE INDEX contacts_city_idx ON contacts (city)');
  await knex.raw('CREATE INDEX contacts_state_idx ON contacts (state)');
  await knex.raw('CREATE INDEX contacts_industry_idx ON contacts (industry)');
  await knex.raw('CREATE INDEX contacts_sector_idx ON contacts (sector)');
  await knex.raw('CREATE INDEX contacts_company_name_idx ON contacts (company_name)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('contacts', (t) => {
    t.dropColumns(
      'company_name', 'designation', 'sector', 'sub_sector', 'industry',
      'address', 'city', 'state', 'pincode',
      'gender', 'dob',
      'website', 'linkedin_url'
    );
  });
  
  await knex.raw('DROP INDEX IF EXISTS contacts_city_idx');
  await knex.raw('DROP INDEX IF EXISTS contacts_state_idx');
  await knex.raw('DROP INDEX IF EXISTS contacts_industry_idx');
  await knex.raw('DROP INDEX IF EXISTS contacts_sector_idx');
  await knex.raw('DROP INDEX IF EXISTS contacts_company_name_idx');
}
