/**
 * QueryService — filter, paginate, and return contact records.
 *
 * Rules:
 *   - Pure business logic. No Express imports.
 *   - Enforces page_size cap per platform tier (from config/limits.ts).
 *   - Delegates all SQL to db/queries/contacts.ts.
 *   - Returns plain objects — no HTTP concerns.
 */

import { queryContacts } from '../db/queries/contacts';
import { LIMITS, DEFAULT_PAGE_SIZE } from '../config/limits';
import { ValidationError } from '../types/errors';
import type { FilterPayload, QueryResult, Platform } from '../types/models';

export class QueryService {
  /**
   * Execute a contact query for a given platform.
   *
   * @param payload  - Filter + pagination options from the API caller
   * @param platform - Resolved platform (from API key) — used to enforce page size cap
   */
  async query(payload: FilterPayload, platform: Platform): Promise<QueryResult> {
    const platformLimits = LIMITS[platform];
    if (!platformLimits) {
      throw new ValidationError(`Unknown platform: ${platform}`);
    }

    // Enforce page size cap — callers cannot request more than their tier allows
    const requestedSize = payload.page_size ?? DEFAULT_PAGE_SIZE;
    if (requestedSize < 1) {
      throw new ValidationError('page_size must be at least 1');
    }
    const pageSize = Math.min(requestedSize, platformLimits.maxPageSize);

    const cursor = payload.cursor ?? null;
    const page = payload.page ?? 1;
    const fields = payload.fields ?? [
      'id', 'phone', 'name', 'email', 'segment', 'tags',
      'city', 'state', 'industry', 'company_name', 'designation'
    ];

    const result = await queryContacts(payload.filters, pageSize, cursor, fields, page);

    return {
      data: result.rows,
      next_cursor: result.nextCursor,
      total_count: result.totalCount,
      total_pages: result.totalPages,
      current_page: result.currentPage,
      page_size: result.pageSize,
    };
  }
}

export const queryService = new QueryService();
