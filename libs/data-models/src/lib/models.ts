/**
 * Shared TypeScript interfaces — used by both admin-portal and embed-widget.
 * These mirror the backend types in src/types/models.ts.
 * Import from '@cdp/data-models' everywhere — never declare duplicates.
 */

export interface ContactRecord {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  language: string;
  tags: string[];
  segment: string;
  source_batch_id?: string;
  
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

  custom: Record<string, unknown>;
  opt_out_whatsapp: boolean;
  opt_out_email: boolean;
  opt_out_call: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContactFilter {
  segment?: string;
  tags?: string[];
  tags_any?: string[];
  opt_out_whatsapp?: boolean;
  opt_out_email?: boolean;
  opt_out_call?: boolean;
  language?: string;

  // Search fields
  city?: string;
  state?: string;
  industry?: string;
  sector?: string;
  company_name?: string;

  // History-based filters
  last_used_before?: string;   // ISO date string
  in_campaign?: string;        // Campaign name
  not_in_campaign?: string;    // Campaign name
}

export interface FilterPayload {
  filters: ContactFilter;
  page_size: number;
  cursor?: string;
  page?: number;            // 1-indexed page
  fields?: Array<keyof ContactRecord>;
}

export interface QueryResult {
  data: Partial<ContactRecord>[];
  next_cursor: string | null;
  total_count: number;
  page_size: number;
  current_page?: number;
  total_pages?: number;
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

export interface UploadJob {
  id: string;
  filename: string;
  status: JobStatus;
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  segment: string;
  created_at: string;
}

export type Platform = 'whatsapp' | 'email' | 'admin' | 'csv_export';

export type StandardField =
  | 'phone'
  | 'email'
  | 'name'
  | 'language'
  | 'tags'
  | 'opt_out_whatsapp'
  | 'opt_out_email'
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
  | 'source_batch_id'
  | 'skip';

export interface ApiKey {
  id: string;
  name: string;
  key_prefix: string;
  platform: Platform;
  active: boolean;
  last_used_at?: string;
  created_at: string;
}

export interface IngestResponse {
  job_id: string;
  message: string;
}
