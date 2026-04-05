/**
 * JobsListComponent — upload job monitoring dashboard.
 *
 * Lists recent ingest jobs. Auto-refreshes every 5 s while any job
 * is in a non-terminal state (queued | processing). Stops polling
 * when all visible jobs are done/failed.
 *
 * FRONTEND.md §4 (jobs route)
 */
import {
  Component,
  ChangeDetectionStrategy,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { QueryApiService } from '@cdp/api-client';
import type { UploadJob, JobStatus } from '@cdp/data-models';
import { FormatNumberPipe } from '../../shared/pipes/format-number.pipe';

@Component({
  selector: 'app-jobs-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormatNumberPipe],
  template: `
    <div class="jobs-page">
      <div class="page-header">
        <h2 class="page-title">Upload Jobs</h2>
        <button class="btn-outline" (click)="loadJobs()" [disabled]="loading()">
          {{ loading() ? 'Refreshing…' : '↺ Refresh' }}
        </button>
      </div>

      @if (loading() && jobs().length === 0) {
        <div class="loading-state">Loading jobs…</div>
      }

      @if (!loading() && jobs().length === 0) {
        <div class="empty-state">
          <p>No upload jobs yet.</p>
          <p>Go to <strong>Upload</strong> to ingest your first CSV.</p>
        </div>
      }

      @if (jobs().length > 0) {
        <div class="jobs-table">
          <!-- Header -->
          <div class="table-head">
            <span class="col-filename">File</span>
            <span class="col-segment">Segment</span>
            <span class="col-status">Status</span>
            <span class="col-progress">Progress</span>
            <span class="col-rows">Rows</span>
            <span class="col-failed">Failed</span>
            <span class="col-date">Started</span>
            <span class="col-actions">Actions</span>
          </div>

          @for (job of jobs(); track job.id) {
            <div class="table-row" [class]="'status-' + job.status">
              <span class="col-filename" [title]="job.filename">{{ job.filename }}</span>
              <span class="col-segment">{{ job.segment }}</span>
              <span class="col-status">
                <span class="status-badge badge-{{ job.status }}">{{ job.status }}</span>
              </span>
              <span class="col-progress">
                @if (job.status === 'processing' || job.status === 'done') {
                  <div class="progress-wrap">
                    <div class="progress-bar" [style.width.%]="progressPct(job)"></div>
                  </div>
                  <span class="pct-label">{{ progressPct(job) }}%</span>
                }
              </span>
              <span class="col-rows">{{ job.total_rows | formatNumber }}</span>
              <span class="col-failed" [class.has-errors]="job.failed_rows > 0">
                {{ job.failed_rows | formatNumber }}
              </span>
              <span class="col-date">{{ formatDate(job.created_at) }}</span>
              <span class="col-actions">
                <button 
                  class="btn-delete" 
                  (click)="confirmDelete(job)" 
                  [disabled]="job.status === 'processing' || loading()">
                  Delete
                </button>
              </span>
            </div>
          }
        </div>


        @if (liveJobCount() > 0) {
          <p class="auto-refresh">Auto-refreshing every 5 s · {{ liveJobCount() }} job(s) active</p>
        }
      }
    </div>
  `,
  styles: [`
    .jobs-page  { max-width: 1100px; margin: 0 auto; padding: 32px 16px; }
    /* .page-title, .page-header — from global styles.scss */
    .page-header { margin-bottom: 24px; } /* layout from global; spacing override here */
    .loading-state, .empty-state { padding: 48px; text-align: center; color: #9ca3af; font-size: 14px; background: #fff; border-radius: 12px; }
    .jobs-table  { background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
    .table-head, .table-row { display: grid; grid-template-columns: 1.8fr 1.1fr .8fr 1.2fr .8fr .8fr 1.1fr 1fr; padding: 10px 16px; align-items: center; gap: 8px; }
    .table-head  { background: #f9fafb; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .05em; border-bottom: 2px solid #e5e7eb; }
    .table-row   { font-size: 13px; border-bottom: 1px solid #f3f4f6; transition: background .1s; }
    .table-row:last-child { border-bottom: none; }
    .table-row:hover { background: #fafafa; }
    .col-filename { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
    .col-segment  { color: #6b7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .col-rows, .col-failed { font-family: monospace; }
    .col-date   { font-size: 12px; color: #9ca3af; }
    .col-actions { display: flex; justify-content: flex-end; }
    .btn-delete {
      padding: 4px 10px;
      font-size: 11px;
      font-weight: 600;
      color: #ef4444;
      background: #fef2f2;
      border: 1px solid #fee2e2;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-delete:hover:not(:disabled) {
      background: #fee2e2;
      color: #b91c1c;
    }
    .btn-delete:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .has-errors { color: #ef4444; font-weight: 600; }


    /* Status badges */
    .status-badge { padding: 2px 8px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; }
    .badge-queued     { background: #fef9c3; color: #854d0e; }
    .badge-processing { background: #dbeafe; color: #1d4ed8; }
    .badge-done       { background: #dcfce7; color: #166534; }
    .badge-failed     { background: #fee2e2; color: #991b1b; }

    /* Progress bar */
    .progress-wrap { background: #e5e7eb; border-radius: 999px; height: 6px; overflow: hidden; margin-bottom: 3px; }
    .progress-bar  { height: 100%; background: #6366f1; border-radius: 999px; transition: width .4s; }
    .pct-label     { font-size: 11px; color: #6b7280; }

    /* Auto-refresh notice */
    .auto-refresh { margin-top: 12px; font-size: 12px; color: #9ca3af; text-align: right; }

    /* .btn-outline — from global styles.scss */
  `],
})
export class JobsListComponent implements OnInit, OnDestroy {
  private api = inject(QueryApiService);

  jobs    = signal<UploadJob[]>([]);
  loading = signal(false);

  liveJobCount = computed(
    () => this.jobs().filter((j) => j.status === 'queued' || j.status === 'processing').length,
  );

  private _pollInterval: ReturnType<typeof setInterval> | null = null;

  ngOnInit(): void {
    this.loadJobs();
    // Start auto-refresh; stops itself when no live jobs remain
    this._pollInterval = setInterval(() => {
      if (this.liveJobCount() > 0) this.loadJobs();
    }, 5000);
  }

  ngOnDestroy(): void {
    if (this._pollInterval !== null) clearInterval(this._pollInterval);
  }

  loadJobs(): void {
    this.loading.set(true);
    this.api.listJobs().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  progressPct(job: UploadJob): number {
    if (job.total_rows === 0) return 0;
    return Math.round((job.processed_rows / job.total_rows) * 100);
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  confirmDelete(job: UploadJob): void {
    const msg = `Are you sure you want to delete this job and ALL ${job.total_rows} contacts associated with it?\n\nFile: ${job.filename}\nSegment: ${job.segment}\n\nThis action CANNOT be undone.`;
    
    if (window.confirm(msg)) {
      this.loading.set(true);
      this.api.deleteJobData(job.id).subscribe({
        next: (res: { success: boolean; message: string }) => {
          console.log('Delete success:', res);
          this.loadJobs();
        },
        error: (err: Error) => {
          console.error('Delete failed:', err);
          this.loading.set(false);
          alert('Failed to delete job data. Please try again.');
        }
      });

    }
  }

  protected readonly statusOrder: Record<JobStatus, number> = {
    processing: 0,
    queued:     1,
    done:       2,
    failed:     3,
  };
}
