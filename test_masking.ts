
import { queryService } from './src/services/QueryService';
import db from './src/db/knex';

async function testMasking() {
  const segment = 'masking-test-' + Date.now();
  
  console.log('--- Step 1: Creating a test contact ---');
  await db('contacts').insert({
    phone: '+919876543210',
    email: 'nilay.raut@centrize.com',
    name: 'Nilay Raut',
    segment,
    language: 'en'
  });

  console.log('\n--- Step 2: Query with canViewRaw = false (Masked) ---');
  const maskedResult = await queryService.query({ filters: { segment } }, 'admin', false);
  const mRow = maskedResult.data[0];
  if (!mRow) throw new Error('Masked row not found');
  console.log('Masked Result:', { phone: mRow.phone, email: mRow.email });

  console.log('\n--- Step 3: Query with canViewRaw = true (Raw) ---');
  const rawResult = await queryService.query({ filters: { segment } }, 'admin', true);
  const rRow = rawResult.data[0];
  if (!rRow) throw new Error('Raw row not found');
  console.log('Raw Result:   ', { phone: rRow.phone, email: rRow.email });

  if (mRow.phone?.includes('*') && rRow.phone === '+919876543210') {
    console.log('\n✅ BACKEND MASKING VERIFIED SUCCESSFULLY');
  } else {
    console.log('\n❌ MASKING VERIFICATION FAILED');
  }

  // Cleanup
  await db('contacts').where({ segment }).delete();
  process.exit(0);
}

testMasking().catch(console.error);
