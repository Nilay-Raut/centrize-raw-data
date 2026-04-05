# Campaign Data Platform — Frontend Implementation Guide

> Angular 18 · Standalone Components · Signals · CDK Virtual Scroll  
> Two apps: Admin Portal + Embeddable Widget (Web Component)

---

## Table of Contents

1. [Frontend Architecture Decision](#1-frontend-architecture-decision)
2. [Nx Monorepo Setup](#2-nx-monorepo-setup)
3. [Shared Libraries](#3-shared-libraries)
4. [Admin Portal — App Structure](#4-admin-portal--app-structure)
5. [Performance Techniques](#5-performance-techniques)
6. [Upload Flow — UI](#6-upload-flow--ui)
7. [Query Builder Component](#7-query-builder-component)
8. [Data Table with Virtual Scroll](#8-data-table-with-virtual-scroll)
9. [Embedded Widget — Web Component](#9-embedded-widget--web-component)
10. [API Client — Auto-generated Service](#10-api-client--auto-generated-service)
11. [Auth — JWT Handling](#11-auth--jwt-handling)
12. [Environment Configuration](#12-environment-configuration)
13. [Angular Signals — State Management](#13-angular-signals--state-management)
14. [Error Handling & Toasts](#14-error-handling--toasts)
15. [Building & Deploying](#15-building--deploying)
16. [Component Checklist](#16-component-checklist)

---

## 1. Frontend Architecture Decision

### Why Angular (not Next.js) for this project

| Factor | Angular | Next.js |
|--------|---------|---------|
| Team experience | Existing — no ramp-up | New framework, 2–3 month cost |
| TypeScript | First-class, opinionated | Good but flexible |
| Embeddable widget | Angular Elements (Web Component) | Requires React runtime in host |
| Large data tables | CDK Virtual Scroll built-in | Third-party needed |
| Change detection | Signals + OnPush = minimal re-renders | Fine with memo/useMemo |
| SEO | Not needed (internal tool) | Main advantage of Next — irrelevant here |
| Auth patterns | Guards + interceptors | Middleware |

**Conclusion:** Stick with Angular. The performance techniques below close any gap with Next.js for this use case, and you ship in weeks not months.

### Two separate deployable apps

```
apps/
├── admin-portal/     → https://admin.yourapp.com
│                        Internal ops: upload data, monitor jobs, query builder
│
└── embed-widget/     → loaded as <script> tag in WhatsApp/Email platforms
                         Compiled as Web Component — no Angular runtime needed in host
```

---

## 2. Nx Monorepo Setup

```bash
# Create the Nx workspace
npx create-nx-workspace@latest campaign-data-platform \
  --preset=angular \
  --appName=admin-portal \
  --style=scss \
  --routing=true \
  --nxCloud=false

cd campaign-data-platform

# Add second Angular app (embed widget)
nx generate @nx/angular:application embed-widget \
  --routing=false \
  --style=scss

# Add shared libraries
nx generate @nx/js:library data-models --directory=libs/data-models
nx generate @nx/js:library api-client --directory=libs/api-client
nx generate @nx/angular:library ui-components --directory=libs/ui-components
```

### Nx benefits for a small team

- `nx affected:build` — only rebuilds projects changed since last commit
- `nx affected:test` — only runs tests for affected projects
- `nx graph` — visual dependency graph
- Shared TypeScript types between Angular and the Express backend

---

## 3. Shared Libraries

### `libs/data-models` — shared TypeScript interfaces

These are identical to the backend types — import from this lib everywhere.

```typescript
// libs/data-models/src/lib/models.ts

export interface ContactRecord {
  id: string;
  phone: string;
  email?: string;
  name?: string;
  language: string;
  tags: string[];
  segment: string;
  custom: Record<string, unknown>;
  opt_out_whatsapp: boolean;
  opt_out_email: boolean;
  opt_out_call: boolean;
  created_at: string;
  updated_at: string;
}

export interface FilterPayload {
  filters: {
    segment?: string;
    tags?: string[];
    tags_any?: string[];
    opt_out_whatsapp?: boolean;
    opt_out_email?: boolean;
    opt_out_call?: boolean;
    language?: string;
  };
  page_size: number;
  cursor?: string;
  fields?: string[];
}

export interface QueryResult {
  data: Partial<ContactRecord>[];
  next_cursor: string | null;
  total_count: number;
  page_size: number;
}

export interface UploadJob {
  id: string;
  filename: string;
  status: 'queued' | 'processing' | 'done' | 'failed';
  total_rows: number;
  processed_rows: number;
  failed_rows: number;
  segment: string;
  created_at: string;
}

export type Platform = 'whatsapp' | 'email' | 'admin' | 'csv_export';
```

---

## 4. Admin Portal — App Structure

```
apps/admin-portal/src/
├── app/
│   ├── core/
│   │   ├── auth/
│   │   │   ├── auth.service.ts          # JWT login, refresh, storage
│   │   │   ├── auth.guard.ts            # Protect routes
│   │   │   └── auth.interceptor.ts      # Attach JWT to every request
│   │   ├── api/
│   │   │   └── api.service.ts           # Base HTTP wrapper
│   │   └── toast/
│   │       └── toast.service.ts         # Global notifications
│   │
│   ├── features/
│   │   ├── upload/
│   │   │   ├── upload.component.ts      # Drag-drop + field mapping UI
│   │   │   └── upload-progress.component.ts
│   │   ├── query/
│   │   │   ├── query-builder.component.ts
│   │   │   └── results-table.component.ts
│   │   ├── jobs/
│   │   │   └── jobs-list.component.ts   # Monitor upload jobs
│   │   └── keys/
│   │       └── api-keys.component.ts    # Manage platform API keys
│   │
│   ├── shared/
│   │   ├── components/
│   │   │   ├── data-table/              # Virtual-scroll table
│   │   │   ├── file-dropzone/           # Drag-drop upload
│   │   │   └── tag-input/               # Multi-tag input
│   │   └── pipes/
│   │       └── format-number.pipe.ts    # 150000 → 1,50,000 (Indian format)
│   │
│   ├── app.routes.ts
│   └── app.config.ts
```

### `app.routes.ts` — lazy-loaded routes

```typescript
import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component')
      .then(m => m.LoginComponent),
  },
  {
    path: '',
    canActivate: [authGuard],
    children: [
      {
        path: 'upload',
        loadComponent: () => import('./features/upload/upload.component')
          .then(m => m.UploadComponent),
      },
      {
        path: 'query',
        loadComponent: () => import('./features/query/query-builder.component')
          .then(m => m.QueryBuilderComponent),
      },
      {
        path: 'jobs',
        loadComponent: () => import('./features/jobs/jobs-list.component')
          .then(m => m.JobsListComponent),
      },
      {
        path: '',
        redirectTo: 'query',
        pathMatch: 'full',
      },
    ],
  },
];
```

### `app.config.ts`

```typescript
import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withRouterConfig } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './core/auth/auth.interceptor';
import { errorInterceptor } from './core/api/error.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    // zoneless change detection — better performance with signals
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withRouterConfig({ onSameUrlNavigation: 'reload' })),
    provideHttpClient(
      withInterceptors([authInterceptor, errorInterceptor])
    ),
  ],
};
```

---

## 5. Performance Techniques

These four techniques eliminate the main Angular performance pain points when rendering large datasets.

### 5.1 Signals + OnPush — zero unnecessary re-renders

```typescript
import { Component, signal, computed, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-results-table',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,  // Never remove this
  template: `...`,
})
export class ResultsTableComponent {
  // Signal-based state — Angular only re-renders when these change
  contacts = signal<ContactRecord[]>([]);
  isLoading = signal(false);
  totalCount = signal(0);
  cursor = signal<string | null>(null);

  // Computed value — recalculated only when contacts() changes
  hasData = computed(() => this.contacts().length > 0);
  hasMore = computed(() => this.cursor() !== null);

  loadMore() {
    this.isLoading.set(true);
    this.queryService.query({ cursor: this.cursor() }).subscribe(result => {
      this.contacts.update(prev => [...prev, ...result.data]);
      this.cursor.set(result.next_cursor);
      this.isLoading.set(false);
    });
  }
}
```

### 5.2 `@defer` — load heavy components only when needed

```html
<!-- query-builder.component.html -->

<!-- Filter form loads immediately -->
<app-filter-form (onQuery)="runQuery($event)" />

<!-- Results table + virtual scroll only renders when user has results -->
@defer (when hasData()) {
  <app-results-table [contacts]="contacts()" />
} @placeholder {
  <div class="empty-state">Run a query to see results</div>
} @loading (minimum 200ms) {
  <app-skeleton-table />
}
```

### 5.3 CDK Virtual Scroll — render 50k+ rows without lag

```typescript
// Install: npm install @angular/cdk

import { ScrollingModule } from '@angular/cdk/scrolling';

@Component({
  standalone: true,
  imports: [ScrollingModule],
  template: `
    <cdk-virtual-scroll-viewport itemSize="48" style="height: 600px;">
      <div *cdkVirtualFor="let contact of contacts(); trackBy: trackById"
           class="table-row">
        <span>{{ contact.name }}</span>
        <span>{{ contact.phone }}</span>
        <span>{{ contact.segment }}</span>
      </div>
    </cdk-virtual-scroll-viewport>
  `,
})
export class ResultsTableComponent {
  contacts = input.required<ContactRecord[]>();
  trackById = (_: number, c: ContactRecord) => c.id;
}
```

> **Why this matters:** Without virtual scroll, rendering 50,000 rows creates 50,000 DOM nodes. The page freezes. With virtual scroll, only ~15 rows are in the DOM at any time, regardless of data size.

### 5.4 Web Worker for CSV parsing

```typescript
// apps/admin-portal/src/app/features/upload/csv-parse.worker.ts
/// <reference lib="webworker" />
import Papa from 'papaparse';

addEventListener('message', ({ data }) => {
  const result = Papa.parse(data.csvText, { header: true, skipEmptyLines: true });
  postMessage({ headers: result.meta.fields, preview: result.data.slice(0, 5) });
});

// In upload.component.ts
const worker = new Worker(new URL('./csv-parse.worker', import.meta.url));
worker.postMessage({ csvText: fileContent });
worker.onmessage = ({ data }) => {
  this.csvHeaders.set(data.headers);
  this.previewRows.set(data.preview);
};
```

---

## 6. Upload Flow — UI

The upload flow has three steps: file selection → field mapping → confirm.

```typescript
// apps/admin-portal/src/app/features/upload/upload.component.ts
import { Component, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';

type UploadStep = 'select' | 'map' | 'confirm' | 'uploading' | 'done';

// Standard fields the platform understands
const STANDARD_FIELDS = [
  'phone', 'email', 'name', 'language',
  'tags', 'opt_out_whatsapp', 'opt_out_email', 'skip',
];

@Component({
  selector: 'app-upload',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './upload.component.html',
})
export class UploadComponent {
  step = signal<UploadStep>('select');
  file = signal<File | null>(null);
  csvHeaders = signal<string[]>([]);
  previewRows = signal<Record<string, string>[]>([]);
  fieldMapping = signal<Record<string, string>>({});
  segment = signal('');
  jobId = signal<string | null>(null);
  progress = signal(0);

  // Only enable confirm if phone field is mapped
  canConfirm = computed(() =>
    Object.values(this.fieldMapping()).includes('phone') && this.segment().length > 0
  );

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const f = input.files?.[0];
    if (!f) return;
    this.file.set(f);

    const reader = new FileReader();
    reader.onload = (e) => {
      // Parse in Web Worker — off main thread
      const worker = new Worker(new URL('./csv-parse.worker', import.meta.url));
      worker.postMessage({ csvText: e.target?.result });
      worker.onmessage = ({ data }) => {
        this.csvHeaders.set(data.headers);
        this.previewRows.set(data.preview);
        this.step.set('map');
      };
    };
    reader.readAsText(f);
  }

  async submit() {
    const formData = new FormData();
    formData.append('file', this.file()!);
    formData.append('segment', this.segment());
    formData.append('field_mapping', JSON.stringify(this.fieldMapping()));

    this.step.set('uploading');

    this.http.post<{ job_id: string }>('/api/ingest', formData).subscribe({
      next: (res) => {
        this.jobId.set(res.job_id);
        this.step.set('done');
        this.pollJobProgress(res.job_id);
      },
      error: () => this.step.set('select'),
    });
  }

  private pollJobProgress(jobId: string) {
    const interval = setInterval(() => {
      this.http.get<{ processed_rows: number; total_rows: number; status: string }>(
        `/api/status/${jobId}`
      ).subscribe(job => {
        this.progress.set(Math.round((job.processed_rows / job.total_rows) * 100));
        if (job.status === 'done' || job.status === 'failed') clearInterval(interval);
      });
    }, 2000);
  }
}
```

---

## 7. Query Builder Component

```typescript
// apps/admin-portal/src/app/features/query/query-builder.component.ts
import { Component, signal, computed, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { QueryApiService } from '../../core/api/query-api.service';
import { ContactRecord, FilterPayload } from '@campaign-data/data-models';

@Component({
  selector: 'app-query-builder',
  standalone: true,
  imports: [ReactiveFormsModule],
  templateUrl: './query-builder.component.html',
})
export class QueryBuilderComponent {
  private fb = inject(FormBuilder);
  private queryApi = inject(QueryApiService);

  filterForm = this.fb.group({
    segment:             [''],
    tags:                [''],          // comma-separated input
    opt_out_whatsapp:    [null],
    opt_out_email:       [null],
    language:            [''],
    page_size:           [1000],
  });

  contacts = signal<ContactRecord[]>([]);
  cursor   = signal<string | null>(null);
  total    = signal(0);
  loading  = signal(false);
  hasData  = computed(() => this.contacts().length > 0);
  hasMore  = computed(() => this.cursor() !== null);

  search(resetPage = true) {
    if (resetPage) {
      this.contacts.set([]);
      this.cursor.set(null);
    }
    this.loading.set(true);

    const v = this.filterForm.value;
    const payload: FilterPayload = {
      filters: {
        segment:           v.segment || undefined,
        tags:              v.tags ? v.tags.split(',').map(t => t.trim()).filter(Boolean) : undefined,
        opt_out_whatsapp:  v.opt_out_whatsapp ?? undefined,
        opt_out_email:     v.opt_out_email ?? undefined,
        language:          v.language || undefined,
      },
      page_size: v.page_size ?? 1000,
      cursor: resetPage ? undefined : this.cursor() ?? undefined,
    };

    this.queryApi.query(payload).subscribe({
      next: (result) => {
        this.contacts.update(prev => resetPage ? result.data : [...prev, ...result.data]);
        this.cursor.set(result.next_cursor);
        this.total.set(result.total_count);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  loadMore() {
    this.search(false);
  }
}
```

---

## 8. Data Table with Virtual Scroll

```typescript
// apps/admin-portal/src/app/shared/components/data-table/data-table.component.ts
import { Component, input } from '@angular/core';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { ContactRecord } from '@campaign-data/data-models';
import { FormatNumberPipe } from '../../pipes/format-number.pipe';

const VISIBLE_COLUMNS = ['name', 'phone', 'email', 'segment', 'tags'];

@Component({
  selector: 'app-data-table',
  standalone: true,
  imports: [ScrollingModule, FormatNumberPipe],
  template: `
    <div class="table-header">
      <span class="total-count">
        Showing {{ contacts().length | formatNumber }} of {{ total() | formatNumber }} records
      </span>
    </div>

    <div class="table-wrapper">
      <div class="table-head-row">
        @for (col of columns; track col) {
          <span class="col-{{ col }}">{{ col }}</span>
        }
      </div>

      <cdk-virtual-scroll-viewport itemSize="48" class="table-scroll">
        <div
          *cdkVirtualFor="let contact of contacts(); trackBy: trackById; bufferPx: 200"
          class="table-row"
        >
          <span class="col-name">{{ contact.name || '—' }}</span>
          <span class="col-phone">{{ contact.phone }}</span>
          <span class="col-email">{{ contact.email || '—' }}</span>
          <span class="col-segment">{{ contact.segment }}</span>
          <span class="col-tags">
            @for (tag of contact.tags; track tag) {
              <span class="tag-pill">{{ tag }}</span>
            }
          </span>
        </div>
      </cdk-virtual-scroll-viewport>
    </div>
  `,
})
export class DataTableComponent {
  contacts = input.required<ContactRecord[]>();
  total    = input.required<number>();
  columns  = VISIBLE_COLUMNS;
  trackById = (_: number, c: ContactRecord) => c.id;
}
```

---

## 9. Embedded Widget — Web Component

The embed widget is compiled as a standard Web Component using `@angular/elements`. Any platform (WhatsApp, Email) drops in a `<script>` tag and uses `<cdp-filter-widget>`.

### Setup

```bash
nx generate @nx/angular:application embed-widget --routing=false
npm install @angular/elements
```

### `apps/embed-widget/src/main.ts`

```typescript
import { createApplication } from '@angular/platform-browser';
import { createCustomElement } from '@angular/elements';
import { appConfig } from './app/app.config';
import { FilterWidgetComponent } from './app/filter-widget.component';

(async () => {
  const app = await createApplication(appConfig);
  const FilterElement = createCustomElement(FilterWidgetComponent, { injector: app.injector });
  customElements.define('cdp-filter-widget', FilterElement);
})();
```

### `FilterWidgetComponent`

```typescript
import { Component, input, output, signal, computed } from '@angular/core';
import { FilterPayload, QueryResult } from '@campaign-data/data-models';
import { QueryApiService } from './query-api.service';

@Component({
  selector: 'cdp-filter-widget',
  standalone: true,
  template: `
    <div class="cdp-widget">
      <div class="cdp-filters">
        <input placeholder="Segment" #segInput />
        <input placeholder="Tags (comma separated)" #tagsInput />
        <button (click)="search(segInput.value, tagsInput.value)" [disabled]="loading()">
          {{ loading() ? 'Loading...' : 'Preview' }}
        </button>
      </div>

      @if (previewCount() > 0) {
        <div class="cdp-summary">
          <span class="cdp-count">{{ previewCount() }} contacts match</span>
          <button class="cdp-use-btn" (click)="useData()">Use this data</button>
        </div>
      }

      @if (errorMsg()) {
        <div class="cdp-error">{{ errorMsg() }}</div>
      }
    </div>
  `,
})
export class FilterWidgetComponent {
  // Inputs come from the host platform as HTML attributes
  apiKey  = input.required<string>();   // <cdp-filter-widget api-key="cdp_...">
  baseUrl = input.required<string>();   // <cdp-filter-widget base-url="https://...">

  // Output event — host platform listens for this
  dataSelected = output<{ filter: FilterPayload; count: number }>();

  loading     = signal(false);
  previewCount = signal(0);
  errorMsg    = signal('');
  lastFilter  = signal<FilterPayload | null>(null);

  constructor(private queryApi: QueryApiService) {}

  search(segment: string, tagsRaw: string) {
    if (!segment) { this.errorMsg.set('Segment is required'); return; }
    this.errorMsg.set('');
    this.loading.set(true);

    const payload: FilterPayload = {
      filters: {
        segment,
        tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim()) : undefined,
      },
      page_size: 1,    // Only need count for preview
      fields: ['id'],  // Minimal data
    };

    this.queryApi.query(payload, this.baseUrl(), this.apiKey()).subscribe({
      next: (r) => {
        this.previewCount.set(r.total_count);
        this.lastFilter.set(payload);
        this.loading.set(false);
      },
      error: () => {
        this.errorMsg.set('Query failed. Check your connection.');
        this.loading.set(false);
      },
    });
  }

  useData() {
    const filter = this.lastFilter();
    if (!filter) return;
    // Emits to the host platform
    this.dataSelected.emit({ filter, count: this.previewCount() });
  }
}
```

### How platforms use the widget

```html
<!-- In the WhatsApp platform's dashboard -->
<script src="https://cdn.yourapp.com/cdp-widget.js"></script>

<cdp-filter-widget
  api-key="cdp_abc123..."
  base-url="https://api.yourapp.com"
></cdp-filter-widget>

<script>
  document.querySelector('cdp-filter-widget')
    .addEventListener('dataSelected', (e) => {
      // e.detail = { filter: FilterPayload, count: 48200 }
      // Platform uses this to start the campaign
      startWhatsAppCampaign(e.detail);
    });
</script>
```

### Build the widget

```bash
nx build embed-widget --configuration=production

# Output: dist/apps/embed-widget/
# Upload cdp-widget.js to S3/CDN
```

---

## 10. API Client — Auto-generated Service

Instead of writing HTTP services manually, generate them from your OpenAPI spec. This means zero drift between backend and frontend.

```bash
# Install generator
npm install -D @openapitools/openapi-generator-cli

# Add to package.json scripts:
# "generate:api": "openapi-generator-cli generate -i http://localhost:3000/api-docs/json -g typescript-angular -o libs/api-client/src/generated"

npm run generate:api
```

### Manual service (use until OpenAPI is set up)

```typescript
// libs/api-client/src/lib/query-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FilterPayload, QueryResult, UploadJob } from '@campaign-data/data-models';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class QueryApiService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  query(payload: FilterPayload, baseUrl?: string, apiKey?: string): Observable<QueryResult> {
    const url = `${baseUrl ?? this.base}/api/query`;
    const headers = apiKey ? { 'X-Api-Key': apiKey } : {};
    return this.http.post<QueryResult>(url, payload, { headers });
  }

  getJobStatus(jobId: string): Observable<UploadJob> {
    return this.http.get<UploadJob>(`${this.base}/api/status/${jobId}`);
  }
}
```

---

## 11. Auth — JWT Handling

```typescript
// apps/admin-portal/src/app/core/auth/auth.service.ts
import { Injectable, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthService {
  isLoggedIn = signal(false);

  constructor(private http: HttpClient, private router: Router) {
    this.isLoggedIn.set(!!this.getToken());
  }

  login(credentials: { email: string; password: string }) {
    return this.http.post<{ token: string }>('/api/auth/login', credentials)
      .pipe(tap(({ token }) => {
        // sessionStorage — clears on tab close, safer than localStorage
        sessionStorage.setItem('cdp_token', token);
        this.isLoggedIn.set(true);
      }));
  }

  logout() {
    sessionStorage.removeItem('cdp_token');
    this.isLoggedIn.set(false);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return sessionStorage.getItem('cdp_token');
  }
}
```

```typescript
// apps/admin-portal/src/app/core/auth/auth.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const token = auth.getToken();

  if (!token) return next(req);

  return next(req.clone({
    setHeaders: { Authorization: `Bearer ${token}` },
  }));
};
```

```typescript
// apps/admin-portal/src/app/core/auth/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn()) return true;
  return router.createUrlTree(['/login']);
};
```

---

## 12. Environment Configuration

```typescript
// apps/admin-portal/src/environments/environment.ts  (development)
export const environment = {
  production: false,
  apiUrl: 'http://localhost:3000',
};

// apps/admin-portal/src/environments/environment.prod.ts
export const environment = {
  production: true,
  apiUrl: 'https://api.yourapp.com',
};
```

```json
// angular.json — environment file swap on build
"fileReplacements": [
  {
    "replace": "src/environments/environment.ts",
    "with": "src/environments/environment.prod.ts"
  }
]
```

---

## 13. Angular Signals — State Management

For this project, Angular Signals are sufficient — no NgRx needed. Here's the pattern for shared state.

```typescript
// apps/admin-portal/src/app/core/state/contacts.store.ts
import { Injectable, signal, computed } from '@angular/core';
import { ContactRecord, FilterPayload } from '@campaign-data/data-models';
import { QueryApiService } from '../api/query-api.service';

@Injectable({ providedIn: 'root' })
export class ContactsStore {
  // State
  private _contacts = signal<ContactRecord[]>([]);
  private _loading   = signal(false);
  private _cursor    = signal<string | null>(null);
  private _total     = signal(0);
  private _filter    = signal<FilterPayload | null>(null);

  // Public read-only
  readonly contacts = this._contacts.asReadonly();
  readonly loading  = this._loading.asReadonly();
  readonly total    = this._total.asReadonly();
  readonly hasMore  = computed(() => this._cursor() !== null);
  readonly isEmpty  = computed(() => !this._loading() && this._contacts().length === 0);

  constructor(private queryApi: QueryApiService) {}

  search(filter: FilterPayload) {
    this._filter.set(filter);
    this._contacts.set([]);
    this._cursor.set(null);
    this._loadPage();
  }

  loadNextPage() {
    if (!this.hasMore() || this._loading()) return;
    this._loadPage();
  }

  reset() {
    this._contacts.set([]);
    this._cursor.set(null);
    this._total.set(0);
    this._filter.set(null);
  }

  private _loadPage() {
    const filter = this._filter();
    if (!filter) return;

    this._loading.set(true);
    this.queryApi.query({ ...filter, cursor: this._cursor() ?? undefined })
      .subscribe({
        next: (result) => {
          this._contacts.update(prev => [...prev, ...result.data as ContactRecord[]]);
          this._cursor.set(result.next_cursor);
          this._total.set(result.total_count);
          this._loading.set(false);
        },
        error: () => this._loading.set(false),
      });
  }
}
```

---

## 14. Error Handling & Toasts

```typescript
// apps/admin-portal/src/app/core/api/error.interceptor.ts
import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ToastService } from '../toast/toast.service';
import { AuthService } from '../auth/auth.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const toast = inject(ToastService);
  const auth  = inject(AuthService);

  return next(req).pipe(
    catchError((err) => {
      if (err.status === 401) {
        auth.logout();
        toast.error('Session expired. Please log in again.');
      } else if (err.status === 429) {
        toast.warning(`Rate limit hit. Retry after ${err.error.retry_after}s.`);
      } else if (err.status === 503) {
        toast.error('Server is busy. Please try again in a moment.');
      } else if (err.status >= 500) {
        toast.error('Server error. The team has been notified.');
      }
      return throwError(() => err);
    })
  );
};
```

---

## 15. Building & Deploying

### Development

```bash
# Start both API and admin portal
nx serve admin-portal    # http://localhost:4200
# (Run Express API separately on port 3000)

# Build everything
nx build admin-portal --configuration=production
nx build embed-widget --configuration=production
```

### CI/CD — GitHub Actions

```yaml
# .github/workflows/frontend.yml
name: Build and deploy frontend

on:
  push:
    branches: [main]
    paths: ['apps/**', 'libs/**']

jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - run: npm ci

      - name: Build affected only
        run: npx nx affected:build --base=HEAD~1 --configuration=production

      - name: Deploy admin portal to EC2
        run: |
          rsync -avz dist/apps/admin-portal/ \
            ${{ secrets.EC2_USER }}@${{ secrets.EC2_HOST }}:/var/www/admin/

      - name: Upload widget to S3
        run: |
          aws s3 sync dist/apps/embed-widget/ s3://${{ secrets.S3_BUCKET }}/widget/ \
            --cache-control "max-age=86400"
```

### nginx config for admin portal

```nginx
server {
    listen 443 ssl;
    server_name admin.yourapp.com;

    root /var/www/admin;
    index index.html;

    # Angular routing — all paths serve index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache assets aggressively (they have content hashes in filename)
    location ~* \.(js|css|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

---

## 16. Component Checklist

Before shipping any component, verify:

- [ ] `ChangeDetectionStrategy.OnPush` is set
- [ ] State uses `signal()` not class properties
- [ ] Large lists use `cdk-virtual-scroll-viewport`
- [ ] Heavy sections use `@defer`
- [ ] `trackBy` is set on all `*ngFor` / `*cdkVirtualFor`
- [ ] HTTP calls go through a service, never directly in the component
- [ ] Error states are handled (empty state, error message, retry button)
- [ ] Loading state shows a skeleton/spinner
- [ ] No `any` types — all data uses interfaces from `@campaign-data/data-models`
