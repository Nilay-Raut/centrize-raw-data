import bcrypt from 'bcrypt';
import db from './src/db/knex';

async function verify() {
  const rawKey = 'cdp_admin_test_key_1234567890abcdef';
  const prefix = 'admin_te';

  try {
    const record = await db('api_keys').where({ key_prefix: prefix }).first();
    if (!record) {
      console.log('Error: Key prefix not found in database');
      process.exit(1);
    }

    console.log('Record found:', {
      name: record.name,
      platform: record.platform,
      key_prefix: record.key_prefix,
      active: record.active
    });

    const isValid = await bcrypt.compare(rawKey, record.key_hash);
    console.log('Verification result (rawKey vs key_hash):', isValid);

    if (!isValid) {
      console.log('Hash in DB:', record.key_hash);
      console.log('Length of hash:', record.key_hash.length);
    }

    process.exit(0);
  } catch (error) {
    console.error('Error during verification:', error);
    process.exit(1);
  }
}

verify();
