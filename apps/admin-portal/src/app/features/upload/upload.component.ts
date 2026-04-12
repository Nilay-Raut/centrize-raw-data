/**
 * UploadComponent — 3-step CSV upload wizard.
 *
 * Step 1 — select:    Drag-drop or file picker. CSV parsed in Web Worker.
 * Step 2 — map:       Map CSV columns to standard platform fields.
 *                     "phone" mapping + segment are required to proceed.
 * Step 3 — confirm:   Review mapping summary, then POST to /api/ingest.
 * uploading:          Spinner while upload is in flight.
 * done:               Job ID returned; polls /api/status/:jobId every 2 s.
 *
 * FRONTEND.md §6
 */
import {
  Component,
  ChangeDetectionStrategy,
  signal,
  computed,
  inject,
  NgZone,
  OnDestroy,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { QueryApiService } from '@cdp/api-client';
import { ToastService } from '../../core/toast/toast.service';

type UploadStep = 'select' | 'map' | 'confirm' | 'uploading' | 'done';

const STANDARD_FIELDS = [
  'phone',
  'email',
  'name',
  'company_name',
  'designation',
  'industry',
  'sector',
  'sub_sector',
  'city',
  'state',
  'address',
  'pincode',
  'website',
  'linkedin_url',
  'gender',
  'dob',
  'language',
  'tags',
  'opt_out_whatsapp',
  'opt_out_email',
  'opt_out_call',
  'skip',            // skip = ignore this column
] as const;

@Component({
  selector: 'app-upload',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule],
  template: `
    <div class="upload-page">
      <h2 class="page-title">Upload Contacts</h2>

      <!-- Step indicator -->
      <div class="steps">
        @for (s of STEPS; track s.key) {
          <div class="step" [class.active]="step() === s.key" [class.done]="isStepDone(s.key)">
            <span class="step-num">{{ s.num }}</span>
            <span class="step-label">{{ s.label }}</span>
          </div>
          @if (!$last) { <div class="step-divider"></div> }
        }
      </div>

      <!-- Step 1: Select file -->
      @if (step() === 'select') {
        <div class="card">
          @if (isParsing()) {
            <div class="parsing-state">
              <div class="spinner"></div>
              <p>Processing preview...</p>
              <span class="parsing-hint">Reading headers & generating preview</span>
            </div>
          } @else {
            <div
              class="dropzone"
              [class.drag-over]="isDragging()"
              (dragover)="$event.preventDefault(); isDragging.set(true)"
              (dragleave)="isDragging.set(false)"
              (drop)="onDrop($event)"
            >
              <div class="dropzone-inner">
                <span class="drop-icon">📂</span>
                <p>Drag & drop a CSV file here</p>
                <p class="drop-sub">or</p>
                <label class="btn-outline">
                  Browse file
                  <input type="file" accept=".csv,.xlsx" style="display:none" (change)="onFileSelected($event)" />
                </label>
                <p class="drop-hint">CSV or Excel (Max 100 MB)</p>
                <div class="sample-link">
                  Need a format example? 
                  <a href="assets/samples/contacts_sample.csv" download>Download Sample CSV</a>
                </div>
              </div>
            </div>
          }

          @if (parseError()) {
            <div class="alert-error">{{ parseError() }}</div>
          }
        </div>
      }

      <!-- Step 2: Map columns -->
      @if (step() === 'map') {
        <div class="card">
          <h3>Map CSV Columns</h3>
          <p class="subtitle">File: <strong>{{ file()?.name }}</strong> · {{ csvHeaders().length }} columns detected</p>

          <!-- Segment input -->
          <div class="field-row">
            <label>Segment <span class="required">*</span></label>
            <input
              type="text"
              placeholder="e.g. premium-users-2024"
              [(ngModel)]="segmentValue"
              class="segment-input"
            />
            <span class="field-hint">A label for this batch of contacts.</span>
          </div>

          <div class="mapping-table">
            <div class="mapping-header">
              <span>CSV Column</span>
              <span>Preview</span>
              <span>Maps to</span>
            </div>
            @for (header of csvHeaders(); track header) {
              <div class="mapping-row">
                <span class="col-name">{{ header }}</span>
                <span class="col-preview">{{ previewValue(header) }}</span>
                <select [ngModel]="fieldMapping()[header]" (ngModelChange)="setMapping(header, $event)">
                  <option value="">— skip —</option>
                  @for (f of standardFields; track f) {
                    <option [value]="f">{{ f }}</option>
                  }
                </select>
              </div>
            }
          </div>

          @if (!canConfirm()) {
            <p class="mapping-hint">⚠ Map the <strong>phone</strong> column and enter a segment to continue.</p>
          }

          <div class="actions">
            <button class="btn-ghost" (click)="step.set('select')">← Back</button>
            <button class="btn-primary" [disabled]="!canConfirm()" (click)="step.set('confirm')">
              Review →
            </button>
          </div>
        </div>
      }

      <!-- Step 3: Confirm -->
      @if (step() === 'confirm') {
        <div class="card">
          <h3>Confirm Upload</h3>
          <table class="summary-table">
            <tr><th>File</th><td>{{ file()?.name }}</td></tr>
            <tr><th>Segment</th><td>{{ segment() }}</td></tr>
            <tr><th>Columns mapped</th><td>{{ mappedCount() }}</td></tr>
            <tr><th>Columns skipped</th><td>{{ csvHeaders().length - mappedCount() }}</td></tr>
          </table>

          <div class="mapping-preview">
            @for (entry of mappingSummary(); track entry.csv) {
              <div class="mapping-chip">
                <span class="csv-col">{{ entry.csv }}</span>
                <span class="arrow">→</span>
                <span class="std-col">{{ entry.std }}</span>
              </div>
            }
          </div>

          <div class="actions">
            <button class="btn-ghost" (click)="step.set('map')">← Edit mapping</button>
            <button class="btn-primary" (click)="submit()">Upload now</button>
          </div>
        </div>
      }

      <!-- Uploading -->
      @if (step() === 'uploading') {
        <div class="card center">
          <div class="spinner"></div>
          <p>Uploading file…</p>
        </div>
      }

      <!-- Done -->
      @if (step() === 'done') {
        <div class="card">
          <div class="done-header">
            <span class="done-icon">✅</span>
            <h3>Upload queued</h3>
            <p>Job ID: <code>{{ jobId() }}</code></p>
          </div>

          <div class="progress-bar-wrap">
            <div class="progress-bar" [style.width.%]="progress()"></div>
          </div>
          <p class="progress-label">{{ progress() }}% processed</p>

          @if (jobStatus() === 'done') {
            <p class="status-done">✅ Normalisation complete.</p>
          } @else if (jobStatus() === 'failed') {
            <p class="status-failed">❌ Job failed. Check the Jobs page for details.</p>
          } @else {
            <p class="status-processing">Processing… page updates every 2 s.</p>
          }

          <button class="btn-outline" (click)="reset()">Upload another file</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .upload-page { max-width: 760px; margin: 0 auto; padding: 32px 16px; }
    .page-title  { margin-bottom: 24px; } /* font/color from global styles.scss */

    /* Steps */
    .steps       { display: flex; align-items: center; margin-bottom: 32px; }
    .step        { display: flex; align-items: center; gap: 8px; opacity: .4; transition: opacity .2s; }
    .step.active, .step.done { opacity: 1; }
    .step-num    { width: 28px; height: 28px; border-radius: 50%; background: #e5e7eb; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 600; }
    .step.active .step-num { background: #6366f1; color: #fff; }
    .step.done .step-num   { background: #10b981; color: #fff; }
    .step-label  { font-size: 13px; font-weight: 500; color: #374151; }
    .step-divider { flex: 1; height: 2px; background: #e5e7eb; margin: 0 12px; }

    /* Card */
    .card        { background: #fff; border-radius: 12px; padding: 28px; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .card.center { display: flex; flex-direction: column; align-items: center; gap: 16px; padding: 48px; }
    h3           { margin: 0 0 6px; font-size: 16px; font-weight: 700; color: #111827; }
    .subtitle    { margin: 0 0 20px; font-size: 13px; color: #6b7280; }

    /* Dropzone */
    .dropzone    { border: 2px dashed #d1d5db; border-radius: 10px; padding: 40px; transition: border-color .2s, background .2s; }
    .dropzone.drag-over { border-color: #6366f1; background: #f5f3ff; }
    .dropzone-inner { display: flex; flex-direction: column; align-items: center; gap: 8px; }
    .drop-icon   { font-size: 36px; }
    .drop-sub    { color: #9ca3af; margin: 0; font-size: 13px; }
    .drop-hint   { color: #9ca3af; font-size: 12px; margin: 0; }

    /* Mapping */
    .field-row   { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
    .segment-input { padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 8px; font-size: 13px; min-width: 200px; }
    .field-hint  { font-size: 12px; color: #9ca3af; }
    .required    { color: #ef4444; }
    .mapping-table  { display: flex; flex-direction: column; gap: 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    .mapping-header { display: grid; grid-template-columns: 1fr 1fr 1fr; background: #f9fafb; padding: 8px 12px; font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; border-bottom: 1px solid #e5e7eb; }
    .mapping-row  { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 8px 12px; font-size: 13px; border-bottom: 1px solid #f3f4f6; align-items: center; }
    .mapping-row:last-child { border-bottom: none; }
    .col-name    { font-weight: 500; }
    .col-preview { color: #6b7280; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    select       { padding: 5px 8px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 12px; }
    .mapping-hint { font-size: 13px; color: #f59e0b; margin-bottom: 16px; }

    /* Summary */
    .summary-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; font-size: 14px; }
    .summary-table th { text-align: left; padding: 6px 12px; width: 160px; color: #6b7280; font-weight: 500; }
    .summary-table td { padding: 6px 12px; color: #111827; }
    .mapping-preview { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
    .mapping-chip { display: flex; align-items: center; gap: 4px; background: #f3f4f6; padding: 4px 10px; border-radius: 6px; font-size: 12px; }
    .csv-col { color: #374151; font-weight: 500; }
    .arrow   { color: #9ca3af; }
    .std-col { color: #6366f1; font-weight: 600; }

    /* Progress */
    .progress-bar-wrap { background: #e5e7eb; border-radius: 999px; height: 8px; margin-bottom: 8px; overflow: hidden; }
    .progress-bar  { height: 100%; background: #6366f1; border-radius: 999px; transition: width .4s; }
    .progress-label { font-size: 13px; color: #6b7280; margin: 0 0 12px; }
    .status-done   { color: #10b981; font-weight: 500; }
    .status-failed { color: #ef4444; font-weight: 500; }
    .status-processing { color: #6b7280; font-size: 13px; }
    .done-header   { text-align: center; margin-bottom: 20px; }
    .done-icon     { font-size: 40px; }
    code           { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 12px; }

    /* Spinner */
    .spinner { width: 40px; height: 40px; border: 4px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin .8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* Parsing state */
    .parsing-state { display: flex; flex-direction: column; align-items: center; gap: 12px; padding: 20px; }
    .parsing-hint  { font-size: 12px; color: #9ca3af; }

    /* Buttons */
    .actions   { display: flex; justify-content: flex-end; gap: 12px; margin-top: 20px; }
    /* .btn-primary, .btn-outline, .btn-ghost — from global styles.scss */
    .alert-error { background: #fef2f2; color: #dc2626; padding: 10px 14px; border-radius: 8px; margin-top: 12px; font-size: 13px; }
  `],
})
export class UploadComponent implements OnDestroy {
  private api     = inject(QueryApiService);
  private toast   = inject(ToastService);
  private zone    = inject(NgZone);

  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  readonly STEPS = [
    { key: 'select',  num: 1, label: 'Select file' },
    { key: 'map',     num: 2, label: 'Map columns' },
    { key: 'confirm', num: 3, label: 'Confirm'     },
  ] as const;

  readonly standardFields = STANDARD_FIELDS;

  // ── State signals ─────────────────────────────────────────────────────────
  step         = signal<UploadStep>('select');
  file         = signal<File | null>(null);
  csvHeaders   = signal<string[]>([]);
  previewRows  = signal<Record<string, string>[]>([]);
  fieldMapping = signal<Record<string, string>>({});
  isDragging   = signal(false);
  isParsing    = signal(false);
  parseError   = signal('');
  jobId        = signal<string | null>(null);
  progress     = signal(0);
  jobStatus    = signal<string>('queued');

  /** Two-way bound via ngModel — bridge into a signal */
  get segmentValue(): string { return this._segment(); }
  set segmentValue(v: string) { this._segment.set(v); }
  private _segment = signal('');
  segment = this._segment.asReadonly();

  // ── Computed ──────────────────────────────────────────────────────────────
  canConfirm = computed(
    () =>
      Object.values(this.fieldMapping()).includes('phone') &&
      this._segment().trim().length > 0 &&
      !this.isParsing(),
  );

  mappedCount = computed(
    () => Object.values(this.fieldMapping()).filter((v) => v && v !== 'skip').length,
  );

  mappingSummary = computed(() =>
    Object.entries(this.fieldMapping())
      .filter(([, std]) => std && std !== 'skip')
      .map(([csv, std]) => ({ csv, std })),
  );

  // ── Helpers ───────────────────────────────────────────────────────────────
  isStepDone(key: string): boolean {
    const order: UploadStep[] = ['select', 'map', 'confirm', 'uploading', 'done'];
    const current = order.indexOf(this.step() as UploadStep);
    const target  = order.indexOf(key as UploadStep);
    return target < current;
  }

  previewValue(header: string): string {
    const rows = this.previewRows();
    return rows[0]?.[header] ?? '';
  }

  setMapping(header: string, value: string): void {
    this.fieldMapping.update((m) => ({ ...m, [header]: value }));
  }

  // ── File handling ─────────────────────────────────────────────────────────
  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.isDragging.set(false);
    const f = event.dataTransfer?.files[0];
    if (f) this.processFile(f);
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (f) this.processFile(f);
  }

  private processFile(f: File): void {
    const isXlsx = f.name.endsWith('.xlsx') || f.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    const isCsv = f.name.endsWith('.csv') || f.type === 'text/csv';

    if (!isCsv && !isXlsx) {
      this.parseError.set('Only CSV and XLSX files are supported.');
      return;
    }

    if (f.size > 100 * 1024 * 1024) {
      this.parseError.set('File is too large. Maximum size is 100 MB.');
      return;
    }

    this.file.set(f);
    this.parseError.set('');
    this.fieldMapping.set({});
    this.isParsing.set(true);

    const reader = new FileReader();

    if (isXlsx) {
      reader.onload = (e) => {
        this.runWorker('xlsx', e.target?.result as ArrayBuffer);
      };
      reader.readAsArrayBuffer(f);
    } else {
      // For CSV, only read the first 1 MB to get headers and preview rows
      // This prevents browser freeze on 50MB+ files
      const blob = f.slice(0, 1024 * 1024);
      reader.onload = (e) => {
        this.runWorker('csv', e.target?.result as string);
      };
      reader.readAsText(blob);
    }
  }

  private runWorker(type: 'csv' | 'xlsx', content: string | ArrayBuffer): void {
    // @ts-ignore - import.meta is allowed in the Angular build but root tsconfig warns
    const worker = new Worker(new URL('./csv-parse.worker', import.meta.url), { type: 'module' });
    
    // Use Transferable for ArrayBuffer to avoid copying memory
    const transfer = content instanceof ArrayBuffer ? [content] : [];
    worker.postMessage({ type, content }, transfer);
    
    worker.onmessage = ({ data }) => {
      this.isParsing.set(false);
      if (data.error) {
        this.parseError.set(data.error);
        worker.terminate();
        return;
      }

      this.csvHeaders.set(data.headers);
      this.previewRows.set(data.preview);
      
      const autoMap: Record<string, string> = {};
      data.headers.forEach((h: string) => {
        const lower = h.toLowerCase().trim();
        if ((STANDARD_FIELDS as readonly string[]).includes(lower)) {
          autoMap[h] = lower;
        }
      });
      this.fieldMapping.set(autoMap);
      this.step.set('map');
      worker.terminate();
    };

    worker.onerror = (err) => {
      console.error('[Worker Error]', err);
      this.isParsing.set(false);
      this.parseError.set('Failed to parse file metadata.');
      worker.terminate();
    };
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  submit(): void {
    const f = this.file();
    if (!f) return;

    const formData = new FormData();
    formData.append('file', f);
    formData.append('segment', this.segment());
    formData.append('field_mapping', JSON.stringify(this.fieldMapping()));

    this.step.set('uploading');

    this.api.ingest(formData).subscribe({
      next: (res) => {
        this.jobId.set(res.job_id);
        this.step.set('done');
        this.toast.success(`Upload queued — job ${res.job_id}`);
        this._pollJobProgress(res.job_id);
      },
      error: () => {
        this.step.set('confirm');
        this.toast.error('Upload failed. Please try again.');
      },
    });
  }

  private _pollJobProgress(jobId: string): void {
    this._stopPoll();
    this._pollInterval = setInterval(() => {
      this.api.getJobStatus(jobId).subscribe({
        next: (job) => {
          // NgZone.run() ensures signal updates inside setInterval trigger
          // Angular change detection in OnPush components.
          this.zone.run(() => {
            this.progress.set(
              job.total_rows > 0
                ? Math.round((job.processed_rows / job.total_rows) * 100)
                : 0,
            );
            this.jobStatus.set(job.status);
            if (job.status === 'done' || job.status === 'failed') {
              this._stopPoll();
            }
          });
        },
        error: () => this._stopPoll(),
      });
    }, 2000);
  }

  private _stopPoll(): void {
    if (this._pollInterval !== null) {
      clearInterval(this._pollInterval);
      this._pollInterval = null;
    }
  }

  ngOnDestroy(): void {
    this._stopPoll();
  }

  reset(): void {
    this._stopPoll();
    this.step.set('select');
    this.file.set(null);
    this.csvHeaders.set([]);
    this.previewRows.set([]);
    this.fieldMapping.set({});
    this._segment.set('');
    this.jobId.set(null);
    this.progress.set(0);
    this.jobStatus.set('queued');
  }
}
