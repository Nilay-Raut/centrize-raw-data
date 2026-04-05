/**
 * InsightsComponent — Admin analytics dashboard.
 *
 * Fetches /api/insights on init and renders all KPI cards, charts,
 * completeness bars, and jobs health in a responsive grid layout.
 *
 * All chart rendering is done with pure SVG/Canvas via Chart.js-free
 * lightweight inline components to avoid adding heavy dependencies.
 */
import {
  Component,
  OnInit,
  ChangeDetectionStrategy,
  signal,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { QueryApiService, InsightsData } from '@cdp/api-client';

@Component({
  selector: 'app-insights',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="insights-page">
      <header class="page-header">
        <div>
          <h1 class="page-title">Data Insights</h1>
          <p class="page-sub">Real-time overview of your contact database</p>
        </div>
        <button class="btn-refresh" (click)="load()" [disabled]="loading()">
          <span class="refresh-icon" [class.spin]="loading()">⟳</span>
          {{ loading() ? 'Refreshing…' : 'Refresh' }}
        </button>
      </header>

      @if (error()) {
        <div class="error-banner">⚠️ {{ error() }}</div>
      }

      @if (data(); as d) {
        <!-- ── Row 1: KPI Cards ── -->
        <section class="section">
          <div class="kpi-grid">
            <div class="kpi-card kpi-primary">
              <span class="kpi-icon">👥</span>
              <div class="kpi-value">{{ d.totalContacts | number }}</div>
              <div class="kpi-label">Total Contacts</div>
            </div>
            <div class="kpi-card kpi-warn">
              <span class="kpi-icon">📵</span>
              <div class="kpi-value">{{ d.optOutWhatsapp | number }}</div>
              <div class="kpi-label">WhatsApp Opt-outs</div>
              <div class="kpi-pct">({{ pct(d.optOutWhatsapp, d.totalContacts) }}%)</div>
            </div>
            <div class="kpi-card kpi-warn">
              <span class="kpi-icon">📧</span>
              <div class="kpi-value">{{ d.optOutEmail | number }}</div>
              <div class="kpi-label">Email Opt-outs</div>
              <div class="kpi-pct">({{ pct(d.optOutEmail, d.totalContacts) }}%)</div>
            </div>
            <div class="kpi-card kpi-warn">
              <span class="kpi-icon">📞</span>
              <div class="kpi-value">{{ d.optOutCall | number }}</div>
              <div class="kpi-label">Call Opt-outs</div>
              <div class="kpi-pct">({{ pct(d.optOutCall, d.totalContacts) }}%)</div>
            </div>
            <div class="kpi-card kpi-success">
              <span class="kpi-icon">🏷️</span>
              <div class="kpi-value">{{ d.taggedCount | number }}</div>
              <div class="kpi-label">Tagged Contacts</div>
              <div class="kpi-pct">({{ pct(d.taggedCount, d.totalContacts) }}%)</div>
            </div>
            <div class="kpi-card kpi-neutral">
              <span class="kpi-icon">📤</span>
              <div class="kpi-value">{{ d.jobStats.total }}</div>
              <div class="kpi-label">Total Upload Jobs</div>
              <div class="kpi-pct">{{ d.jobStats.done }} done · {{ d.jobStats.failed }} failed</div>
            </div>
          </div>
        </section>

        <!-- ── Row 2: Distribution Charts ── -->
        <section class="section">
          <div class="charts-grid">
            <!-- Segment Distribution -->
            <div class="chart-card">
              <h3 class="chart-title">By Segment</h3>
              <div class="bar-list">
                @for (row of d.segmentDistribution; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill seg" [style.width.%]="pct(row.count, d.totalContacts)"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                    <span class="bar-pct">{{ pct(row.count, d.totalContacts) }}%</span>
                  </div>
                }
                @if (!d.segmentDistribution.length) { <p class="empty">No data</p> }
              </div>
            </div>

            <!-- Language Distribution -->
            <div class="chart-card">
              <h3 class="chart-title">By Language</h3>
              <div class="bar-list">
                @for (row of d.languageDistribution; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill lang" [style.width.%]="pct(row.count, d.totalContacts)"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                    <span class="bar-pct">{{ pct(row.count, d.totalContacts) }}%</span>
                  </div>
                }
                @if (!d.languageDistribution.length) { <p class="empty">No data</p> }
              </div>
            </div>

            <!-- Gender Distribution -->
            <div class="chart-card">
              <h3 class="chart-title">By Gender</h3>
              <div class="donut-wrap">
                <svg viewBox="0 0 120 120" class="donut-svg">
                  @for (seg of genderSlices(d); track seg.label; let i = $index) {
                    <circle class="donut-ring"
                      r="40" cx="60" cy="60"
                      [attr.stroke]="seg.color"
                      [attr.stroke-dasharray]="seg.dash + ' ' + seg.gap"
                      [attr.stroke-dashoffset]="seg.offset"
                    />
                  }
                  <text x="60" y="64" text-anchor="middle" class="donut-center-text">{{ d.genderDistribution.length ? 'Gender' : 'No data' }}</text>
                </svg>
                <div class="donut-legend">
                  @for (seg of genderSlices(d); track seg.label) {
                    <div class="legend-row">
                      <span class="legend-dot" [style.background]="seg.color"></span>
                      <span class="legend-label">{{ seg.label }}</span>
                      <span class="legend-val">{{ seg.count | number }} ({{ pct(seg.count, d.totalContacts) }}%)</span>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Tagged vs Untagged -->
            <div class="chart-card">
              <h3 class="chart-title">Tagged vs Untagged</h3>
              <div class="donut-wrap">
                <svg viewBox="0 0 120 120" class="donut-svg">
                  @for (seg of tagSlices(d); track seg.label) {
                    <circle class="donut-ring"
                      r="40" cx="60" cy="60"
                      [attr.stroke]="seg.color"
                      [attr.stroke-dasharray]="seg.dash + ' ' + seg.gap"
                      [attr.stroke-dashoffset]="seg.offset"
                    />
                  }
                  <text x="60" y="64" text-anchor="middle" class="donut-center-text">Tags</text>
                </svg>
                <div class="donut-legend">
                  @for (seg of tagSlices(d); track seg.label) {
                    <div class="legend-row">
                      <span class="legend-dot" [style.background]="seg.color"></span>
                      <span class="legend-label">{{ seg.label }}</span>
                      <span class="legend-val">{{ seg.count | number }} ({{ pct(seg.count, d.totalContacts) }}%)</span>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Row 3: Geographic & Professional ── -->
        <section class="section">
          <div class="charts-grid">
            <!-- Top States -->
            <div class="chart-card">
              <h3 class="chart-title">Top States</h3>
              <div class="bar-list">
                @for (row of d.topStates; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill geo" [style.width.%]="pct(row.count, maxOf(d.topStates))"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                  </div>
                }
                @if (!d.topStates.length) { <p class="empty">No state data</p> }
              </div>
            </div>

            <!-- Top Cities -->
            <div class="chart-card">
              <h3 class="chart-title">Top Cities</h3>
              <div class="bar-list">
                @for (row of d.topCities; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill geo" [style.width.%]="pct(row.count, maxOf(d.topCities))"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                  </div>
                }
                @if (!d.topCities.length) { <p class="empty">No city data</p> }
              </div>
            </div>

            <!-- Top Industries -->
            <div class="chart-card">
              <h3 class="chart-title">Top Industries</h3>
              <div class="bar-list">
                @for (row of d.topIndustries; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label truncate">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill pro" [style.width.%]="pct(row.count, maxOf(d.topIndustries))"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                  </div>
                }
                @if (!d.topIndustries.length) { <p class="empty">No industry data</p> }
              </div>
            </div>

            <!-- Top Sectors -->
            <div class="chart-card">
              <h3 class="chart-title">Top Sectors</h3>
              <div class="bar-list">
                @for (row of d.topSectors; track row.label) {
                  <div class="bar-row">
                    <span class="bar-label truncate">{{ row.label }}</span>
                    <div class="bar-track">
                      <div class="bar-fill pro" [style.width.%]="pct(row.count, maxOf(d.topSectors))"></div>
                    </div>
                    <span class="bar-count">{{ row.count | number }}</span>
                  </div>
                }
                @if (!d.topSectors.length) { <p class="empty">No sector data</p> }
              </div>
            </div>
          </div>
        </section>

        <!-- ── Row 4: Companies & Completeness ── -->
        <section class="section">
          <div class="charts-grid-2">
            <!-- Top Companies -->
            <div class="chart-card">
              <h3 class="chart-title">Top Companies</h3>
              <div class="company-list">
                @for (row of d.topCompanies; track row.label; let i = $index) {
                  <div class="company-row">
                    <span class="company-rank">#{{ i + 1 }}</span>
                    <span class="company-name truncate">{{ row.label }}</span>
                    <span class="company-count">{{ row.count | number }}</span>
                  </div>
                }
                @if (!d.topCompanies.length) { <p class="empty">No company data</p> }
              </div>
            </div>

            <!-- Data Completeness -->
            <div class="chart-card">
              <h3 class="chart-title">Data Completeness</h3>
              <p class="chart-sub">% of contacts with each field populated</p>
              <div class="completeness-list">
                @for (field of completenessFields(d); track field.key) {
                  <div class="comp-row">
                    <span class="comp-label">{{ field.label }}</span>
                    <div class="comp-track">
                      <div class="comp-fill" [style.width.%]="field.value" [class]="compClass(field.value)"></div>
                    </div>
                    <span class="comp-pct" [class]="compClass(field.value)">{{ field.value }}%</span>
                  </div>
                }
              </div>
            </div>
          </div>
        </section>

        <!-- ── Row 5: Upload Jobs Health ── -->
        <section class="section">
          <div class="chart-card full-width">
            <h3 class="chart-title">Upload Jobs Health</h3>
            <div class="jobs-stats">
              <div class="job-stat">
                <span class="job-stat-val">{{ d.jobStats.totalRows | number }}</span>
                <span class="job-stat-label">Total Rows Ingested</span>
              </div>
              <div class="job-stat">
                <span class="job-stat-val success-text">{{ d.jobStats.processedRows | number }}</span>
                <span class="job-stat-label">Rows Processed</span>
              </div>
              <div class="job-stat">
                <span class="job-stat-val warn-text">{{ d.jobStats.failedRows | number }}</span>
                <span class="job-stat-label">Rows Failed</span>
              </div>
              <div class="job-stat">
                <span class="job-stat-val">{{ d.jobStats.done }}</span>
                <span class="job-stat-label">Completed Jobs</span>
              </div>
              <div class="job-stat">
                <span class="job-stat-val warn-text">{{ d.jobStats.failed }}</span>
                <span class="job-stat-label">Failed Jobs</span>
              </div>
            </div>

            @if (d.uploadActivity.length) {
              <div class="activity-section">
                <h4 class="activity-title">Ingest Activity — Last 30 Days</h4>
                <div class="activity-bars">
                  @for (day of d.uploadActivity; track day.date) {
                    <div class="act-col" [title]="day.date + ': ' + day.rows + ' rows'">
                      <div class="act-bar" [style.height.%]="pct(day.rows, maxRows(d.uploadActivity))"></div>
                      <span class="act-label">{{ shortDate(day.date) }}</span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </section>
      }

      @if (loading() && !data()) {
        <div class="loading-state">
          <div class="spinner"></div>
          <p>Loading insights…</p>
        </div>
      }
    </div>
  `,
  styles: [`
    /* ─── Page Layout ─── */
    .insights-page { padding: 28px 32px; max-width: 1400px; margin: 0 auto; font-family: 'Inter', system-ui, sans-serif; }
    .page-header    { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .page-title     { font-size: 22px; font-weight: 700; color: #111827; margin: 0 0 4px; }
    .page-sub       { font-size: 13px; color: #6b7280; margin: 0; }
    .btn-refresh    { display: flex; align-items: center; gap: 6px; padding: 8px 16px; background: #1e1b4b; color: #fff; border: none; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; transition: opacity .15s; }
    .btn-refresh:hover { opacity: .85; }
    .btn-refresh:disabled { opacity: .5; cursor: not-allowed; }
    .refresh-icon   { font-size: 16px; display: inline-block; transition: transform .3s; }
    .refresh-icon.spin { animation: spin 1s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    .section { margin-bottom: 24px; }
    .error-banner { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 13px; }

    /* ─── KPI Cards ─── */
    .kpi-grid  { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
    .kpi-card  { background: #fff; border-radius: 14px; padding: 20px; box-shadow: 0 1px 4px rgba(0,0,0,.08); border-top: 3px solid #e5e7eb; position: relative; overflow: hidden; }
    .kpi-card::before { content: ''; position: absolute; top: 0; right: 0; width: 60px; height: 60px; border-radius: 0 14px 0 60px; opacity: .06; }
    .kpi-primary { border-top-color: #6366f1; }
    .kpi-primary::before { background: #6366f1; }
    .kpi-warn    { border-top-color: #f59e0b; }
    .kpi-warn::before { background: #f59e0b; }
    .kpi-success { border-top-color: #10b981; }
    .kpi-success::before { background: #10b981; }
    .kpi-neutral { border-top-color: #6b7280; }
    .kpi-icon  { font-size: 24px; display: block; margin-bottom: 10px; }
    .kpi-value { font-size: 28px; font-weight: 800; color: #111827; line-height: 1; }
    .kpi-label { font-size: 12px; color: #6b7280; margin-top: 4px; font-weight: 500; text-transform: uppercase; letter-spacing: .04em; }
    .kpi-pct   { font-size: 11px; color: #9ca3af; margin-top: 2px; }

    /* ─── Chart Cards ─── */
    .charts-grid   { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 16px; }
    .charts-grid-2 { display: grid; grid-template-columns: 1fr 1.4fr; gap: 16px; }
    .chart-card    { background: #fff; border-radius: 14px; padding: 20px 24px; box-shadow: 0 1px 4px rgba(0,0,0,.08); }
    .chart-card.full-width { width: 100%; }
    .chart-title   { font-size: 14px; font-weight: 700; color: #111827; margin: 0 0 4px; }
    .chart-sub     { font-size: 12px; color: #9ca3af; margin: 0 0 14px; }
    .empty         { font-size: 13px; color: #9ca3af; font-style: italic; }

    /* ─── Bar Charts ─── */
    .bar-list  { display: flex; flex-direction: column; gap: 8px; margin-top: 12px; }
    .bar-row   { display: grid; grid-template-columns: 100px 1fr 50px 36px; align-items: center; gap: 8px; }
    .bar-label { font-size: 12px; color: #374151; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .bar-track { background: #f3f4f6; border-radius: 4px; height: 8px; overflow: hidden; }
    .bar-fill  { height: 100%; border-radius: 4px; transition: width .4s ease; min-width: 2px; }
    .bar-fill.seg  { background: linear-gradient(90deg, #6366f1, #8b5cf6); }
    .bar-fill.lang { background: linear-gradient(90deg, #10b981, #34d399); }
    .bar-fill.geo  { background: linear-gradient(90deg, #0891b2, #06b6d4); }
    .bar-fill.pro  { background: linear-gradient(90deg, #d97706, #fbbf24); }
    .bar-count { font-size: 12px; color: #374151; text-align: right; }
    .bar-pct   { font-size: 11px; color: #9ca3af; }

    /* ─── Donut Charts ─── */
    .donut-wrap        { display: flex; align-items: center; gap: 16px; margin-top: 12px; }
    .donut-svg         { width: 120px; height: 120px; transform: rotate(-90deg); flex-shrink: 0; }
    .donut-ring        { fill: none; stroke-width: 20; }
    .donut-center-text { font-size: 11px; fill: #9ca3af; transform: rotate(90deg); transform-origin: 60px 60px; }
    .donut-legend      { flex: 1; display: flex; flex-direction: column; gap: 6px; }
    .legend-row        { display: flex; align-items: center; gap: 8px; font-size: 12px; }
    .legend-dot        { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
    .legend-label      { flex: 1; color: #374151; }
    .legend-val        { color: #6b7280; white-space: nowrap; }

    /* ─── Company List ─── */
    .company-list { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
    .company-row  { display: grid; grid-template-columns: 28px 1fr 60px; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid #f3f4f6; }
    .company-rank { font-size: 11px; color: #9ca3af; font-weight: 600; }
    .company-name { font-size: 13px; color: #111827; }
    .company-count { font-size: 12px; color: #6b7280; text-align: right; font-weight: 600; }
    .truncate     { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* ─── Data Completeness ─── */
    .completeness-list { display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
    .comp-row    { display: grid; grid-template-columns: 100px 1fr 40px; align-items: center; gap: 8px; }
    .comp-label  { font-size: 12px; color: #374151; }
    .comp-track  { background: #f3f4f6; border-radius: 4px; height: 8px; overflow: hidden; }
    .comp-fill   { height: 100%; border-radius: 4px; transition: width .5s ease; }
    .comp-fill.good   { background: linear-gradient(90deg, #10b981, #34d399); }
    .comp-fill.medium { background: linear-gradient(90deg, #f59e0b, #fbbf24); }
    .comp-fill.poor   { background: linear-gradient(90deg, #ef4444, #f87171); }
    .comp-pct    { font-size: 11px; text-align: right; font-weight: 600; }
    .comp-pct.good   { color: #10b981; }
    .comp-pct.medium { color: #f59e0b; }
    .comp-pct.poor   { color: #ef4444; }

    /* ─── Jobs Health ─── */
    .jobs-stats    { display: flex; gap: 0; border: 1px solid #f3f4f6; border-radius: 10px; overflow: hidden; margin-top: 12px; }
    .job-stat      { flex: 1; padding: 16px; text-align: center; border-right: 1px solid #f3f4f6; }
    .job-stat:last-child { border-right: none; }
    .job-stat-val  { display: block; font-size: 24px; font-weight: 800; color: #111827; }
    .job-stat-label { display: block; font-size: 11px; color: #9ca3af; margin-top: 4px; text-transform: uppercase; letter-spacing: .04em; }
    .success-text  { color: #10b981 !important; }
    .warn-text     { color: #f59e0b !important; }

    /* ─── Activity Bar Chart ─── */
    .activity-section { margin-top: 24px; }
    .activity-title   { font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 12px; }
    .activity-bars    { display: flex; align-items: flex-end; gap: 4px; height: 80px; padding-bottom: 20px; position: relative; }
    .act-col          { display: flex; flex-direction: column; align-items: center; flex: 1; height: 100%; justify-content: flex-end; }
    .act-bar          { width: 100%; background: linear-gradient(180deg, #6366f1 0%, #8b5cf6 100%); border-radius: 3px 3px 0 0; min-height: 2px; transition: height .4s ease; }
    .act-label        { font-size: 9px; color: #9ca3af; margin-top: 4px; white-space: nowrap; transform: rotate(-45deg); transform-origin: top left; }

    /* ─── Loading ─── */
    .loading-state  { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 300px; gap: 16px; color: #9ca3af; }
    .spinner        { width: 36px; height: 36px; border: 3px solid #e5e7eb; border-top-color: #6366f1; border-radius: 50%; animation: spin 1s linear infinite; }

    @media (max-width: 768px) {
      .insights-page  { padding: 16px; }
      .charts-grid    { grid-template-columns: 1fr; }
      .charts-grid-2  { grid-template-columns: 1fr; }
      .jobs-stats     { flex-wrap: wrap; }
      .job-stat       { min-width: 45%; }
    }
  `],
})
export class InsightsComponent implements OnInit {
  private api = inject(QueryApiService);

  readonly data    = signal<InsightsData | null>(null);
  readonly loading = signal(false);
  readonly error   = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getInsights().subscribe({
      next: (d) => {
        this.data.set(d);
        this.loading.set(false);
      },
      error: (e) => {
        this.error.set(e?.error?.message ?? 'Failed to load insights');
        this.loading.set(false);
      },
    });
  }

  /** Percentage of a vs total, capped 0–100 */
  pct(value: number, total: number): number {
    if (!total) return 0;
    return Math.min(100, Math.round((value / total) * 100));
  }

  /** Max count in a distribution array */
  maxOf(rows: { count: number }[]): number {
    return rows.reduce((m, r) => Math.max(m, r.count), 1);
  }

  /** Max rows in upload activity list */
  maxRows(activity: { rows: number }[]): number {
    return activity.reduce((m, r) => Math.max(m, r.rows), 1);
  }

  /** Short date label e.g. "Apr 2" */
  shortDate(date: string): string {
    return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /** CSS class for completeness coloring */
  compClass(v: number): string {
    if (v >= 70) return 'good';
    if (v >= 30) return 'medium';
    return 'poor';
  }

  /** Completeness fields for the card */
  completenessFields(d: InsightsData): { key: string; label: string; value: number }[] {
    return [
      { key: 'email',       label: 'Email',       value: d.completeness['email']       ?? 0 },
      { key: 'name',        label: 'Name',         value: d.completeness['name']        ?? 0 },
      { key: 'company',     label: 'Company',      value: d.completeness['company']     ?? 0 },
      { key: 'designation', label: 'Designation',  value: d.completeness['designation'] ?? 0 },
      { key: 'industry',    label: 'Industry',     value: d.completeness['industry']    ?? 0 },
      { key: 'city',        label: 'City',         value: d.completeness['city']        ?? 0 },
      { key: 'state',       label: 'State',        value: d.completeness['state']       ?? 0 },
      { key: 'gender',      label: 'Gender',       value: d.completeness['gender']      ?? 0 },
      { key: 'linkedin',    label: 'LinkedIn',     value: d.completeness['linkedin']    ?? 0 },
    ];
  }

  private readonly DONUT_COLORS = [
    '#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#d97706',
  ];
  private readonly CIRCUMFERENCE = 2 * Math.PI * 40; // r=40

  private buildSlices(items: { label: string; count: number }[], total: number) {
    let offset = 0;
    return items.map((item, i) => {
      const frac = total > 0 ? item.count / total : 0;
      const dash = frac * this.CIRCUMFERENCE;
      const gap  = this.CIRCUMFERENCE - dash;
      // stroke-dashoffset: full circumference minus accumulated dashes
      const strokeOffset = this.CIRCUMFERENCE - offset;
      offset += dash;
      return {
        label: item.label,
        count: item.count,
        color: this.DONUT_COLORS[i % this.DONUT_COLORS.length],
        dash,
        gap,
        offset: strokeOffset,
      };
    });
  }

  genderSlices(d: InsightsData) {
    return this.buildSlices(d.genderDistribution, d.totalContacts);
  }

  tagSlices(d: InsightsData) {
    return this.buildSlices(
      [
        { label: 'Tagged',   count: d.taggedCount },
        { label: 'Untagged', count: d.untaggedCount },
      ],
      d.totalContacts,
    );
  }
}
