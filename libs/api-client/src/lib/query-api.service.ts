/**
 * QueryApiService — typed HTTP wrapper for the CDP backend.
 *
 * All Angular features use this service. Never call HttpClient directly in components.
 *
 * Base URL:
 *   Injected via API_BASE_URL token (set in app.config.ts from environment.ts).
 *   To change the backend URL, update environment.ts — no service code changes needed.
 *
 * Auth:
 *   JWT Bearer token is attached automatically by AuthInterceptor for every request.
 *   Never pass auth headers manually here — the interceptor handles it globally.
 */

import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type {
  FilterPayload,
  QueryResult,
  UploadJob,
  IngestResponse,
  ApiKey,
} from '@cdp/data-models';
import { API_BASE_URL } from './api.config';

@Injectable({ providedIn: 'root' })
export class QueryApiService {
  private http = inject(HttpClient);
  private base = inject(API_BASE_URL);

  /** POST /api/query — filter contacts with cursor-based pagination */
  query(payload: FilterPayload, baseUrl?: string, apiKey?: string, isPublic = false): Observable<QueryResult> {
    const endpoint = isPublic ? '/api/public/query' : '/api/query';
    const url = `${baseUrl ?? this.base}${endpoint}`;
    const headers: Record<string, string> = {};
    if (apiKey) {
      headers['X-Api-Key'] = apiKey;
    }
    return this.http.post<QueryResult>(url, payload, { headers });
  }

  /** GET /api/status/:jobId — poll a single upload job's progress */
  getJobStatus(jobId: string): Observable<UploadJob> {
    return this.http.get<UploadJob>(`${this.base}/api/status/${jobId}`);
  }

  /** GET /api/jobs — list recent upload jobs */
  listJobs(): Observable<UploadJob[]> {
    return this.http.get<UploadJob[]>(`${this.base}/api/jobs`);
  }

  /** POST /api/ingest — upload a CSV/XLSX file as multipart/form-data */
  ingest(formData: FormData): Observable<IngestResponse> {
    return this.http.post<IngestResponse>(`${this.base}/api/ingest`, formData);
  }

  /** GET /api/keys — list platform API keys (admin only) */
  listApiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${this.base}/api/keys`);
  }

  /** DELETE /api/keys/:id — deactivate a platform API key (admin only) */
  deactivateApiKey(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/api/keys/${id}`);
  }

  /** DELETE /api/delete/segment/:segment — delete all contacts in a segment (admin only) */
  deleteSegment(segment: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.base}/api/delete/segment/${segment}`);
  }

  /** DELETE /api/delete/job/:jobId — delete a job and its contacts (admin only) */
  deleteJobData(jobId: string): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.base}/api/delete/job/${jobId}`);
  }
  
  /** GET /api/export — download a CSV of filtered contacts */
  getExportBlob(params: URLSearchParams): Observable<Blob> {
    return this.http.get(`${this.base}/api/export?${params.toString()}`, {
      responseType: 'blob'
    });
  }

  /** GET /api/insights — admin analytics dashboard data (JWT-only) */
  getInsights(): Observable<InsightsData> {
    return this.http.get<InsightsData>(`${this.base}/api/insights`);
  }
}

// ─── Insights types (admin dashboard) ────────────────────────────────────────

export interface DistributionRow {
  label: string;
  count: number;
}

export interface InsightsData {
  totalContacts: number;
  optOutWhatsapp: number;
  optOutEmail: number;
  optOutCall: number;
  segmentDistribution: DistributionRow[];
  languageDistribution: DistributionRow[];
  genderDistribution: DistributionRow[];
  topStates: DistributionRow[];
  topCities: DistributionRow[];
  topIndustries: DistributionRow[];
  topSectors: DistributionRow[];
  topCompanies: DistributionRow[];
  completeness: Record<string, number>;
  taggedCount: number;
  untaggedCount: number;
  jobStats: {
    total: number;
    done: number;
    processing: number;
    queued: number;
    failed: number;
    totalRows: number;
    processedRows: number;
    failedRows: number;
  };
  uploadActivity: { date: string; jobs: number; rows: number }[];
}

