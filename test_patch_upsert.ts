
import { bulkUpsertContacts } from './src/db/queries/contacts';
import db from './src/db/knex';

async function testPatch() {
  const segment = 'test-patch-' + Date.now();
  const phone = '+919998887776';

  console.log('--- Step 1: Initial upload (Name + Industry) ---');
  await bulkUpsertContacts([{
    phone,
    name: 'Initial Name',
    industry: 'Technology',
    segment,
    opt_out_whatsapp: false
  }]);

  let contact = await db('contacts').where({ phone, segment }).first();
  console.log('Contact after Step 1:', {
    name: contact.name,
    industry: contact.industry,
    opt_out_whatsapp: contact.opt_out_whatsapp
  });

  console.log('\n--- Step 2: Patch upload (Update Opt-out ONLY) ---');
  // Simulating a CSV that only has phone and opt-out mapped
  await bulkUpsertContacts([{
    phone,
    segment,
    opt_out_whatsapp: true
  }]);

  contact = await db('contacts').where({ phone, segment }).first();
  console.log('Contact after Step 2:', {
    name: contact.name, // Should remain 'Initial Name'
    industry: contact.industry, // Should remain 'Technology'
    opt_out_whatsapp: contact.opt_out_whatsapp // Should be true
  });

  console.log('\n--- Step 3: Patch upload (Update Industry ONLY) ---');
  await bulkUpsertContacts([{
    phone,
    segment,
    industry: 'Healthcare'
  }]);

  contact = await db('contacts').where({ phone, segment }).first();
  console.log('Contact after Step 3:', {
    name: contact.name, // Should remain 'Initial Name'
    industry: contact.industry, // Should be 'Healthcare'
    opt_out_whatsapp: contact.opt_out_whatsapp // Should remain true
  });

  if (contact.name === 'Initial Name' && contact.industry === 'Healthcare' && contact.opt_out_whatsapp === true) {
    console.log('\n✅ PATCH UPSERT VERIFIED SUCCESSFULLY');
  } else {
    console.log('\n❌ PATCH UPSERT FAILED');
  }

  // Cleanup
  await db('contacts').where({ segment }).delete();
  process.exit(0);
}

testPatch().catch(err => {
  console.error(err);
  process.exit(1);
});
