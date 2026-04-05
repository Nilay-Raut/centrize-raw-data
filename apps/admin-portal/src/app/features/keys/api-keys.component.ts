/**
 * ApiKeysComponent — platform API key management.
 *
 * Displays a list of all API keys (name, prefix, platform, status, last used).
 * Admin can deactivate a key. Creating new keys is done via the CLI script
 * (`scripts/generateApiKey.ts`) — not in the UI, to keep raw keys off HTTP
 * transport entirely.
 *
 * FRONTEND.md §4 (keys route) · HOW_TO_USE.md §11
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  OnInit,
} from '@angular/core';
import type { ApiKey, Platform } from '@cdp/data-models';
import { QueryApiService } from '@cdp/api-client';
import { ToastService } from '../../core/toast/toast.service';

const PLATFORM_LABELS: Record<Platform, string> = {
  whatsapp:   'WhatsApp',
  email:      'Email',
  admin:      'Admin',
  csv_export: 'CSV Export',
};

@Component({
  selector: 'app-api-keys',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="keys-page">
      <div class="page-header">
        <h2 class="page-title">API Keys</h2>
        <button class="btn-outline" (click)="loadKeys()" [disabled]="loading()">
          {{ loading() ? 'Refreshing…' : '↺ Refresh' }}
        </button>
      </div>

      <div class="info-banner">
        💡 New API keys are generated via the CLI script. Raw keys are shown exactly once — they are never stored.
        See <code>scripts/generateApiKey.ts</code>.
      </div>

      @if (loading() && keys().length === 0) {
        <div class="loading-state">Loading keys…</div>
      }

      @if (!loading() && keys().length === 0) {
        <div class="empty-state">
          <p>No API keys found.</p>
          <p>Run <code>npm run generate:key</code> to create the first key.</p>
        </div>
      }

      @if (keys().length > 0) {
        <div class="keys-table">
          <div class="table-head">
            <span class="col-name">Name</span>
            <span class="col-prefix">Prefix</span>
            <span class="col-platform">Platform</span>
            <span class="col-status">Status</span>
            <span class="col-last-used">Last used</span>
            <span class="col-created">Created</span>
            <span class="col-actions"></span>
          </div>

          @for (key of keys(); track key.id) {
            <div class="table-row" [class.inactive]="!key.active">
              <span class="col-name" [title]="key.name">{{ key.name }}</span>
              <span class="col-prefix">
                <code>cdp_{{ key.key_prefix }}…</code>
              </span>
              <span class="col-platform">
                <span class="platform-badge platform-{{ key.platform }}">
                  {{ platformLabel(key.platform) }}
                </span>
              </span>
              <span class="col-status">
                <span class="status-badge" [class.active-badge]="key.active" [class.inactive-badge]="!key.active">
                  {{ key.active ? 'Active' : 'Inactive' }}
                </span>
              </span>
              <span class="col-last-used">{{ formatDate(key.last_used_at) }}</span>
              <span class="col-created">{{ formatDate(key.created_at) }}</span>
              <span class="col-actions">
                @if (key.active) {
                  <button
                    class="btn-danger-sm"
                    [disabled]="deactivating() === key.id"
                    (click)="confirmDeactivate(key)"
                  >
                    {{ deactivating() === key.id ? '…' : 'Deactivate' }}
                  </button>
                }
              </span>
            </div>
          }
        </div>
      }

      <!-- Confirm modal -->
      @if (confirmKey()) {
        <div class="modal-overlay" (click)="confirmKey.set(null)">
          <div class="modal" (click)="$event.stopPropagation()">
            <h3>Deactivate key?</h3>
            <p>
              Key <strong>cdp_{{ confirmKey()?.key_prefix }}…</strong>
              ("{{ confirmKey()?.name }}") will stop working immediately.
              This cannot be undone — you will need to generate a new key.
            </p>
            <div class="modal-actions">
              <button class="btn-ghost" (click)="confirmKey.set(null)">Cancel</button>
              <button class="btn-danger" (click)="deactivate()">Yes, deactivate</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .keys-page   { max-width: 1000px; margin: 0 auto; padding: 32px 16px; }
    /* .page-title, .page-header — from global styles.scss */
    .page-header { margin-bottom: 16px; } /* layout from global; spacing override here */
    .info-banner { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 10px 16px; border-radius: 8px; font-size: 13px; margin-bottom: 20px; }
    code         { background: #e0e7ff; padding: 1px 5px; border-radius: 4px; font-size: 12px; }
    .loading-state, .empty-state { padding: 48px; text-align: center; color: #9ca3af; font-size: 14px; background: #fff; border-radius: 12px; }
    .keys-table  { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .table-head, .table-row { display: grid; grid-template-columns: 2fr 1.4fr 1fr .8fr 1.2fr 1.2fr .8fr; padding: 10px 16px; align-items: center; gap: 8px; }
    .table-head  { background: #f9fafb; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e5e7eb; }
    .table-row   { font-size: 13px; border-bottom: 1px solid #f3f4f6; }
    .table-row:last-child { border-bottom: none; }
    .table-row.inactive { opacity: .55; }
    .col-name    { font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-last-used, .col-created { font-size: 12px; color: #9ca3af; }

    /* Platform badges */
    .platform-badge { padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .platform-whatsapp  { background: #dcfce7; color: #166534; }
    .platform-email     { background: #dbeafe; color: #1d4ed8; }
    .platform-admin     { background: #f3e8ff; color: #6b21a8; }
    .platform-csv_export { background: #fef3c7; color: #92400e; }

    /* Status badges */
    .status-badge     { padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; }
    .active-badge   { background: #dcfce7; color: #166534; }
    .inactive-badge { background: #f3f4f6; color: #6b7280; }

    /* .btn-outline, .btn-ghost, .btn-danger, .btn-danger-sm — from global styles.scss */

    /* Modal */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,.4); display: flex; align-items: center; justify-content: center; z-index: 50; }
    .modal         { background: #fff; border-radius: 12px; padding: 28px; max-width: 420px; width: 90%; }
    .modal h3      { margin: 0 0 10px; font-size: 16px; font-weight: 700; }
    .modal p       { font-size: 14px; color: #374151; margin: 0 0 20px; }
    .modal-actions { display: flex; justify-content: flex-end; gap: 10px; }
  `],
})
export class ApiKeysComponent implements OnInit {
  private api   = inject(QueryApiService);
  private toast = inject(ToastService);

  keys        = signal<ApiKey[]>([]);
  loading     = signal(false);
  confirmKey  = signal<ApiKey | null>(null);
  deactivating = signal<string | null>(null);

  readonly platformLabel = (p: Platform): string => PLATFORM_LABELS[p] ?? p;

  ngOnInit(): void {
    this.loadKeys();
  }

  loadKeys(): void {
    this.loading.set(true);
    this.api.listApiKeys().subscribe({
      next: (keys) => { this.keys.set(keys); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  confirmDeactivate(key: ApiKey): void {
    this.confirmKey.set(key);
  }

  deactivate(): void {
    const key = this.confirmKey();
    if (!key) return;
    this.deactivating.set(key.id);
    this.confirmKey.set(null);

    this.api.deactivateApiKey(key.id).subscribe({
      next: () => {
        this.keys.update((ks) =>
          ks.map((k) => k.id === key.id ? { ...k, active: false } : k),
        );
        this.deactivating.set(null);
        this.toast.success(`Key "${key.name}" deactivated.`);
      },
      error: () => {
        this.deactivating.set(null);
        this.toast.error('Failed to deactivate key. Please try again.');
      },
    });
  }

  formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: '2-digit',
    });
  }
}
