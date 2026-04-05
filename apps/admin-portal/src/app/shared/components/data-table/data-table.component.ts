/**
 * DataTableComponent — CDK virtual-scroll table for contact records.
 *
 * Renders up to 500k rows without lag: only ~15 rows exist in the DOM
 * at any time via cdk-virtual-scroll-viewport (itemSize = 48px row height).
 *
 * FRONTEND.md §8
 */
import {
  Component,
  input,
  output,
  ChangeDetectionStrategy,
} from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import type { ContactRecord } from '@cdp/data-models';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';
import { MaskPipe } from '../../pipes/mask.pipe';

const VISIBLE_COLUMNS: (keyof ContactRecord)[] = [
  'name',
  'phone',
  'city',
  'industry',
  'company_name',
  'segment',
  'tags',
];

@Component({
  selector: 'app-data-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ScrollingModule, FormatNumberPipe, MaskPipe],
  template: `
    <div class="table-container">
      <!-- Header summary -->
      <div class="table-meta">
        <span class="record-count">
          Showing <strong>{{ contacts().length | formatNumber }}</strong>
          @if (total() > 0) {
            of <strong>{{ total() | formatNumber }}</strong> records
          }
        </span>
      </div>

      <!-- Column headers -->
      <div class="table-head">
        @for (col of columns; track col) {
          <span class="col col-{{ col }}">{{ col }}</span>
        }
      </div>

      <!-- Results body -->
      <cdk-virtual-scroll-viewport
        itemSize="48"
        class="table-scroll"
        style="min-height: 400px;"
      >
        @for (c of contacts(); track c.id) {
          <div class="table-row">
            <span class="col col-name" [title]="c['name'] || ''">{{ c['name'] || '—' }}</span>
            <span class="col col-phone">{{ c['phone'] | mask:'phone' }}</span>
            <span class="col col-city">{{ c['city'] || '—' }}</span>
            <span class="col col-industry">{{ c['industry'] || '—' }}</span>
            <span class="col col-company_name" [title]="c['company_name'] || ''">{{ c['company_name'] || '—' }}</span>
            <span class="col col-segment">{{ c['segment'] }}</span>
            <span class="col col-tags">
              @for (tag of c['tags'] ?? []; track tag) {
                <span class="tag-pill">{{ tag }}</span>
              }
            </span>
          </div>
        }
      </cdk-virtual-scroll-viewport>

      @if (contacts().length === 0) {
        <div class="empty-state">No records found for the current filter.</div>
      }

      <!-- Pagination Footer -->
      @if (totalPages() > 1) {
        <div class="pager">
          <button 
            [disabled]="currentPage() === 1" 
            (click)="onPageChange(currentPage() - 1)"
            class="pager-btn"
          >
            &laquo; Previous
          </button>
          
          <span class="page-info">
            Page <strong>{{ currentPage() }}</strong> of <strong>{{ totalPages() }}</strong>
          </span>

          <button 
            [disabled]="currentPage() === totalPages()" 
            (click)="onPageChange(currentPage() + 1)"
            class="pager-btn"
          >
            Next &raquo;
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .table-container { display: flex; flex-direction: column; height: 100%; position: relative; }
    .table-meta { padding: 8px 12px; font-size: 13px; color: #666; border-bottom: 1px solid #e5e7eb; }
    .table-head  { display: flex; padding: 8px 12px; background: #f9fafb; border-bottom: 2px solid #e5e7eb; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: #374151; }
    .table-scroll { flex: 1; height: 600px; }
    .table-row { display: flex; align-items: center; padding: 0 12px; height: 48px; border-bottom: 1px solid #f3f4f6; font-size: 13px; }
    .table-row:hover { background: #f9fafb; }
    .col { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding-right: 8px; }
    .col-name    { flex: 2; }
    .col-phone   { flex: 2; font-family: monospace; }
    .col-email   { flex: 2; }
    .col-segment { flex: 1; }
    .col-tags    { flex: 2; display: flex; flex-wrap: wrap; gap: 4px; }
    .tag-pill    { background: #dbeafe; color: #1d4ed8; padding: 1px 6px; border-radius: 9999px; font-size: 11px; }
    .empty-state { padding: 48px; text-align: center; color: #9ca3af; font-size: 14px; }

    .pager {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 16px;
      padding: 12px;
      background: white;
      border-top: 1px solid #e5e7eb;
      box-shadow: 0 -1px 3px rgba(0,0,0,0.05);
    }
    .pager-btn {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      background: white;
      border-radius: 4px;
      font-size: 13px;
      cursor: pointer;
      color: #374151;
      transition: all 0.2s;
    }
    .pager-btn:hover:not(:disabled) {
      background: #f3f4f6;
      border-color: #9ca3af;
    }
    .pager-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .page-info {
      font-size: 13px;
      color: #4b5563;
    }
  `],
})
export class DataTableComponent {
  contacts = input.required<Partial<ContactRecord>[]>();
  total    = input.required<number>();
  currentPage = input<number>(1);
  totalPages  = input<number>(0);

  pageChange = output<number>();

  readonly columns = VISIBLE_COLUMNS;

  trackById = (_: number, c: Partial<ContactRecord>): string => c.id ?? '';

  onPageChange(page: number): void {
    this.pageChange.emit(page);
  }
}
