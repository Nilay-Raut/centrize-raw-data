/**
 * QueryBuilderComponent — filter form + virtual-scroll results table.
 *
 * State is managed via ContactsStore (signal-based).
 * Results render in DataTableComponent using CDK Virtual Scroll.
 * Heavy table section uses @defer to avoid rendering until data exists.
 *
 * Flow:
 *   User fills filter form → search() → ContactsStore.search(payload)
 *   → POST /api/query → updates store signals → DataTable re-renders
 *   → "Load more" appends next cursor page
 *
 * FRONTEND.md §7 + §8
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { ContactsStore } from '../../core/state/contacts.store';
import { DataTableComponent } from '../../shared/components/data-table/data-table.component';
import { FormatNumberPipe } from '../../shared/pipes/format-number.pipe';
import type { FilterPayload } from '@cdp/data-models';
import { QueryApiService } from '@cdp/api-client';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-query-builder',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DataTableComponent, FormatNumberPipe],
  template: `
    <div class="query-page">
      <h2 class="page-title">Query Builder</h2>

      <!-- Filter form -->
      <div class="filter-card" [formGroup]="filterForm">
        <div class="filter-grid">
          <!-- Segment -->
          <div class="field">
            <label>Segment</label>
            <input type="text" formControlName="segment" placeholder="e.g. premium-users" />
          </div>

          <!-- Professional -->
          <div class="field">
            <label>Company Name</label>
            <input type="text" formControlName="company_name" placeholder="e.g. Acme Corp" />
          </div>

          <div class="field">
            <label>Industry</label>
            <input type="text" formControlName="industry" placeholder="e.g. Healthcare" />
          </div>

          <!-- Location -->
          <div class="field">
            <label>City</label>
            <input type="text" formControlName="city" placeholder="e.g. Mumbai" />
          </div>

          <div class="field">
            <label>State</label>
            <input type="text" formControlName="state" placeholder="e.g. Maharashtra" />
          </div>

          <!-- Tags (ALL match) -->
          <div class="field">
            <label>Tags (all match)</label>
            <input type="text" formControlName="tags" placeholder="vip, hindi, active" />
            <span class="hint">Comma-separated</span>
          </div>

          <!-- Language -->
          <div class="field">
            <label>Language</label>
            <input type="text" formControlName="language" placeholder="e.g. hindi" />
          </div>

          <!-- Opt-outs -->
          <div class="field">
            <label>WhatsApp opt-out</label>
            <select formControlName="opt_out_whatsapp">
              <option value="">Any</option>
              <option value="true">Opted out</option>
              <option value="false">Not opted out</option>
            </select>
          </div>



          <!-- Page size -->
          <div class="field">
            <label>Page size</label>
            <select formControlName="page_size">
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="500">500</option>
              <option value="1000">1 000</option>
            </select>
          </div>
        </div>

        <!-- Campaign targeting -->
        <div class="section-divider"></div>
        <h3 class="section-subtitle">Campaign History Targeting</h3>
        <div class="filter-grid mt-10">
          <div class="field">
            <label>In Campaign</label>
            <input type="text" formControlName="in_campaign" placeholder="Campaign name" />
            <span class="hint">Contacts who WERE in this campaign</span>
          </div>

          <div class="field">
            <label>Not In Campaign</label>
            <input type="text" formControlName="not_in_campaign" placeholder="Campaign name" />
            <span class="hint">Contacts who were NOT in this campaign</span>
          </div>

          <div class="field">
            <label>Quiet Period (Used Before)</label>
            <input type="date" formControlName="last_used_before" />
            <span class="hint">Exclude contacts used ON or AFTER this date</span>
          </div>
        </div>

        <div class="filter-actions">
          <button class="btn-ghost" type="button" (click)="reset()">Clear</button>
          
          @if (filterForm.get('segment')?.value && store.hasSearched()) {
            <button class="btn-delete-link" type="button" (click)="confirmDeleteSegment()">
              Delete Segment
            </button>
          }

          <button class="btn-primary" type="button" [disabled]="store.loading()" (click)="search()">
            {{ store.loading() ? 'Searching…' : 'Search' }}
          </button>
        </div>

      </div>

      <!-- Export link -->
      @if (store.total() > 0) {
        <div class="export-bar">
          <span>
            Found <strong>{{ store.total() | formatNumber }}</strong> contacts
          </span>
          <button class="btn-outline-sm" type="button" (click)="downloadExport()">
            ⬇ Export CSV
          </button>
        </div>
      }

      <!-- Results — deferred until a search has been performed -->
      @defer (when store.hasSearched()) {
        <div class="results-section">
          <app-data-table
            [contacts]="store.contacts()"
            [total]="store.total()"
            [currentPage]="store.currentPage()"
            [totalPages]="store.totalPages()"
            (pageChange)="onPageChange($event)"
          />
        </div>
      } @placeholder {
        @if (!store.loading()) {
          <div class="empty-state">
            <p>No results yet. Fill in a filter above and click <strong>Search</strong>.</p>
          </div>
        }
      } @loading (minimum 200ms) {
        <div class="skeleton-wrap">
          @for (i of skeletonRows; track i) {
            <div class="skeleton-row"></div>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .query-page { max-width: 1200px; margin: 0 auto; padding: 32px 16px; }
    .page-title { margin-bottom: 20px; } /* font/color from global styles.scss */

    /* Filter card */
    .filter-card  { background: #fff; border-radius: 12px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,.08); margin-bottom: 16px; }
    .filter-grid  { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; margin-bottom: 20px; }
    .field        { display: flex; flex-direction: column; gap: 5px; }
    label         { font-size: 12px; font-weight: 600; color: #374151; text-transform: uppercase; letter-spacing: .04em; }
    input, select { padding: 8px 10px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; outline: none; }
    input:focus, select:focus { border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99,102,241,.1); }
    .hint         { font-size: 11px; color: #9ca3af; }
    .filter-actions { display: flex; justify-content: flex-end; align-items: center; gap: 12px; }
    .btn-delete-link {
      background: none;
      border: none;
      color: #ef4444;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      padding: 8px 12px;
      border-radius: 8px;
      transition: background 0.2s;
    }
    .btn-delete-link:hover {
      background: #fef2f2;
      text-decoration: underline;
    }


    /* Export bar */
    .export-bar   { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; margin-bottom: 16px; font-size: 13px; color: #166534; }

    /* Results */
    .results-section { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .load-more-wrap  { padding: 16px; text-align: center; border-top: 1px solid #f3f4f6; }
    .empty-state     { padding: 60px; text-align: center; color: #9ca3af; font-size: 14px; }

    /* Layout helpers */
    .section-divider { height: 1px; background: #f3f4f6; margin: 32px 0 24px; }
    .section-subtitle { font-size: 14px; font-weight: 700; color: #111827; margin: 0; }
    .mt-10 { margin-top: 16px; }

    .skeleton-wrap { background: #fff; border-radius: 12px; overflow: hidden; padding: 12px; }
    .skeleton-row  { height: 48px; background: #f3f4f6; border-radius: 6px; margin-bottom: 6px; animation: pulse 1.5s infinite; }
    @keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: .5 } }

  `],
})
export class QueryBuilderComponent {
  private fb      = inject(FormBuilder);
  private api     = inject(QueryApiService);
  private auth    = inject(AuthService);
  readonly store  = inject(ContactsStore);


  readonly skeletonRows = Array.from({ length: 8 }, (_, i) => i);

  filterForm = this.fb.group({
    segment:          [''],
    company_name:     [''],
    industry:         [''],
    city:             [''],
    state:            [''],
    tags:             [''],
    tags_any:         [''],
    language:         [''],
    opt_out_whatsapp: ['' as '' | 'true' | 'false'],
    opt_out_email:    ['' as '' | 'true' | 'false'],
    in_campaign:      [''],
    not_in_campaign:  [''],
    last_used_before: [''],
    page_size:        [100],
  });

  /** Build the raw search params for the export URL — plain method, not computed(), because
   *  filterForm.value is a reactive form value (not a signal) and computed() won't re-run on form changes. */
  exportParams(): URLSearchParams {
    const v = this.filterForm.value;
    const params = new URLSearchParams();
    if (v.segment)                       params.set('segment', v.segment);
    if (v.company_name)                  params.set('company_name', v.company_name);
    if (v.industry)                      params.set('industry', v.industry);
    if (v.city)                          params.set('city', v.city);
    if (v.state)                         params.set('state', v.state);
    if (v.tags)                          params.set('tags', v.tags);
    if (v.language)                      params.set('language', v.language);
    if (v.opt_out_whatsapp === 'false')  params.set('opt_out_whatsapp', 'false');
    if (v.opt_out_email === 'true')      params.set('opt_out_email', 'true');
    if (v.opt_out_email === 'false')     params.set('opt_out_email', 'false');
    if (v.in_campaign)                   params.set('in_campaign', v.in_campaign);
    if (v.not_in_campaign)               params.set('not_in_campaign', v.not_in_campaign);
    if (v.last_used_before)              params.set('last_used_before', v.last_used_before);
    return params;
  }

  downloadExport(): void {
    // Ensure an API key is stored for this session before attempting the export.
    // The key controls what the user can access: Full Access keys can export,
    // Masked Access keys are blocked by the server with a clear 403.
    if (!this.auth.getApiKey()) {
      const key = window.prompt(
        'Enter your API key to export.\n\nFull Access key → downloads raw CSV\nMasked Access key → will be rejected by the server',
      );
      if (!key?.trim()) return; // User cancelled
      this.auth.setApiKey(key.trim());
    }

    const params = this.exportParams();
    this.api.getExportBlob(params).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
        const segment = (this.filterForm.get('segment')?.value as string) || 'all';
        a.href = url;
        a.download = `export-${segment}-${timestamp}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      },
      error: (err: { status: number }) => {
        if (err.status === 403) {
          alert('This API key does not have raw data export access.\nUse a Full Access key.');
          // Clear the stored key so the user is prompted again next time
          this.auth.setApiKey('');
        } else if (err.status === 401) {
          // Invalid key — clear and let the user try again next click
          this.auth.setApiKey('');
        }
        // 5xx and other errors are handled globally by errorInterceptor (shows toast)
      },
    });
  }

  search(): void {
    const v = this.filterForm.value;
    const payload: FilterPayload = {
      filters: {
        segment:          v.segment || undefined,
        company_name:     v.company_name || undefined,
        industry:         v.industry || undefined,
        city:             v.city || undefined,
        state:            v.state || undefined,
        tags:             v.tags     ? v.tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        tags_any:         v.tags_any ? v.tags_any.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        opt_out_whatsapp: v.opt_out_whatsapp === '' ? undefined : v.opt_out_whatsapp === 'true',
        opt_out_email:    v.opt_out_email    === '' ? undefined : v.opt_out_email    === 'true',
        language:         v.language || undefined,
        in_campaign:      v.in_campaign || undefined,
        not_in_campaign:  v.not_in_campaign || undefined,
        last_used_before: v.last_used_before || undefined,
      },
      page_size: v.page_size ?? 100,
      page: 1, // Always start at page 1 on new search
    };
    this.store.search(payload);
  }

  onPageChange(page: number): void {
    this.store.goToPage(page);
  }

  reset(): void {
    this.filterForm.reset({
      segment: '', company_name: '', industry: '', city: '', state: '',
      tags: '', tags_any: '', language: '',
      opt_out_whatsapp: '', opt_out_email: '',
      in_campaign: '', not_in_campaign: '', last_used_before: '',
      page_size: 100,
    });
    this.store.reset();
  }

  confirmDeleteSegment(): void {
    const segment = this.filterForm.get('segment')?.value;
    if (!segment) return;

    const total = this.store.total();
    const msg = `Are you sure you want to delete the segment "${segment}" and ALL ${total} contacts it contains?\n\nThis action CANNOT be undone.`;

    if (window.confirm(msg)) {
      this.api.deleteSegment(segment).subscribe({
        next: (res: { success: boolean; message: string }) => {
          console.log('Segment deleted:', res);
          alert(res.message);
          this.reset();
        },
        error: (err: Error) => {
          console.error('Delete failed:', err);
          alert('Failed to delete segment. Make sure you have admin permissions.');
        }
      });
    }

  }
}

