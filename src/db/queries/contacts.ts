/**
 * All SQL for the contacts table.
 *
 * Rules:
 *   - Every function uses parameterised queries via Knex — no string concatenation.
 *   - All list operations use cursor-based pagination — no unbounded SELECT *.
 *   - Never import Express types here. This module is pure data access.
 */

import db from '../knex';
import type { ContactRecord, ContactFilter } from '../../types/models';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PaginatedContacts {
  rows: Partial<ContactRecord>[];
  nextCursor: string | null;
}

export interface UpsertContactInput {
  phone: string;           // Already normalised to E.164
  email?: string;
  name?: string;
  language?: string;
  tags?: string[];
  segment: string;
  source_batch_id?: string;
  custom?: Record<string, unknown>;
  opt_out_whatsapp?: boolean;
  opt_out_email?: boolean;
  opt_out_call?: boolean;

  // Extended Fields
  company_name?: string;
  designation?: string;
  industry?: string;
  sector?: string;
  sub_sector?: string;
  address?: string;
  city?: string;
  state?: string;
  pincode?: string;
  gender?: string;
  dob?: string;
  website?: string;
  linkedin_url?: string;
}

export interface PaginatedContacts {
  rows: Partial<ContactRecord>[];
  totalCount: number;
  pageSize: number;
  currentPage: number;
  totalPages: number;
  nextCursor: string | null;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Paginated contact query with filtering.
 * Supports both cursor-based (for infinite scroll) and offset-based (for traditional pager).
 */
export async function queryContacts(
  filter: ContactFilter,
  pageSize: number,
  cursor: string | null,
  fields: Array<keyof ContactRecord> = ['id', 'phone', 'name', 'email', 'segment', 'tags', 'city', 'industry', 'company_name'],
  page: number = 1
): Promise<PaginatedContacts> {
  const baseQuery = db('contacts');

  const applyFilters = (q: any) => {
    if (filter.segment) q.where('segment', filter.segment);
    if (filter.language) q.where('language', filter.language);
    if (filter.opt_out_whatsapp !== undefined) q.where('opt_out_whatsapp', filter.opt_out_whatsapp);
    if (filter.opt_out_email !== undefined) q.where('opt_out_email', filter.opt_out_email);
    if (filter.opt_out_call !== undefined) q.where('opt_out_call', filter.opt_out_call);
    if (filter.city) q.where('city', 'ilike', `%${filter.city}%`);
    if (filter.state) q.where('state', 'ilike', `%${filter.state}%`);
    if (filter.industry) q.where('industry', 'ilike', `%${filter.industry}%`);
    if (filter.sector) q.where('sector', 'ilike', `%${filter.sector}%`);
    if (filter.company_name) q.where('company_name', 'ilike', `%${filter.company_name}%`);

    if (filter.tags && filter.tags.length > 0) q.whereRaw('tags @> ?::text[]', [filter.tags]);
    if (filter.tags_any && filter.tags_any.length > 0) q.whereRaw('tags && ?::text[]', [filter.tags_any]);

    // History-based filters
    if (filter.in_campaign) {
      q.whereIn('id', db('campaign_history').select('contact_id').where('campaign_name', filter.in_campaign));
    }
    if (filter.not_in_campaign) {
      q.whereNotIn('id', db('campaign_history').select('contact_id').where('campaign_name', filter.not_in_campaign));
    }
    if (filter.last_used_before) {
      // Exclude contacts who have any usage AFTER the specified date
      q.whereNotExists(
        db('campaign_history')
          .select(1)
          .whereRaw('campaign_history.contact_id = contacts.id')
          .where('used_at', '>=', filter.last_used_before)
      );
    }
    if (filter.used_in_types && filter.used_in_types.length > 0) {
      q.whereIn('id', db('campaign_history').select('contact_id').whereIn('campaign_type', filter.used_in_types));
    }

    return q;
  };

  // 1. Get total count for traditional pagination
  const countResult = (await applyFilters(baseQuery.clone()).count('id as count').first()) as { count: string };
  const totalCount = parseInt(countResult.count, 10);
  const totalPages = Math.ceil(totalCount / pageSize);

  // 2. Fetch data
  let query = db('contacts').select(fields as string[]);
  query = applyFilters(query);

  if (cursor) {
    const decodedId = Buffer.from(cursor, 'base64').toString('utf8');
    query = query.where('id', '>', decodedId);
    query = query.orderBy('id', 'asc').limit(pageSize + 1);
  } else {
    // Traditional offset pagination
    const offset = (page - 1) * pageSize;
    query = query.orderBy('id', 'asc').limit(pageSize + 1).offset(offset);
  }

  const rows = (await query) as Partial<ContactRecord>[];

  let nextCursor: string | null = null;
  if (rows.length > pageSize) {
    rows.splice(pageSize);
    const lastRow = rows[rows.length - 1];
    if (lastRow?.id) {
      nextCursor = Buffer.from(lastRow.id).toString('base64');
    }
  }

  return {
    rows,
    totalCount,
    pageSize,
    currentPage: page,
    totalPages,
    nextCursor
  };
}

/**
 * Count estimate for a filter.
 */
export async function countContacts(filter: ContactFilter): Promise<number> {
  let query = db('contacts').count('id as count');

  if (filter.segment) query = query.where('segment', filter.segment);
  if (filter.language) query = query.where('language', filter.language);
  if (filter.opt_out_whatsapp !== undefined) query = query.where('opt_out_whatsapp', filter.opt_out_whatsapp);
  if (filter.opt_out_email !== undefined) query = query.where('opt_out_email', filter.opt_out_email);
  if (filter.opt_out_call !== undefined) query = query.where('opt_out_call', filter.opt_out_call);
  if (filter.tags && filter.tags.length > 0) query = query.whereRaw('tags @> ?::text[]', [filter.tags]);
  if (filter.tags_any && filter.tags_any.length > 0) query = query.whereRaw('tags && ?::text[]', [filter.tags_any]);

  // Extended search fields
  if (filter.city) query = query.where('city', 'ilike', `%${filter.city}%`);
  if (filter.industry) query = query.where('industry', 'ilike', `%${filter.industry}%`);
  if (filter.company_name) query = query.where('company_name', 'ilike', `%${filter.company_name}%`);

  const result = (await query.first()) as { count: string };
  return parseInt(result.count, 10);
}

/**
 * Upsert a single contact row.
 * Handles both phone and email uniqueness within a segment.
 */
export async function upsertContact(input: UpsertContactInput): Promise<void> {
  await bulkUpsertContacts([input]);
}

/**
 * Bulk upsert with multi-key deduplication (phone and email).
 *
 * Pattern:
 *   1. Fetch all existing contacts in the segment that match ANY incoming phone or email.
 *   2. Map incoming rows to existing IDs where found.
 *   3. For matches: Update (using ON CONFLICT (id) DO UPDATE).
 *   4. For new: Insert.
 *
 * Note: If an incoming row matches BOTH a phone and a DIFFERENT email (two different rows),
 * we prioritize the phone match and update that row. In a future version, we might
 * want to merge those two rows.
 */
export async function bulkUpsertContacts(inputs: UpsertContactInput[]): Promise<void> {
  if (inputs.length === 0) return;

  // 1. Internal deduplication of the incoming batch (last-one-wins)
  // This prevents unique violations if the same batch has multiple rows for the same phone/email
  const phoneToInput = new Map<string, UpsertContactInput>();
  const emailToInput = new Map<string, UpsertContactInput>();
  
  const finalInputs: UpsertContactInput[] = [];
  
  // We process in reverse (last-one-wins)
  for (let i = inputs.length - 1; i >= 0; i--) {
    const input = inputs[i]!;
    const phoneKey = `${input.segment}:${input.phone}`;
    const emailKey = input.email ? `${input.segment}:${input.email.toLowerCase()}` : null;
    
    if (phoneToInput.has(phoneKey) || (emailKey && emailToInput.has(emailKey))) {
      // Already handled a "later" version of this contact in the batch
      continue;
    }
    
    phoneToInput.set(phoneKey, input);
    if (emailKey) emailToInput.set(emailKey, input);
    finalInputs.push(input);
  }
  
  const uniqueInputs = finalInputs.reverse(); // Restore original order (for what it's worth)

  const segment = uniqueInputs[0]!.segment;
  const phones = uniqueInputs.map((i) => i.phone);
  const emails = uniqueInputs.map((i) => i.email).filter(Boolean) as string[];

  // 2. Fetch existing contacts that might conflict (fetch all columns for merging)
  const existing = await db('contacts')
    .select('*')
    .where({ segment })
    .andWhere((qb) => {
      qb.whereIn('phone', phones);
      if (emails.length > 0) {
        qb.orWhereIn('email', emails);
      }
    });

  // Create lookups (store the full record)
  const byPhone = new Map<string, any>();
  const byEmail = new Map<string, any>();
  existing.forEach((c) => {
    byPhone.set(c.phone, c);
    if (c.email) byEmail.set(c.email.toLowerCase(), c);
  });

  // 3. Map uniqueInputs to rows with partial merging
  const rows = uniqueInputs.map((input) => {
    // Priority: Phone match, then Email match
    const existing = byPhone.get(input.phone) || (input.email ? byEmail.get(input.email) : null);

    // Merge logic: Use input value if provided, else keep existing DB value, else use default
    return {
      id: existing?.id || undefined, // undefined triggers auto-gen UUID on insert
      phone: input.phone,
      email: input.email !== undefined ? (input.email ?? null) : (existing?.email ?? null),
      name: input.name !== undefined ? (input.name ?? null) : (existing?.name ?? null),
      language: input.language !== undefined ? input.language : (existing?.language ?? 'en'),
      tags: input.tags !== undefined 
        ? (input.tags ? db.raw('?::text[]', [input.tags]) : null)
        : (existing?.tags ? db.raw('?::text[]', [existing.tags]) : null),
      segment: input.segment,
      source_batch_id: input.source_batch_id ?? null,
      custom: input.custom 
        ? JSON.stringify({ ...(existing?.custom || {}), ...input.custom }) 
        : JSON.stringify(existing?.custom || {}),
      opt_out_whatsapp: input.opt_out_whatsapp !== undefined 
        ? input.opt_out_whatsapp 
        : (existing?.opt_out_whatsapp ?? false),
      opt_out_email: input.opt_out_email !== undefined 
        ? input.opt_out_email 
        : (existing?.opt_out_email ?? false),
      opt_out_call: input.opt_out_call !== undefined 
        ? input.opt_out_call 
        : (existing?.opt_out_call ?? false),
      
      // Extended fields
      company_name: input.company_name !== undefined ? (input.company_name ?? null) : (existing?.company_name ?? null),
      designation: input.designation !== undefined ? (input.designation ?? null) : (existing?.designation ?? null),
      industry: input.industry !== undefined ? (input.industry ?? null) : (existing?.industry ?? null),
      sector: input.sector !== undefined ? (input.sector ?? null) : (existing?.sector ?? null),
      sub_sector: input.sub_sector !== undefined ? (input.sub_sector ?? null) : (existing?.sub_sector ?? null),
      address: input.address !== undefined ? (input.address ?? null) : (existing?.address ?? null),
      city: input.city !== undefined ? (input.city ?? null) : (existing?.city ?? null),
      state: input.state !== undefined ? (input.state ?? null) : (existing?.state ?? null),
      pincode: input.pincode !== undefined ? (input.pincode ?? null) : (existing?.pincode ?? null),
      gender: input.gender !== undefined ? (input.gender ?? null) : (existing?.gender ?? null),
      dob: input.dob !== undefined ? (input.dob ?? null) : (existing?.dob ?? null),
      website: input.website !== undefined ? (input.website ?? null) : (existing?.website ?? null),
      linkedin_url: input.linkedin_url !== undefined ? (input.linkedin_url ?? null) : (existing?.linkedin_url ?? null),
      updated_at: db.fn.now(),
    };
  });

  // 3. Robust bulk upsert using ON CONFLICT (id)
  // This handles both inserts (id: undefined) and updates (id: UUID) in one hit.
  await db('contacts')
    .insert(rows)
    .onConflict('id')
    .merge([
      'phone', 'email', 'name', 'language', 'tags', 'source_batch_id', 'custom',
      'opt_out_whatsapp', 'opt_out_email', 'opt_out_call', 'updated_at',
      'company_name', 'designation', 'industry', 'sector', 'sub_sector',
      'address', 'city', 'state', 'pincode', 'gender', 'dob', 'website', 'linkedin_url'
    ]);
}

/**
 * Returns a Knex query builder for the export route to pipe into fast-csv.
 * Caller streams the result — never awaited directly.
 */
export function streamContactsQuery(filter: ContactFilter): NodeJS.ReadableStream {
  let query = db('contacts').select([
    'id', 'phone', 'email', 'name', 'language',
    'segment', 'tags', 'opt_out_whatsapp', 'opt_out_email', 'opt_out_call',
    'company_name', 'designation', 'industry', 'sector', 'sub_sector',
    'address', 'city', 'state', 'pincode', 'gender', 'dob', 'website', 'linkedin_url'
  ]);

  if (filter.segment) query = query.where('segment', filter.segment);
  if (filter.language) query = query.where('language', filter.language);
  if (filter.opt_out_whatsapp !== undefined) query = query.where('opt_out_whatsapp', filter.opt_out_whatsapp);
  if (filter.opt_out_email !== undefined) query = query.where('opt_out_email', filter.opt_out_email);
  if (filter.tags && filter.tags.length > 0) query = query.whereRaw('tags @> ?::text[]', [filter.tags]);

  return query.stream(); // Returns a Node.js readable stream
}

/**
 * Delete all contacts in a specific segment.
 */
export async function deleteContactsBySegment(segment: string): Promise<number> {
  return db('contacts').where({ segment }).delete();
}

/**
 * Delete all contacts from a specific source batch (upload job).
 */
export async function deleteContactsByBatch(batchId: string): Promise<number> {
  return db('contacts').where({ source_batch_id: batchId }).delete();
}

/**
 * Record campaign usage for a batch of contacts.
 */
export async function recordCampaignUsage(
  contactIds: string[],
  details: { campaign_name: string; campaign_type: string; platform?: string }
): Promise<void> {
  if (contactIds.length === 0) return;

  const rows = contactIds.map((id) => ({
    contact_id: id,
    campaign_name: details.campaign_name,
    campaign_type: details.campaign_type,
    platform: details.platform || null,
    used_at: db.fn.now(),
  }));

  // Batch insert into history
  await db('campaign_history').insert(rows);
}

