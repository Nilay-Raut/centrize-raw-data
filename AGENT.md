# AGENT.md — AI Agent Collaboration Guide
# Campaign Data Platform

> This file defines how AI agents (Claude, Copilot, etc.) should work in this project.
> Every developer on the team should read this. Every AI agent must read this before touching any file.

---

## 1. Mandatory Pre-Work (Agent Must Do This First)

Before generating any code or making any change, the agent must:

1. **Read `.claude/CLAUDE.md`** — contains critical domain rules specific to this project (phone normalisation, API key hashing, streaming export, deduplication logic). Violating these causes silent data bugs that are hard to find.
2. **Read `CONTRIBUTING.md`** — understand the code standards, naming conventions, and architecture rules.
3. **Read the relevant source file** (if modifying an existing file) — understand what's already there before adding to it.
4. **Check `src/types/models.ts`** before creating any new interface or type — avoid duplication.
5. **Check `src/config/limits.ts`** before hardcoding any number related to rate limits or page sizes.

---

## 2. What the Agent Can Do Autonomously

These actions are safe for the agent to take without asking:

- Reading any file in the repository
- Creating new files in the defined folder structure (see `.claude/CLAUDE.md`)
- Refactoring within a single file (renaming, extracting functions, fixing types)
- Adding or fixing TypeScript types
- Writing unit tests for existing services
- Updating documentation and comments
- Generating migration files for schema changes (but human reviews before running)
- Adding new query functions to `src/db/queries/` that follow the existing pattern

---

## 3. What the Agent Must Ask Before Doing

Stop and ask the developer before taking these actions:

| Action | Why it needs approval |
|--------|----------------------|
| Adding a new API endpoint | Affects rate limit tier assignment, CORS, auth middleware chain |
| Changing the contacts table schema | Migration affects live data — must be reviewed |
| Modifying `src/config/limits.ts` | Rate limit changes affect all active platforms |
| Changing `src/middleware/security.ts` | Security changes require human review |
| Changing how phone numbers are normalised | Affects deduplication — wrong normalisation creates duplicates |
| Changing the `(phone, segment)` unique constraint logic | Core dedup logic — silent bugs if wrong |
| Adding a new platform tier | Business decision, not just a config change |
| Changing how API keys are hashed or verified | Auth regression risk |
| Modifying the BullMQ job structure | Worker may silently fail on old queued jobs |
| Touching `/api/export` middleware chain | Export route has 3 guards — removing any breaks security |

---

## 4. Context to Give the Agent at the Start of Each Session

Paste this at the top of your first message when starting a new session:

```
Context for this session:
- Project: Campaign Data Platform (campaign-data-platform/)
- Stack: Express.js + TypeScript + PostgreSQL 15 + Redis 7 + BullMQ (backend)
          Angular 18 + Nx + Signals (frontend)
- I am working on: [describe the specific task]
- Files I expect to change: [list the files]
- Constraints: [any deadline, performance target, or breaking-change concern]
```

The more context you give, the fewer clarifying questions the agent needs to ask.

---

## 5. Critical Domain Rules the Agent Must Know

These are non-negotiable. The agent must apply them without being reminded:

### Phone Numbers
- Always store as E.164 (`+919876543210`)
- The normaliser (`NormaliserService.normalisePhone()`) converts all input formats
- Never write raw user input to the `phone` column
- `+91` prefix for Indian numbers; use actual country code for others

### API Keys
- Keys are **bcrypt-hashed** in the `api_keys` table
- The raw key (`cdp_...`) is **never stored** — shown once at generation, done
- Key prefix (first 8 chars) is stored for lookup (prefix → hash → bcrypt compare)
- Redis caches resolved platform: `apikey:platform:<prefix>` with 5-minute TTL
- Revocation = `SET active = false` + `redis-cli DEL "apikey:platform:<prefix>"`

### Deduplication
- Contacts are unique on `(phone, segment)`
- Uploading the same phone to the same segment = **upsert**, not duplicate insert
- Different segments = different rows (same phone can be in many segments)

### Streaming
- The `ExportService` must stream — never collect rows into an array
- The normaliser worker must read CSV row-by-row using `fast-csv` streaming
- Any export or ingest that loads full data into memory is a bug

### Services
- Services are plain TypeScript classes
- They import from `src/db/queries/` and `ioredis` — never from Express
- They throw `AppError` subclasses — never send HTTP responses
- They are tested independently of Express

---

## 6. Code Flow the Agent Must Follow (Backend Feature Addition)

When adding a new backend feature, always follow this flow:

```
1. Define/extend type in src/types/models.ts (if new data shape needed)
2. Write the DB query in src/db/queries/<domain>.ts
3. Write the service method in src/services/<Feature>Service.ts
4. Write the route in src/routes/<feature>.ts (thin — validate, delegate, respond)
5. Mount the router in src/routes/index.ts
6. Apply correct middleware in the route file (apiKeyAuth, rateLimiter, jwtAuth)
7. Write tests: service test + route integration test
8. Update .env.example if a new env var is needed
```

Never skip steps. Never merge steps (e.g., don't query the DB inside a route).

---

## 7. Code Flow the Agent Must Follow (Angular Feature Addition)

```
1. Add/extend interface in libs/data-models if new API response shape
2. Add HTTP method to libs/api-client/QueryApiService (or relevant service)
3. Create component in apps/admin-portal/src/app/features/<feature>/
4. Apply ChangeDetectionStrategy.OnPush + signal() state
5. Use @defer for heavy sections, cdk-virtual-scroll for long lists
6. Register the route in apps/admin-portal/src/app/app.routes.ts (lazy-loaded)
```

---

## 8. Verification the Agent Must Run After Every Code Change

Before declaring a task complete, the agent must:

```bash
# Backend
npm run lint         # 0 errors
npx tsc --noEmit    # 0 type errors
npm test             # All tests pass

# Frontend (from Nx root)
nx lint admin-portal
nx build admin-portal --configuration=production
```

If any check fails, fix it before reporting done. A task is only done when all checks pass.

---

## 9. What the Agent Must Never Do

- Never write raw SQL string concatenation — always parameterised knex queries
- Never put business logic in a route file
- Never import Express types (`Request`, `Response`) inside a service
- Never add `console.log` in production code — use the structured logger
- Never hardcode a rate limit number in a route — use `config/limits.ts`
- Never `SELECT *` without a cursor limit — all list queries paginated
- Never store or log a full API key
- Never remove or weaken the IP allowlist on `/api/export`
- Never commit `.env` files
- Never assume what "delete a contact" means — ask (hard delete vs opt-out flag)

---

## 10. When in Doubt, Ask

If the agent is uncertain about any of the following, it must stop and ask:

- Which platform tier to assign to a new API consumer
- Whether a schema change will affect existing data
- Whether a new field should be in the main columns or the `custom` JSONB column
- Whether a service change might affect queued BullMQ jobs
- Whether a filter change affects the deduplication behaviour
- Whether a migration needs a separate `CONCURRENTLY` index build

**Speed is worthless if it causes data integrity bugs.** When uncertain, ask.

---

*AGENT.md — Campaign Data Platform | Keep this file up to date as the project evolves.*
