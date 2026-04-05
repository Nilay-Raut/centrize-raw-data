/**
 * ContactsStore — signal-based shared state for query results.
 * Used by QueryBuilderComponent and ResultsTableComponent.
 * No NgRx needed — Angular Signals handle this cleanly.
 */

import { Injectable, signal, computed, inject } from '@angular/core';
import { QueryApiService } from '@cdp/api-client';
import type { ContactRecord, FilterPayload } from '@cdp/data-models';

@Injectable({ providedIn: 'root' })
export class ContactsStore {
  private queryApi = inject(QueryApiService);

  // ── Private writable state ─────────────────────────────────────────────────
  private _contacts = signal<ContactRecord[]>([]);
  private _loading   = signal(false);
  private _cursor    = signal<string | null>(null);
  private _totalCount = signal(0);
  private _currentPage = signal(1);
  private _totalPages  = signal(0);
  private _filter    = signal<FilterPayload | null>(null);
  private _hasSearched = signal(false);

  // ── Public read-only projections ───────────────────────────────────────────
  readonly contacts = this._contacts.asReadonly();
  readonly loading  = this._loading.asReadonly();
  readonly total    = this._totalCount.asReadonly();
  readonly currentPage = this._currentPage.asReadonly();
  readonly totalPages  = this._totalPages.asReadonly();
  readonly hasSearched = this._hasSearched.asReadonly();
  readonly hasMore  = computed(() => this._cursor() !== null);
  readonly isEmpty  = computed(() => !this._loading() && this._contacts().length === 0);

  search(filter: FilterPayload): void {
    this._filter.set(filter);
    this._currentPage.set(filter.page ?? 1);
    this._cursor.set(null);
    this._hasSearched.set(true);
    this._loadPage(true); // true = replace results
  }

  goToPage(page: number): void {
    if (page < 1 || (this._totalPages() > 0 && page > this._totalPages())) return;
    this._currentPage.set(page);
    this._loadPage(true);
  }

  loadNextPage(): void {
    if (!this.hasMore() || this._loading()) return;
    this._loadPage(false); // false = append for infinite scroll
  }

  reset(): void {
    this._contacts.set([]);
    this._cursor.set(null);
    this._totalCount.set(0);
    this._filter.set(null);
    this._hasSearched.set(false);
    this._currentPage.set(1);
    this._totalPages.set(0);
  }

  private _loadPage(replace: boolean = false): void {
    const filter = this._filter();
    if (!filter) return;

    this._loading.set(true);

    const page = this._currentPage();

    this.queryApi
      .query({ 
        ...filter, 
        cursor: replace ? undefined : (this._cursor() ?? undefined),
        page: replace ? page : undefined
      })
      .subscribe({
        next: (result) => {
          if (replace) {
            this._contacts.set(result.data as ContactRecord[]);
          } else {
            this._contacts.update((prev) => [
              ...prev,
              ...(result.data as ContactRecord[]),
            ]);
          }
          this._cursor.set(result.next_cursor);
          this._totalCount.set(result.total_count);
          this._totalPages.set(result.total_pages ?? 0);
          this._currentPage.set(result.current_page ?? page);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }
}
