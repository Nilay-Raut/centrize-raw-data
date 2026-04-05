import db from './src/db/knex';

async function check() {
  try {
    const keys = await db('api_keys').select('name', 'key_prefix', 'platform', 'active');
    console.log('API Keys:', JSON.stringify(keys, null, 2));

    const jobs = await db('upload_jobs').select('id', 'filename', 'status', 'total_rows', 'processed_rows');
    console.log('Recent Jobs:', JSON.stringify(jobs, null, 2));

    const contactCount = await db('contacts').count('id as count').first();
    console.log('Total Contacts:', contactCount);

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

check();
