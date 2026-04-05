/**
 * NormaliserService — transforms raw CSV rows into clean ContactRecord inputs.
 *
 * Responsibilities:
 *   1. Apply field mapping (CSV column → standard field)
 *   2. Normalise phone numbers to E.164 format
 *   3. Parse tags from comma/semicolon/pipe-delimited strings
 *   4. Parse opt_out booleans from yes/no/true/false strings
 *   5. Collect unmapped columns into the `custom` JSONB field
 *
 * Rules:
 *   - Pure functions — no DB calls, no HTTP, no side effects.
 *   - Every input phone must come out E.164 or be rejected (logged as failed_row).
 *   - Default country code is India (+91). Override by passing countryCode param.
 */

import type { StandardField } from '../types/models';
import type { UpsertContactInput } from '../db/queries/contacts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface NormaliseResult {
  contact: UpsertContactInput | null; // null = row should be skipped (invalid phone)
  error?: string;
}

// ─── Phone Normalisation ──────────────────────────────────────────────────────

const STRIP_NON_DIGITS = /\D/g;
const VALID_E164 = /^\+\d{7,15}$/;

/**
 * Normalise a phone number to E.164 format.
 * Defaults to +91 (India) prefix when no country code is present.
 *
 * Returns null if the number cannot be normalised (e.g. too short, empty).
 */
export function normalisePhone(raw: string, defaultCountryCode = '91'): string | null {
  if (!raw || raw.trim() === '') return null;

  // Strip everything except digits and leading +
  const cleaned = raw.trim().replace(/^\+/, 'PLUS').replace(STRIP_NON_DIGITS, '');
  const hadPlus = raw.trim().startsWith('+');
  const digits = hadPlus ? cleaned.replace('PLUS', '') : cleaned;

  if (digits.length < 7) return null; // Too short to be a real number

  // Already has full country code (starts with + in original)
  if (hadPlus) {
    const e164 = `+${digits}`;
    return VALID_E164.test(e164) ? e164 : null;
  }

  // Indian number with leading 0: 09876543210 → 9876543210
  const stripped = digits.startsWith('0') ? digits.slice(1) : digits;

  // If already prefixed with country code (91XXXXXXXXXX = 12 digits for India)
  if (defaultCountryCode === '91' && stripped.startsWith('91') && stripped.length === 12) {
    return `+${stripped}`;
  }

  // 10-digit local number — prepend country code
  if (stripped.length === 10) {
    return `+${defaultCountryCode}${stripped}`;
  }

  // Fallback — prepend + and hope it's a valid international number
  const e164 = `+${stripped}`;
  return VALID_E164.test(e164) ? e164 : null;
}

// ─── Tag Parsing ──────────────────────────────────────────────────────────────

const TAG_DELIMITERS = /[;,|]/;

export function parseTags(raw: string): string[] {
  if (!raw || raw.trim() === '') return [];
  return raw
    .split(TAG_DELIMITERS)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

// ─── Boolean Parsing ──────────────────────────────────────────────────────────

const TRUTHY = new Set(['true', 'yes', '1', 'y', 'on']);
const FALSY = new Set(['false', 'no', '0', 'n', 'off', '']);

export function parseBoolean(raw: string): boolean | undefined {
  const lower = raw.trim().toLowerCase();
  if (TRUTHY.has(lower)) return true;
  if (FALSY.has(lower)) return false;
  return undefined; // Unknown value — caller decides
}

// ─── Row Normalisation ────────────────────────────────────────────────────────

/**
 * Normalise a single CSV row into a contact upsert input.
 *
 * @param row         - Raw CSV row as key/value object
 * @param fieldMapping - Maps CSV column headers to standard field names
 * @param segment     - Segment name for this upload batch
 * @param batchId     - Upload job ID
 */
export function normaliseRow(
  row: Record<string, string>,
  fieldMapping: Record<string, StandardField>,
  segment: string,
  batchId: string,
): NormaliseResult {
  const contact: Partial<UpsertContactInput> & { custom: Record<string, unknown> } = {
    segment,
    source_batch_id: batchId,
    custom: {},
  };

  for (const [csvColumn, rawValue] of Object.entries(row)) {
    const standardField = fieldMapping[csvColumn];

    if (!standardField || standardField === 'skip') {
      // Unmapped column → goes into custom JSONB
      contact.custom[csvColumn] = rawValue;
      continue;
    }

    const value = rawValue?.trim() ?? '';

    switch (standardField) {
      case 'phone':
        contact.phone = value;
        break;
      case 'email':
        if (value && !['n/a', 'null', 'none', '-'].includes(value.toLowerCase())) {
          contact.email = value;
        }
        break;
      case 'name':
        if (value) contact.name = value;
        break;
      case 'language':
        contact.language = value || 'en';
        break;
      case 'tags':
        contact.tags = parseTags(value);
        break;
      case 'opt_out_whatsapp':
        contact.opt_out_whatsapp = parseBoolean(value) ?? false;
        break;
      case 'opt_out_email':
        contact.opt_out_email = parseBoolean(value) ?? false;
        break;
      case 'company_name':
        if (value) contact.company_name = value;
        break;
      case 'designation':
        if (value) contact.designation = value;
        break;
      case 'industry':
        if (value) contact.industry = value;
        break;
      case 'sector':
        if (value) contact.sector = value;
        break;
      case 'sub_sector':
        if (value) contact.sub_sector = value;
        break;
      case 'address':
        if (value) contact.address = value;
        break;
      case 'city':
        if (value) contact.city = value;
        break;
      case 'state':
        if (value) contact.state = value;
        break;
      case 'pincode':
        if (value) contact.pincode = value;
        break;
      case 'gender':
        if (value) contact.gender = value;
        break;
      case 'dob':
        if (value) contact.dob = value;
        break;
      case 'website':
        if (value) contact.website = value;
        break;
      case 'linkedin_url':
        if (value) contact.linkedin_url = value;
        break;
    }
  }

  // Phone is mandatory
  if (!contact.phone) {
    return { contact: null, error: 'Missing phone number' };
  }

  const normalisedPhone = normalisePhone(contact.phone);
  if (!normalisedPhone) {
    return { contact: null, error: `Invalid phone number: ${contact.phone}` };
  }

  return {
    contact: {
      ...(contact as UpsertContactInput),
      phone: normalisedPhone,
    },
  };
}

export class NormaliserService {
  normalisePhone = normalisePhone;
  parseTags = parseTags;
  parseBoolean = parseBoolean;
  normaliseRow = normaliseRow;
}

export const normaliserService = new NormaliserService();
