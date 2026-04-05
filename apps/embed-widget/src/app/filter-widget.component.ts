/**
 * FilterWidgetComponent — compiled as a Web Component via @angular/elements.
 *
 * Embed in any platform with:
 *   <script src="https://cdn.yourapp.com/cdp-widget.js"></script>
 *   <cdp-filter-widget api-key="cdp_..." base-url="https://api.yourapp.com"></cdp-filter-widget>
 *
 * Listen for the 'dataSelected' event to receive the user's filter + contact count.
 *
 * Implement per FRONTEND.md §9.
 */
import { Component, Input, Output, EventEmitter, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { QueryApiService } from '@cdp/api-client';
import type { FilterPayload, QueryResult } from '@cdp/data-models';

@Component({
  selector: 'cdp-filter-widget',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="cdp-widget">
      <div class="cdp-header">
        <svg class="cdp-logo" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
          <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
          <line x1="12" y1="22.08" x2="12" y2="12"></line>
        </svg>
        <h2 class="cdp-title">CDP Filter</h2>
      </div>

      <div class="cdp-form">
        <div class="cdp-input-group">
          <label>Segment</label>
          <input #segInput [value]="form().segment" (input)="updateField('segment', segInput.value)" placeholder="Enter segment name..." />
        </div>

        <div class="cdp-input-group">
          <label>Tags (All)</label>
          <input #tagsInput [value]="form().tags" (input)="updateField('tags', tagsInput.value)" placeholder="tag1, tag2..." />
        </div>

        <div class="cdp-input-group">
          <label>Tags (Any)</label>
          <input #tagsAnyInput [value]="form().tagsAny" (input)="updateField('tagsAny', tagsAnyInput.value)" placeholder="tagA, tagB..." />
        </div>

        <div class="cdp-input-group">
          <label>Language</label>
          <select #langInput [value]="form().language" (change)="updateField('language', langInput.value)">
            <option value="">Any Language</option>
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="mr">Marathi</option>
            <option value="gu">Gujarati</option>
          </select>
        </div>

        <div class="cdp-switches">
          <label class="cdp-switch">
            <input type="checkbox" [checked]="form().optOutWhatsapp" (change)="updateField('optOutWhatsapp', $any($event.target).checked)" />
            <span class="cdp-slider"></span>
            <span class="cdp-label">WhatsApp Opt-out</span>
          </label>
          <label class="cdp-switch">
            <input type="checkbox" [checked]="form().optOutEmail" (change)="updateField('optOutEmail', $any($event.target).checked)" />
            <span class="cdp-slider"></span>
            <span class="cdp-label">Email Opt-out</span>
          </label>
        </div>

        <div class="cdp-actions">
          <button class="cdp-btn-secondary" (click)="reset()" [disabled]="loading()">Reset</button>
          <button class="cdp-btn-primary" (click)="search()" [disabled]="loading()">
            @if (loading()) {
              <span class="cdp-spinner"></span>
            } @else {
              Preview
            }
          </button>
        </div>
      </div>

      @if (previewCount() > 0) {
        <div class="cdp-summary slide-up">
          <div class="cdp-count-info">
            <span class="cdp-count">{{ previewCount().toLocaleString() }}</span>
            <span class="cdp-count-label">contacts match</span>
          </div>
          <button class="cdp-btn-success" (click)="useData()">Use this data</button>
        </div>
      }

      @if (errorMsg()) {
        <div class="cdp-error fade-in">{{ errorMsg() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      --cdp-primary: #00b8d4;
      --cdp-primary-hover: #0097a7;
      --cdp-bg: rgba(255, 255, 255, 0.8);
      --cdp-glass-bg: rgba(255, 255, 255, 0.1);
      --cdp-glass-border: rgba(255, 255, 255, 0.2);
      --cdp-text: #1a1a1a;
      --cdp-text-muted: #666;
      --cdp-error: #ff5252;
      --cdp-success: #4caf50;
      display: block;
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      max-width: 400px;
      color: var(--cdp-text);
    }

    .cdp-widget {
      background: var(--cdp-bg);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--cdp-glass-border);
      border-radius: 16px;
      padding: 24px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
      overflow: hidden;
    }

    .cdp-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 24px;
    }

    .cdp-logo {
      width: 24px;
      height: 24px;
      color: var(--cdp-primary);
    }

    .cdp-title {
      font-size: 18px;
      font-weight: 600;
      margin: 0;
    }

    .cdp-form {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cdp-input-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .cdp-input-group label {
      font-size: 12px;
      font-weight: 500;
      color: var(--cdp-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .cdp-input-group input, .cdp-input-group select {
      background: rgba(0, 0, 0, 0.05);
      border: 1px solid transparent;
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 14px;
      transition: all 0.2s;
    }

    .cdp-input-group input:focus, .cdp-input-group select:focus {
      outline: none;
      border-color: var(--cdp-primary);
      background: white;
      box-shadow: 0 0 0 3px rgba(0, 184, 212, 0.1);
    }

    .cdp-switches {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
      margin-top: 8px;
    }

    .cdp-switch {
      display: flex;
      align-items: center;
      gap: 10px;
      cursor: pointer;
      font-size: 13px;
    }

    .cdp-switch input { display: none; }

    .cdp-slider {
      width: 32px;
      height: 18px;
      background: #ccc;
      border-radius: 9px;
      position: relative;
      transition: 0.3s;
    }

    .cdp-slider::after {
      content: '';
      position: absolute;
      width: 14px;
      height: 14px;
      background: white;
      border-radius: 50%;
      top: 2px;
      left: 2px;
      transition: 0.3s;
    }

    input:checked + .cdp-slider { background: var(--cdp-primary); }
    input:checked + .cdp-slider::after { transform: translateX(14px); }

    .cdp-actions {
      display: flex;
      gap: 12px;
      margin-top: 8px;
    }

    .cdp-btn-primary, .cdp-btn-secondary, .cdp-btn-success {
      border: none;
      border-radius: 8px;
      padding: 12px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .cdp-btn-primary {
      background: var(--cdp-primary);
      color: white;
    }

    .cdp-btn-primary:hover:not(:disabled) { background: var(--cdp-primary-hover); }

    .cdp-btn-secondary {
      background: rgba(0, 0, 0, 0.05);
      color: var(--cdp-text-muted);
    }

    .cdp-btn-secondary:hover:not(:disabled) { background: rgba(0, 0, 0, 0.1); }

    .cdp-btn-success {
      background: var(--cdp-success);
      color: white;
      width: 100%;
    }

    .cdp-btn-success:hover { background: #43a047; }

    .cdp-btn-primary:disabled { opacity: 0.6; cursor: not-allowed; }

    .cdp-summary {
      margin-top: 24px;
      padding-top: 24px;
      border-top: 1px solid var(--cdp-glass-border);
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .cdp-count-info {
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .cdp-count {
      font-size: 32px;
      font-weight: 700;
      color: var(--cdp-primary);
    }

    .cdp-count-label {
      font-size: 12px;
      color: var(--cdp-text-muted);
      text-transform: uppercase;
    }

    .cdp-error {
      margin-top: 16px;
      padding: 12px;
      background: rgba(255, 82, 82, 0.1);
      border-radius: 8px;
      color: var(--cdp-error);
      font-size: 13px;
      text-align: center;
    }

    .cdp-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid rgba(255,255,255,0.3);
      border-radius: 50%;
      border-top-color: white;
      animation: spin 0.8s linear infinite;
    }

    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }

    .slide-up { animation: slideUp 0.4s ease-out; }
    .fade-in { animation: fadeIn 0.3s ease-in; }
  `],
})
export class FilterWidgetComponent {
  private queryApi = inject(QueryApiService);

  // Inputs from host platform as HTML attributes
  @Input({ required: true }) apiKey!: string;
  @Input({ required: true }) baseUrl!: string;

  // Output — host listens for this custom event
  @Output() dataSelected = new EventEmitter<{ filter: FilterPayload; count: number }>();

  loading      = signal(false);
  previewCount = signal(0);
  errorMsg     = signal('');
  lastFilter   = signal<FilterPayload | null>(null);

  form = signal({
    segment: '',
    tags: '',
    tagsAny: '',
    language: '',
    optOutWhatsapp: false,
    optOutEmail: false
  });

  updateField(field: string, value: any): void {
    this.form.update(f => ({ ...f, [field]: value }));
  }

  reset(): void {
    this.form.set({
      segment: '',
      tags: '',
      tagsAny: '',
      language: '',
      optOutWhatsapp: false,
      optOutEmail: false
    });
    this.previewCount.set(0);
    this.errorMsg.set('');
    this.lastFilter.set(null);
  }

  search(): void {
    const { segment, tags, tagsAny, language, optOutWhatsapp, optOutEmail } = this.form();

    if (!segment.trim()) {
      this.errorMsg.set('Segment is required');
      return;
    }
    this.errorMsg.set('');
    this.loading.set(true);

    const payload: FilterPayload = {
      filters: {
        segment: segment.trim(),
        tags: tags ? tags.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        tags_any: tagsAny ? tagsAny.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
        language: language || undefined,
        opt_out_whatsapp: optOutWhatsapp || undefined,
        opt_out_email: optOutEmail || undefined,
      },
      page_size: 1,
      fields: ['id'],
    };

    this.queryApi.query(payload, this.baseUrl, this.apiKey, true).subscribe({
      next: (r: QueryResult) => {
        this.previewCount.set(r.total_count);
        this.lastFilter.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Query failed. Check your connection or API key.');
        this.loading.set(false);
      },
    });
  }

  useData(): void {
    const filter = this.lastFilter();
    if (!filter) return;
    this.dataSelected.emit({ filter, count: this.previewCount() });
  }
}
