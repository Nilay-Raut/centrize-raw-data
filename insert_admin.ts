import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';
import db from './src/db/knex';

async function main() {
  try {
    // 1. Insert Admin User
    const [adminUser] = await db('admin_users')
      .insert({
        email: 'admin@yourapp.com',
        password_hash: '$2b$10$xQXyHqi3ZIV/ot4i.Wy0v.KHtvG1YN1IK7HxLvQ70sxmqXfTinti6'
      })
      .onConflict('email')
      .ignore()
      .returning('*');

    if (adminUser) {
      console.log('Admin user inserted successfully');
    } else {
      console.log('Admin user already exists');
    }

    // 2. Generate and Insert Admin API Key
    const rawKey = `cdp_admin_test_key_1234567890abcdef`;
    const keyPrefix = 'admin_te'; // 8 chars after "cdp_"
    const hash = await bcrypt.hash(rawKey, 10);
    const keyId = crypto.randomUUID();

    await db('api_keys')
      .insert({
        id: keyId,
        name: 'Admin Portal Key',
        key_hash: hash,
        key_prefix: keyPrefix,
        platform: 'admin',
        active: true
      })
      .onConflict('key_prefix')
      .ignore();

    console.log('========================================');
    console.log('  Admin API Key Setup Complete');
    console.log('========================================');
    console.log(`  Raw Key:    ${rawKey}`);
    console.log(`  Key Prefix: ${keyPrefix}`);
    console.log('  ⚠ COPY AND SECURE THIS KEY NOW!');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main();
