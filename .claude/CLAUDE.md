# CLAUDE.md — Campaign Data Platform
> Project-specific configuration. Global rules live in root `.claude/CLAUDE.md` (always P0).

---

## Project Identity

**What it is:** A backend API + Angular admin portal for uploading, normalising, and querying campaign contact data (phone numbers, emails, tags) at scale (millions of rows).

**Who uses it:**
- Ops team → Admin Portal (upload CSVs, monitor jobs, run queries, export)
- WhatsApp / Email / Calling platforms → API (filter contacts, paginate results)
- Dev team → Scripts (generate/revoke API keys)

**What success looks like:**
- Ops can upload a 150k-row CSV, see it process in the Jobs tab, and query it within minutes
- WhatsApp platform can do `POST /api/query` with cursor-based pagination at 100 req/min without hitting the DB hard
- A 5-lakh row export streams without crashing the server

---

## Tech Stack

### Backend
| Concern | Choice | Why |
|---------|--------|-----|
| Runtime | Node.js 20 | Team familiarity, LTS |
| Framework | Express.js | Minimal, well-understood |
| Language | TypeScript | Strict mode — no `any` |
| Database | PostgreSQL 15 | GIN indexes for `text[]` tags, large scale |
| Cache / Rate limit | Redis 7 | Per-key sliding window limits |
| Queue | BullMQ | Reliable job processing with progress tracking |
| Query builder | Knex.js | Type-safe SQL without full ORM overhead |
| Auth | JWT + bcrypt | Stateless, hashed API keys |
| Process manager | PM2 | Two processes: `cdp-api` + `cdp-worker` |

### Frontend
| Concern | Choice | Why |
|---------|--------|-----|
| Framework | Angular 18 (standalone) | Team familiarity, CDK virtual scroll built-in |
| Monorepo | Nx | Affected builds, shared libs |
| State | Angular Signals | No NgRx needed for this scale |
| UI | Tailwind + bare HTML | No component lib dependency |
| Widget | @angular/elements | Web Component — embeds in any platform |

---

## Architecture: One-Sentence Per Layer

```
Incoming Request
  → Security middleware (helmet/cors/hpp/toobusy)
  → API key auth middleware (resolve platform from hashed key, cache in Redis)
  → Rate limiter (Redis-backed, per platform tier)
  → Route (thin: validate input shape, delegate to service)
  → Service (pure business logic: no req/res, no DB imports)
  → DB query (Knex — contacts.ts / apiKeys.ts)
  → Response
```

**Two PM2 processes — never mix:**
- `cdp-api` → Express HTTP server (`src/server.ts`)
- `cdp-worker` → BullMQ worker (`src/workers/workerBoot.ts`)

---

## Critical Domain Rules (Never Break These)

1. **Phone numbers are always E.164** — `+919876543210`. The normaliser converts all formats. Never store raw input format.
2. **Deduplication is on `(phone, segment)`** — same phone in same segment = upsert, not insert.
3. **API keys are bcrypt-hashed** in the DB. The raw key is shown once at generation and never stored. Cache the resolved platform in Redis for 5 minutes (`apikey:platform:<prefix>`).
4. **CSV export streams** — `ExportService` uses a DB cursor / knex stream. Never buffer a full export into memory.
5. **Worker reads files row-by-row** — `fast-csv` streaming. Never `fs.readFileSync` on upload files.
6. **Rate limits live in `src/config/limits.ts`** — never hardcoded in route files.
7. **Services never import from Express** — no `req`, `res`, `next` in any service file. Testability is mandatory.
8. **`app.ts` ≠ `server.ts`** — `app.ts` exports the Express app (no listen). `server.ts` calls `app.listen`. Tests import `app.ts` directly.
9. **All list queries are paginated** — cursor-based for contacts, no unbounded `SELECT *`.
10. **IP allowlist on export route** — `ADMIN_IP_ALLOWLIST` env var. JWT alone is not enough for `/api/export`.

---

## Key Files Map

```
src/
├── config/
│   ├── env.ts          ← All env vars validated at startup (fail fast)
│   ├── limits.ts       ← Rate limit tiers and page size caps
│   └── db.ts           ← Knex config (pool min/max)
│
├── middleware/
│   ├── security.ts     ← helmet, cors, hpp, toobusy, body limits
│   ├── apiKeyAuth.ts   ← Hash prefix lookup → platform resolution
│   ├── jwtAuth.ts      ← JWT decode + verify (admin + export routes)
│   ├── rateLimiter.ts  ← Per-platform Redis-backed limiter
│   ├── ipAllowlist.ts  ← Export route IP guard
│   └── errorHandler.ts ← Central error formatter
│
├── routes/
│   ├── query.ts        ← POST /api/query
│   ├── ingest.ts       ← POST /api/ingest (multipart)
│   ├── export.ts       ← GET  /api/export (triple-guarded)
│   └── status.ts       ← GET  /api/status/:jobId
│
├── services/
│   ├── QueryService.ts      ← Filter + cursor pagination
│   ├── NormaliserService.ts ← Phone E.164, tag parsing, field mapping
│   ├── ExportService.ts     ← Streaming CSV from DB cursor
│   └── JobService.ts        ← BullMQ enqueue + progress tracking
│
├── workers/
│   ├── normaliserWorker.ts  ← BullMQ processor: read → normalise → upsert
│   └── workerBoot.ts        ← Worker entry point (PM2 starts this)
│
├── db/
│   ├── knex.ts              ← Knex singleton
│   ├── redis.ts             ← ioredis singleton
│   ├── migrations/          ← Numbered forward-only migrations
│   └── queries/
│       ├── contacts.ts      ← All SQL for contacts table
│       └── apiKeys.ts       ← API key lookup and management
│
└── types/
    ├── express.d.ts    ← Extends Request: platform, apiKeyPrefix
    └── models.ts       ← ContactRecord, FilterPayload, UploadJob, etc.
```

---

## Frontend Key Files Map

```
apps/
├── admin-portal/
│   └── src/app/
│       ├── core/auth/          ← JWT login, guard, interceptor
│       ├── core/api/           ← QueryApiService (no raw HttpClient in features)
│       ├── features/upload/    ← Drag-drop + field mapping (3-step wizard)
│       ├── features/query/     ← Filter form + virtual-scroll results table
│       ├── features/jobs/      ← Upload job monitoring
│       └── features/keys/      ← API key management (read-only in UI)
│
└── embed-widget/
    └── src/app/
        └── filter-widget.component.ts  ← Angular Element (Web Component)

libs/
├── data-models/    ← Shared TS interfaces: ContactRecord, FilterPayload, etc.
├── api-client/     ← QueryApiService, typed HTTP wrappers
└── ui-components/  ← Shared Angular components (tag-input, data-table, etc.)
```

---

## Ambiguity Triggers for This Project

Always ask before assuming on these:
- "Update a contact" → Upsert on `(phone, segment)` or different logic?
- "Add a new platform" → New rate limit tier or reuse existing?
- "Validate the CSV" → Client-side preview only or server-side schema check too?
- "Filter by date" → `created_at`? `updated_at`? Both?
- "Delete contacts" → Hard delete or soft delete (`opt_out_*` flags)?
- "Admin action" → JWT-authed or API-key-authed? Both?

---

## Class Architecture Decision

**Backend is function-based today** (Express middleware = arrow functions, services = plain classes). Agreed approach per CLAUDE.md Tier 4: services use **class instances** with no inheritance needed — each service is standalone (SRP). No base service required at this scale.

If a service grows beyond 150 lines or starts duplicating logic → extract to a shared helper and flag for refactor review.

---

*Campaign Data Platform CLAUDE.md — synced with BACKEND.md + FRONTEND.md + HOW_TO_USE.md*
