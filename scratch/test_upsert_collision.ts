
import { bulkUpsertContacts } from '../src/db/queries/contacts';
import { normaliseEmail } from '../src/services/NormaliserService';
import db from '../src/db/knex';

async function testUpsertCollision() {
  const segment = 'collision-test-' + Date.now();
  
  console.log('--- Step 1: Testing Email Normalisation ---');
  const testEmails = ['.', '-', 'NA', 'none', 'user@example.com'];
  for (const email of testEmails) {
    const norm = normaliseEmail(email);
    console.log(`- ${email} → ${norm === null ? 'NULL' : norm}`);
  }

  console.log('\n--- Step 2: Testing Placeholder Collision ---');
  // Two contacts with same placeholder email but different phones
  const batch1 = [
    { phone: '+910000000001', email: '.', segment, name: 'User 1' },
    { phone: '+910000000002', email: '.', segment, name: 'User 2' }
  ];
  
  // Normalise manually as the service would do
  const normalisedBatch1 = batch1.map(c => ({
    ...c,
    email: normaliseEmail(c.email) || undefined
  }));

  try {
    await bulkUpsertContacts(normalisedBatch1);
    console.log('✅ Batch 1 (Placeholder clash) uploaded successfully');
  } catch (err) {
    console.error('❌ Batch 1 failed!', err);
  }

  console.log('\n--- Step 3: Testing Phone vs Email Cross-match ---');
  // Contact A: P1, E1
  // Contact B: P2, E2
  await bulkUpsertContacts([
    { phone: '+911111111111', email: 'one@test.com', segment, name: 'One' },
    { phone: '+912222222222', email: 'two@test.com', segment, name: 'Two' }
  ]);

  // Now, upload a row that has Phone of A but Email of B
  // Correct behavior: Update A, but don't steal B's email (as it would cause UniqueViolation)
  const crossRow = { phone: '+911111111111', email: 'two@test.com', segment, name: 'One-Updated' };
  
  try {
    await bulkUpsertContacts([crossRow]);
    console.log('✅ Cross-match row uploaded successfully (No UniqueViolation)');
    
    // Check results
    const rowA = await db('contacts').where({ phone: '+911111111111', segment }).first();
    const rowB = await db('contacts').where({ phone: '+912222222222', segment }).first();
    
    console.log(`- Row A Name: ${rowA.name} (Expected: One-Updated)`);
    console.log(`- Row A Email: ${rowA.email} (Expected: one@test.com - NOT two@test.com)`);
    console.log(`- Row B Email: ${rowB.email} (Expected: two@test.com)`);

  } catch (err) {
    console.error('❌ Cross-match failed!', err);
  }

  // Cleanup
  await db('contacts').where({ segment }).delete();
  console.log('\n--- Cleanup Done ---');
  process.exit(0);
}

testUpsertCollision().catch(err => {
  console.error(err);
  process.exit(1);
});
