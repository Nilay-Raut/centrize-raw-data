/**
 * generateApiKey.ts — CLI script to create a new API key.
 *
 * Usage:
 *   npx ts-node scripts/generateApiKey.ts --name "WhatsApp prod" --platform whatsapp
 *
 * Output (print once, never logged or stored):
 *   Raw key:    cdp_<32 random chars>
 *   Key prefix: <first 8 chars after cdp_>
 *   Hash:       bcrypt hash — store this in the api_keys table
 *
 * Then run the SQL to insert:
 *   INSERT INTO api_keys (id, name, key_hash, key_prefix, platform, active)
 *   VALUES ('<uuid>', '<name>', '<hash>', '<prefix>', '<platform>', true);
 *
 * HOW_TO_USE.md §11
 *
 * NOTE: Run from the project root:
 *   npx ts-node --project tsconfig.json scripts/generateApiKey.ts \
 *     --name "My key" --platform whatsapp
 */

import * as crypto from 'node:crypto';
import * as bcrypt from 'bcrypt';

// ── Argument parsing ────────────────────────────────────────────────────────
const args = process.argv.slice(2);

function getArg(flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx !== -1 ? args[idx + 1] : undefined;
}

const name     = getArg('--name');
const platform = getArg('--platform');

const VALID_PLATFORMS = ['whatsapp', 'email', 'admin', 'csv_export'] as const;
type Platform = (typeof VALID_PLATFORMS)[number];

if (!name || !platform) {
  console.error('Usage: npx ts-node scripts/generateApiKey.ts --name "<name>" --platform <whatsapp|email|admin|csv_export>');
  process.exit(1);
}

if (!(VALID_PLATFORMS as readonly string[]).includes(platform)) {
  console.error(`Invalid platform "${platform}". Must be one of: ${VALID_PLATFORMS.join(', ')}`);
  process.exit(1);
}

// ── Key generation ──────────────────────────────────────────────────────────

const BCRYPT_ROUNDS = 10;

async function main(): Promise<void> {
  // 32 random bytes → 64 hex chars, then take first 32 for the suffix
  const randomSuffix = crypto.randomBytes(24).toString('base64url').slice(0, 32);
  const rawKey       = `cdp_${randomSuffix}`;
  const keyPrefix    = randomSuffix.slice(0, 8);

  const hash = await bcrypt.hash(rawKey, BCRYPT_ROUNDS);
  const id   = crypto.randomUUID();

  // ── Output ────────────────────────────────────────────────────────────────
  console.log('\n========================================');
  console.log('  CDP API Key Generated');
  console.log('========================================\n');
  console.log(`  Name:       ${name}`);
  console.log(`  Platform:   ${platform as Platform}`);
  console.log(`  Raw key:    ${rawKey}`);
  console.log(`  Key prefix: ${keyPrefix}`);
  console.log(`  UUID:       ${id}`);
  console.log('\n  ⚠  COPY THE RAW KEY NOW — it will not be shown again.\n');
  console.log('----------------------------------------');
  console.log('  SQL to insert:\n');
  console.log(`  INSERT INTO api_keys (id, name, key_hash, key_prefix, platform, active, created_at)`);
  console.log(`  VALUES (`);
  console.log(`    '${id}',`);
  console.log(`    '${name}',`);
  console.log(`    '${hash}',`);
  console.log(`    '${keyPrefix}',`);
  console.log(`    '${platform}',`);
  console.log(`    true,`);
  console.log(`    NOW()`);
  console.log(`  );`);
  console.log('========================================\n');
}

main().catch((err: unknown) => {
  console.error('Key generation failed:', err);
  process.exit(1);
});
