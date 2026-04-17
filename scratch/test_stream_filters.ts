
import { bulkUpsertContacts, recordCampaignUsage, streamContactsQuery } from '../src/db/queries/contacts';
import db from '../src/db/knex';

async function testStreamFilters() {
  const segment = 'stream-test-' + Date.now();
  
  console.log('--- Step 1: Creating 10 test contacts ---');
  const contactsToCreate = [];
  for (let i = 1; i <= 10; i++) {
    contactsToCreate.push({
      phone: `+91000000111${i}`,
      name: `Stream User ${i}`,
      segment
    });
  }
  await bulkUpsertContacts(contactsToCreate);
  
  const allContacts = await db('contacts').where({ segment });
  const ids = allContacts.map(c => c.id);
  
  console.log('--- Step 2: Recording usage for contacts 1-5 (Campaign STREAM, WhatsApp) ---');
  await recordCampaignUsage(ids.slice(0, 5), {
    campaign_name: 'Campaign STREAM',
    campaign_type: 'whatsapp'
  });

  console.log('\n--- Step 3: Testing Stream Filters ---');

  const countStreamResults = async (filter: any) => {
    return new Promise<number>((resolve, reject) => {
      let count = 0;
      const stream = streamContactsQuery({ ...filter, segment });
      stream.on('data', () => count++);
      stream.on('end', () => resolve(count));
      stream.on('error', reject);
    });
  };

  // Test 1: in_campaign = 'Campaign STREAM' (Should be 5)
  const countA = await countStreamResults({ in_campaign: 'Campaign STREAM' });
  console.log(`- Stream 'in_campaign: Campaign STREAM': ${countA} (Expected: 5)`);

  // Test 2: not_in_campaign = 'Campaign STREAM' (Should be 5)
  const countNotA = await countStreamResults({ not_in_campaign: 'Campaign STREAM' });
  console.log(`- Stream 'not_in_campaign: Campaign STREAM': ${countNotA} (Expected: 5)`);

  // Test 3: last_used_before = Yesterday (Should be 5 - contacts 6-10 who have NO history)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const countAfter = await countStreamResults({ last_used_before: yesterday.toISOString() });
  console.log(`- Stream 'last_used_before: Yesterday': ${countAfter} (Expected: 5)`);

  console.log('\n--- Step 4: Final Check ---');
  if (countA === 5 && countNotA === 5 && countAfter === 5) {
    console.log('✅ STREAM FILTERS VERIFIED SUCCESSFULLY');
  } else {
    console.log('❌ VERIFICATION FAILED');
  }

  // Cleanup
  await db('campaign_history').whereIn('contact_id', ids).delete();
  await db('contacts').where({ segment }).delete();
  process.exit(0);
}

testStreamFilters().catch(err => {
  console.error(err);
  process.exit(1);
});
