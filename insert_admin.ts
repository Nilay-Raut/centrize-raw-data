import * as crypto from 'crypto';
import * as bcrypt from 'bcrypt';
import db from './src/db/knex';

/**
 * Generates a cryptographically unpredictable CDP API key.
 *
 * Format: cdp_<40 random hex chars>
 * Prefix (chars 4-12, i.e. first 8 chars after "cdp_") is used as the DB lookup prefix.
 * Total entropy: 160 bits (40 hex chars = 20 random bytes).
 */
function generateRawKey(): { raw: string; prefix: string } {
  const random = crypto.randomBytes(20).toString('hex'); // 40 hex chars, 160-bit entropy
  const raw = `cdp_${random}`;
  const prefix = random.slice(0, 8); // First 8 chars after "cdp_" — used as lookup prefix
  return { raw, prefix };
}

async function main() {
  try {
    // ── 1. Admin user ─────────────────────────────────────────────────────────
    const [adminUser] = await db('admin_users')
      .insert({
        email: 'admin@4ibiz.in',
        password_hash: '$2b$10$xQXyHqi3ZIV/ot4i.Wy0v.KHtvG1YN1IK7HxLvQ70sxmqXfTinti6',
        can_view_raw: true, // Full access — can export raw CSV data
      })
      .onConflict('email')
      .merge({ can_view_raw: true }) // Update existing row to ensure full access
      .returning('*');

    if (adminUser) {
      console.log('Admin user inserted/updated successfully');
    } else {
      console.log('Admin user unchanged');
    }

    // ── 2. Full Access API Key (can_view_raw: true) ──────────────────────────
    const full = generateRawKey();
    const hashFull = await bcrypt.hash(full.raw, 10);

    await db('api_keys')
      .insert({
        name: 'Full Access Admin Key',
        key_hash: hashFull,
        key_prefix: full.prefix,
        platform: 'admin',
        active: true,
        can_view_raw: true,
      })
      .onConflict('key_prefix')
      .merge();

    // ── 3. Masked Access API Key (can_view_raw: false) ───────────────────────
    const masked = generateRawKey();
    const hashMasked = await bcrypt.hash(masked.raw, 10);

    await db('api_keys')
      .insert({
        name: 'Masked Access Admin Key',
        key_hash: hashMasked,
        key_prefix: masked.prefix,
        platform: 'admin',
        active: true,
        can_view_raw: false,
      })
      .onConflict('key_prefix')
      .merge();

    console.log('\n========================================');
    console.log('  Admin Setup Complete');
    console.log('========================================');
    console.log('  Full Access Key (can export raw CSV):');
    console.log(`    ${full.raw}`);
    console.log('  Masked Access Key (query only, no export):');
    console.log(`    ${masked.raw}`);
    console.log('\n  ⚠  COPY AND SECURE THESE KEYS NOW.');
    console.log('  They will not be shown again.');
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error during setup:', error);
    process.exit(1);
  }
}

main();

//Full Access (export enabled): cdp_4224848ad51b2d1bf4787b67b57f7ac0274da500
//Masked Access (export blocked): cdp_9e6438f220e2daa0760778e512cb99952821e7f8
