/**
 * Core domain types for Campaign Data Platform.
 * All API request/response shapes, DB row shapes, and domain objects live here.
 * Import from this file everywhere — never declare duplicate interfaces.
 */

// ─── Contact ──────────────────────────────────────────────────────────────────

export interface ContactRecord {
  id: string;
  phone: string;           // E.164 format: +919876543210
  email?: string;
  name?: string;
  language: string;        // BCP-47 language tag, e.g. "hi", "en"
  tags: string[];          // PostgreSQL text[] — GIN indexed
  segment: string;         // Upload batch identifier
  source_batch_id?: string; // Which upload_job created/last updated this row

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
  dob?: string;            // ISO date string
  website?: string;
  linkedin_url?: string;

  custom: Record<string, unknown>; // JSONB overflow for unmapped columns
  opt_out_whatsapp: boolean;
  opt_out_email: boolean;
  opt_out_call: boolean;
  history?: CampaignUsageRecord[];
  created_at: string;      // ISO 8601
  updated_at: string;      // ISO 8601
}

export interface CampaignUsageRecord {
  id: string;
  campaign_name: string;
  campaign_type: string;
  platform?: string;
  used_at: string;
}

// ─── Query API ────────────────────────────────────────────────────────────────

export interface ContactFilter {
  segment?: string;
  tags?: string[];          // AND — contact must have ALL listed tags
  tags_any?: string[];      // OR  — contact must have at least ONE listed tag
  opt_out_whatsapp?: boolean;
  opt_out_email?: boolean;
  opt_out_call?: boolean;
  language?: string;

  // Selective search fields
  city?: string;
  state?: string;
  industry?: string;
  sector?: string;
  company_name?: string;

  // History-based filters
  last_used_before?: string;   // ISO date string
  in_campaign?: string;        // Campaign name
  not_in_campaign?: string;    // Campaign name
  used_in_types?: string[];    // e.g. ['whatsapp', 'call']
}

export interface FilterPayload {
  filters: ContactFilter;
  page_size?: number;        // Capped per platform tier — see config/limits.ts
  cursor?: string;          // Opaque base64 cursor from previous response
  page?: number;            // 1-indexed page number (if using offset pagination)
  fields?: Array<keyof ContactRecord>; // Field projection — always request minimum
}

export interface QueryResult {
  data: Partial<ContactRecord>[];
  next_cursor: string | null;
  total_count: number;
  page_size: number;
  current_page?: number;
  total_pages?: number;
}

// ─── Upload & Jobs ───────────────────────────────────────────────────────────

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface UploadJob {
  id: string;
  filename: string;
  status: JobStatus;
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  segment: string;
  error_log?: string;
  created_at: string;
  updated_at: string;
}

// Field mapping: CSV column header → standard field name (or 'skip')
export type StandardField =
  | 'phone'
  | 'email'
  | 'name'
  | 'language'
  | 'tags'
  | 'opt_out_whatsapp'
  | 'opt_out_email'
  | 'opt_out_call'
  | 'company_name'
  | 'designation'
  | 'industry'
  | 'sector'
  | 'sub_sector'
  | 'address'
  | 'city'
  | 'state'
  | 'pincode'
  | 'gender'
  | 'dob'
  | 'website'
  | 'linkedin_url'
  | 'skip';

export interface IngestRequest {
  segment: string;
  field_mapping: Record<string, StandardField>; // { "Mobile No": "phone", "Email ID": "email" }
}

export interface IngestResponse {
  job_id: string;
  message: string;
}

// ─── API Keys ─────────────────────────────────────────────────────────────────

export type Platform = 'whatsapp' | 'email' | 'admin' | 'csv_export' | 'public';

export interface ApiKeyRecord {
  id: string;
  name: string;
  key_hash: string;        // bcrypt hash — never expose
  key_prefix: string;      // First 8 chars of raw key — for lookup
  platform: Platform;
  active: boolean;
  can_view_raw: boolean;
  last_used_at?: string;
  created_at: string;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface AdminUser {
  id: string;
  email: string;
  password_hash: string;
  can_view_raw: boolean;
  created_at: string;
}

export interface JwtPayload {
  sub: string;          // Admin user ID
  email: string;
  canViewRaw: boolean;  // Whether this admin can export raw (unmasked) data
  apiKeyPrefix?: string; // Optional embedded API key context
  apiKeyId?: string;
  apiKeyPlatform?: Platform;
  iat: number;
  exp: number;
}

// ─── HTTP Request Extensions ───────────────────────────────────────────────────
// (Also extended in types/express.d.ts)

export interface ResolvedApiKey {
  platform: Platform;
  keyPrefix: string;
  keyId: string;
  canViewRaw: boolean;
}

// ─── Error Shapes ─────────────────────────────────────────────────────────────

export interface ApiErrorResponse {
  error: string;
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;
}

export interface RateLimitErrorResponse extends ApiErrorResponse {
  platform: Platform;
  limit: number;
  window_seconds: number;
  retry_after: number;
}
