# Session Handoff — Campaign Data Platform
> Last updated: 2026-04-01 (Phase 3 complete) | Read this first at the start of every new session.

---

## Where We Are

**Phase 3 (missing backend routes) is 100% complete.**

All frontend API calls now have matching backend routes. The full API surface is wired end-to-end.

**Total files: 73** (was 71 after Phase 2, +2 new route files this phase).

**Do NOT re-scaffold, re-implement, or re-add any of the below. Jump straight to Phase 4.**

---

## Completed Phases

### Phase 1 — Scaffold (Session 1)
All 64 backend + frontend scaffold files. See `/auto-memory/project_cdp_scaffold.md` for the full inventory.

### Phase 2 — Feature UI (Session 2)
All 5 Angular feature components fully implemented — no stubs remain.
Added: `ShellComponent`, `ToastService`, `DataTableComponent`, `FormatNumberPipe`, `csv-parse.worker.ts`, `generateApiKey.ts` CLI script, `nginx/admin.conf`.

### Phase 3 — Missing Backend Routes (Session 3, this session)

| File | Routes added |
|------|-------------|
| `src/routes/jobs.ts` | `GET /api/jobs` — list 50 recent upload jobs (JWT only) |
| `src/routes/keys.ts` | `GET /api/keys` — list all API keys; `DELETE /api/keys/:id` — deactivate + Redis cache flush |
| `src/routes/index.ts` | Updated to mount `jobsRouter` and `keysRouter` |

---

## Complete API Surface (All Routes)

| Method | Path | Auth | What it does |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | None | Issue JWT for admin portal |
| `POST` | `/api/query` | API key + rate limit | Query contacts with cursor pagination |
| `POST` | `/api/ingest` | JWT + API key + rate limit | Upload CSV/XLSX → queue normaliser job |
| `GET` | `/api/export` | API key + JWT + IP allowlist + rate limit | Stream contacts as CSV |
| `GET` | `/api/status/:jobId` | API key + rate limit | Poll single upload job progress |
| `GET` | `/api/jobs` | JWT only | List 50 recent upload jobs (admin) |
| `GET` | `/api/keys` | JWT only | List all API keys — no hashes (admin) |
| `DELETE` | `/api/keys/:id` | JWT only | Deactivate key + flush Redis cache (admin) |
| `GET` | `/health` | None | `{"api":"ok","db":"ok","redis":"ok"}` |

---

## What to Do Next (Phase 4 — Tests)

### Priority 1: Backend Unit Tests

| Test file | Coverage |
|-----------|----------|
| `src/services/NormaliserService.test.ts` | `normalisePhone()` — +91, leading 0, 10-digit, international; `parseTags()`; `parseBoolean()`; `normaliseRow()` — unmapped columns go to `custom` JSONB |
| `src/services/QueryService.test.ts` | `page_size` capped to platform limit; cursor decode/encode roundtrip |
| `src/db/queries/contacts.test.ts` | Upsert deduplication on `(phone, segment)`; tag `@>` AND filter; tag `&&` ANY filter |

### Priority 2: Backend Integration Tests (supertest)

| Test file | Coverage |
|-----------|----------|
| `src/routes/auth.test.ts` | Valid login → 200 + token; wrong password → 401; missing fields → 400 |
| `src/routes/query.test.ts` | Valid filter → 200 + cursor; missing api key → 401; page_size > cap → capped |
| `src/routes/ingest.test.ts` | Valid upload → 202 + job_id; no file → 400; too large → 413 |
| `src/routes/jobs.test.ts` | No JWT → 401; valid JWT → 200 + array |
| `src/routes/keys.test.ts` | No JWT → 401; list → 200; deactivate → 204 + Redis cache flushed |

> `app.ts` exports the Express app without `.listen()` — import directly into supertest. No port conflicts.

### Priority 3: Angular Component Tests

| Test file | Coverage |
|-----------|----------|
| `query-builder.component.spec.ts` | Form → payload mapping; reset clears store |
| `upload.component.spec.ts` | `canConfirm()` computed; step transitions |
| `data-table.component.spec.ts` | Renders rows; trackById |

---

## How to Run Locally

```bash
docker compose up -d          # Postgres 15 + Redis 7 (healthchecks included)
cp .env.example .env          # Set JWT_SECRET, DB_PASSWORD, etc.
npm install
npm run migrate               # Apply DB schema (knex migrations)
npm run dev                   # API server on :3000
npm run dev:worker            # BullMQ normaliser worker (separate terminal)
curl localhost:3000/health    # → {"api":"ok","db":"ok","redis":"ok"}
```

Create first admin user (run SQL directly after migration):
```sql
INSERT INTO admin_users (email, password_hash)
VALUES ('admin@yourapp.com', '<bcrypt hash of your password>');
```

Create an API key:
```bash
npm run generate:key -- --name "WhatsApp prod" --platform whatsapp
# Prints raw key (copy it) + SQL INSERT to run
```

Angular admin portal (requires Nx):
```bash
npx nx serve admin-portal    # http://localhost:4200
```

---

## Critical Rules (Do Not Break)

1. **Phones → E.164 always.** `NormaliserService.normalisePhone()` handles all formats.
2. **Dedup key = `(phone, segment)`.** Same phone + segment = upsert, never duplicate.
3. **Export STREAMS.** `ExportService` never loads full result into memory.
4. **API keys are bcrypt-hashed.** Raw key never stored. `key_hash` never returned in any response.
5. **Services have zero Express imports.** No `req`/`res`/`next` — fully testable.
6. **Rate limits live only in `src/config/limits.ts`.** Never hardcode in routes.
7. **`app.ts` never calls `.listen()`.** Only `server.ts` does.
8. **HTTP calls go through `QueryApiService`.** Never direct `HttpClient` in components.
9. **All Angular components: `ChangeDetectionStrategy.OnPush` + signals.** No exceptions.
10. **Key deactivation flushes Redis.** Always `redis.del(apikey:platform:<prefix>)` after `active=false` — keys stop working immediately, not after TTL expiry.

---

## Key Files Reference

| File | What it does |
|------|-------------|
| `src/routes/keys.ts` | GET /api/keys; DELETE /api/keys/:id with Redis flush |
| `src/routes/jobs.ts` | GET /api/jobs with ?limit query param |
| `src/routes/index.ts` | All routers mounted — add new routes here |
| `src/db/queries/apiKeys.ts` | `listApiKeys()`, `deactivateApiKey()`, `findApiKeyByPrefix()`, `insertApiKey()` |
| `src/db/queries/uploadJobs.ts` | `listRecentJobs()`, `getJob()`, `updateJobStatus()` |
| `src/config/limits.ts` | Rate limits, page size caps, Redis TTL, cache prefix |
| `libs/api-client/src/lib/query-api.service.ts` | All frontend HTTP calls — `query()`, `ingest()`, `getJobStatus()`, `listJobs()`, `listApiKeys()`, `deactivateApiKey()` |

---

*Updated end of Phase 3 — 2026-04-01. 73 files total.*
