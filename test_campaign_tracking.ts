
import { bulkUpsertContacts, queryContacts, recordCampaignUsage } from './src/db/queries/contacts';
import db from './src/db/knex';

async function testHistory() {
  const segment = 'history-test-' + Date.now();
  
  console.log('--- Step 1: Creating 10 test contacts ---');
  const contactsToCreate = [];
  for (let i = 1; i <= 10; i++) {
    contactsToCreate.push({
      phone: `+91000000000${i}`,
      name: `User ${i}`,
      segment
    });
  }
  await bulkUpsertContacts(contactsToCreate);
  
  const allContacts = await db('contacts').where({ segment });
  const ids = allContacts.map(c => c.id);
  
  console.log('\n--- Step 2: Recording usage for contacts 1-5 (Campaign A, WhatsApp) ---');
  await recordCampaignUsage(ids.slice(0, 5), {
    campaign_name: 'Campaign A',
    campaign_type: 'whatsapp'
  });

  console.log('--- Step 3: Recording usage for contacts 3-7 (Campaign B, Call) ---');
  await recordCampaignUsage(ids.slice(2, 7), {
    campaign_name: 'Campaign B',
    campaign_type: 'call'
  });

  console.log('\n--- Step 4: Testing Filters ---');

  // Test 1: in_campaign = 'Campaign A' (Should be 5)
  const resA = await queryContacts({ in_campaign: 'Campaign A', segment }, 10, null);
  console.log(`- Filter 'in_campaign: Campaign A': ${resA.totalCount} (Expected: 5)`);

  // Test 2: not_in_campaign = 'Campaign A' (Should be 5)
  const resNotA = await queryContacts({ not_in_campaign: 'Campaign A', segment }, 10, null);
  console.log(`- Filter 'not_in_campaign: Campaign A': ${resNotA.totalCount} (Expected: 5)`);

  // Test 3: used_in_types = ['call'] (Should be 5: contacts 3-7)
  const resCall = await queryContacts({ used_in_types: ['call'], segment }, 10, null);
  console.log(`- Filter 'used_in_types: call': ${resCall.totalCount} (Expected: 5)`);

  // Test 4: last_used_before = Tomorrow (Should be 10 - everyone was used or not used, but nothing AFTER tomorrow)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const resBefore = await queryContacts({ last_used_before: tomorrow.toISOString(), segment }, 10, null);
  console.log(`- Filter 'last_used_before: Tomorrow': ${resBefore.totalCount} (Expected: 10)`);

  // Test 5: last_used_before = Yesterday (Should be 3 - contacts 8, 9, 10 who have NO history. Contacts 1-7 have usage TODAY, which is >= Yesterday)
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const resAfter = await queryContacts({ last_used_before: yesterday.toISOString(), segment }, 10, null);
  console.log(`- Filter 'last_used_before: Yesterday': ${resAfter.totalCount} (Expected: 3)`);

  console.log('\n--- Step 5: Final Check ---');
  if (resA.totalCount === 5 && resNotA.totalCount === 5 && resCall.totalCount === 5 && resBefore.totalCount === 10 && resAfter.totalCount === 3) {
    console.log('✅ CAMPAIGN HISTORY & FILTERING VERIFIED SUCCESSFULLY');
  } else {
    console.log('❌ VERIFICATION FAILED');
  }

  // Cleanup
  await db('campaign_history').whereIn('contact_id', ids).delete();
  await db('contacts').where({ segment }).delete();
  process.exit(0);
}

testHistory().catch(err => {
  console.error(err);
  process.exit(1);
});
