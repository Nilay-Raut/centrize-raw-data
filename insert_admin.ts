import * as bcrypt from 'bcrypt';
import db from './src/db/knex';

async function main() {
  try {
    // 1. Insert Admin User
    const [adminUser] = await db('admin_users')
      .insert({
        email: 'admin@4ibiz.in',
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

    // 2. Generate and Insert "Full Access" Admin API Key
    const rawKeyFull = `cdp_admin_full_test_key_abc12345`;
    const keyPrefixFull = 'admin_fu';
    const hashFull = await bcrypt.hash(rawKeyFull, 10);

    await db('api_keys')
      .insert({
        name: 'Full Access Admin Key',
        key_hash: hashFull,
        key_prefix: keyPrefixFull,
        platform: 'admin',
        active: true,
        can_view_raw: true
      })
      .onConflict('key_prefix')
      .merge();

    // 3. Generate and Insert "Masked Access" Admin API Key
    const rawKeyMasked = `cdp_admin_masked_test_key_xyz98765`;
    const keyPrefixMasked = 'admin_ma';
    const hashMasked = await bcrypt.hash(rawKeyMasked, 10);

    await db('api_keys')
      .insert({
        name: 'Masked Access Admin Key',
        key_hash: hashMasked,
        key_prefix: keyPrefixMasked,
        platform: 'admin',
        active: true,
        can_view_raw: false
      })
      .onConflict('key_prefix')
      .merge();

    console.log('========================================');
    console.log('  Admin API Key Setup Complete');
    console.log('========================================');
    console.log(`  Full Access Key: ${rawKeyFull}`);
    console.log(`  Masked Access Key: ${rawKeyMasked}`);
    console.log('  ⚠ COPY AND SECURE THESE KEYS!');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main();
