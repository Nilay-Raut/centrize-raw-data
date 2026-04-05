# Contributing to Campaign Data Platform

> Read this before you write any code, open a PR, or ask an AI agent to help you.

---

## Table of Contents

1. [Project overview](#1-project-overview)
2. [Branching strategy](#2-branching-strategy)
3. [Commit conventions](#3-commit-conventions)
4. [Pull request rules](#4-pull-request-rules)
5. [Code standards](#5-code-standards)
6. [What to do before writing code](#6-what-to-do-before-writing-code)
7. [Environment setup for local dev](#7-environment-setup-for-local-dev)
8. [Running the tests](#8-running-the-tests)
9. [Database migrations](#9-database-migrations)
10. [Security rules — never break](#10-security-rules--never-break)
11. [Working with AI agents](#11-working-with-ai-agents)

---

## 1. Project Overview

Campaign Data Platform is a two-part system:

- **Backend** — Express.js + PostgreSQL + Redis + BullMQ. Handles contact data ingestion, normalisation, querying, and export.
- **Frontend** — Angular 18 Nx monorepo. Admin Portal for ops + embeddable Widget for partner platforms.

The system processes millions of contact records. Correctness and data integrity are more important than delivery speed.

---

## 2. Branching Strategy

```
main          ← production. Direct pushes forbidden.
staging       ← pre-production. Deployed automatically on merge.
dev           ← active development. Feature branches cut from here.

feature/<short-description>   ← new features or enhancements
fix/<short-description>       ← bug fixes
chore/<short-description>     ← dependency updates, config changes
migration/<short-description> ← DB schema changes
```

### Rules

- Cut feature branches from `dev`, not `main`.
- `main` only accepts merges from `staging` via PR, after QA sign-off.
- Branch names use kebab-case. No spaces. No slashes except the prefix.
- Delete your branch after the PR merges.

---

## 3. Commit Conventions

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

[optional body]

[optional footer]
```

### Types

| Type | When to use |
|------|-------------|
| `feat` | New feature or endpoint |
| `fix` | Bug fix |
| `perf` | Performance improvement (no behaviour change) |
| `refactor` | Code restructuring (no behaviour change) |
| `test` | Adding or fixing tests |
| `chore` | Dependency updates, config, tooling |
| `docs` | Documentation only |
| `migration` | Database schema migration |

### Scopes (optional but helpful)

`api`, `worker`, `query`, `ingest`, `export`, `auth`, `ratelimit`, `db`, `frontend`, `widget`, `config`

### Examples

```
feat(ingest): add XLSX support to the upload normaliser
fix(ratelimit): correct window reset time for email platform tier
migration: add GIN index on contacts.tags
chore: upgrade bullmq to v5
docs: add API key rotation runbook
```

### Rules

- Subject line: imperative mood, lowercase, no period, max 72 chars.
- Body: explain *why*, not *what*. The diff shows what.
- Never commit secrets, `.env` files, or generated `dist/` output.

---

## 4. Pull Request Rules

### Before opening a PR

- [ ] `npm run lint` passes with 0 errors
- [ ] `npm run build` completes without TypeScript errors
- [ ] `npm test` passes (or new tests added for the new code)
- [ ] If DB migration included: migration tested locally (up and down)
- [ ] No `console.log` left in production paths (use the logger)
- [ ] No hardcoded values that belong in `config/limits.ts` or `.env`

### PR description must include

```
## What
[What does this PR do? 1–3 sentences.]

## Why
[Why is this change needed? Link to issue if one exists.]

## How to test
[Steps to verify the change works.]

## Migration
[Yes / No. If yes: what does the migration do? Is rollback safe?]

## Checklist
- [ ] lint passes
- [ ] build passes
- [ ] tests pass
- [ ] no secrets committed
- [ ] migration tested locally (if applicable)
```

### Review requirements

- Minimum 1 approval before merge.
- Address all review comments before merging (or explicitly agree to defer with a tracking issue).
- Squash commits on merge to keep `dev` history clean.

---

## 5. Code Standards

### TypeScript

- Strict mode enabled. No `any`. No `@ts-ignore` without a comment explaining why.
- All public function parameters and return types are explicitly typed.
- Interfaces defined in `src/types/models.ts` — never inline duplicate types.
- Use `unknown` + type narrowing instead of `any` for external data.

### Express / Backend

- **Thin routes** — routes validate input shape and delegate. No business logic in route files.
- **Pure services** — services take plain data, return plain data. No `req`, `res`, or `next` ever imported in a service file.
- **Centralised errors** — throw typed errors (see `AppError` in `src/types/errors.ts`). Let `errorHandler.ts` format the response.
- **Async middleware** — always wrap async route handlers with `asyncHandler()` or use a wrapper to catch rejected promises.
- **Pagination** — all list endpoints use cursor-based pagination. No `LIMIT` without a `WHERE id > cursor`.

### Database

- All SQL in `src/db/queries/` — never write raw knex in service or route files.
- Parameterised queries only — no string concatenation in SQL.
- Every new table or column goes through a numbered migration in `src/db/migrations/`.
- Migrations are forward-only in production. Fix forward, don't roll back.

### Naming

| Thing | Convention | Example |
|------|-----------|---------|
| Files | camelCase | `queryService.ts` |
| Classes | PascalCase | `QueryService` |
| Interfaces | PascalCase with `I` prefix | `IContactRecord` or just `ContactRecord` |
| Constants | SCREAMING_SNAKE | `MAX_PAGE_SIZE` |
| Env vars | SCREAMING_SNAKE | `DATABASE_URL` |
| DB columns | snake_case | `opt_out_whatsapp` |
| API routes | kebab-case | `/api/upload-jobs` |

### Angular / Frontend

- All components use `ChangeDetectionStrategy.OnPush`. No exceptions.
- State with `signal()` — no raw class properties for reactive data.
- Large lists use `cdk-virtual-scroll-viewport` with `trackBy`.
- HTTP calls go through a service (`QueryApiService`, etc.). Components never call `HttpClient` directly.
- No `any` in Angular code. All API responses typed with interfaces from `libs/data-models`.

---

## 6. What to Do Before Writing Code

This is not optional. Skipping it wastes everyone's time.

1. **Understand the requirement** — read it twice. List what you know and what you don't.
2. **Check for existing code** — search `src/` before creating a new file. The pattern you want may already exist.
3. **Check `config/limits.ts`** — any new limit belongs there, not in a route file.
4. **Check `src/types/models.ts`** — any new interface goes there.
5. **Plan the file diff** — which files will you touch? Which existing files depend on them?
6. **Write the migration first** (if DB change) — schema change before logic change, always.
7. **If working with an AI agent** — read `AGENT.md` first.

---

## 7. Environment Setup for Local Dev

```bash
# 1. Clone the repo
git clone <repo-url>
cd campaign-data-platform

# 2. Copy env file and fill in values
cp .env.example .env
# At minimum: DATABASE_URL, REDIS_URL, JWT_SECRET

# 3. Start Postgres and Redis via Docker
docker compose up -d

# 4. Install dependencies
npm install

# 5. Run migrations
npm run migrate

# 6. Start dev server (API)
npm run dev

# 7. (Optional) Start worker in another terminal
npm run dev:worker
```

The API runs on `http://localhost:3000`. Health check: `curl http://localhost:3000/health`

For the frontend (admin portal), see the Nx workspace in `apps/admin-portal/`. Run with `nx serve admin-portal`.

---

## 8. Running the Tests

```bash
# All tests
npm test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

Test files live in the dedicated test folder: `src/test/`. Colocating tests with source code is forbidden.

Minimum coverage targets: 80% for services, 60% for routes, 40% for workers.

---

## 9. Database Migrations

Migrations are in `src/db/migrations/` and numbered sequentially: `001_initial_schema.ts`, `002_add_opt_out_call.ts`, etc.

```bash
# Apply all pending migrations
npm run migrate

# Roll back the last migration (local dev only — never in production)
npm run migrate:rollback
```

**Rules for migrations:**

- Never edit an existing migration file. Create a new one.
- Test the migration locally on a fresh DB before committing.
- If the migration adds an index on a large table, document the estimated lock time.
- Migrations run **before** code deploys in the deployment procedure. Schema first, code second.

---

## 10. Security Rules — Never Break

These are not guidelines. Breaking them is a incident.

| Rule | Consequence if broken |
|------|-----------------------|
| Never store API keys in plain text | DB dump exposes all partner credentials |
| Never log full API keys or JWTs | Log aggregation services are not secured |
| Never add `*` to CORS origins | Any website on the internet can query contact data |
| Never skip IP allowlist on `/api/export` | JWT alone is insufficient for bulk data export |
| Never put secrets in git | Git history is permanent even after removal |
| Never disable rate limiting "temporarily" | Scrapers don't respect timelines |
| Always use HTTPS in production | API keys sent over HTTP are exposed in transit |
| Never share one API key between two platforms | Can't revoke one without breaking the other |
| Rotate compromised keys within 5 minutes | Every minute is contact data at risk |

If you discover a potential security issue, do not open a public GitHub issue. Message the dev team directly.

---

## 11. Working with AI Agents

If you're using Claude or another AI agent to help with this project, read `AGENT.md` before starting. It defines what the agent is allowed to do autonomously, what requires your explicit approval, and how to give it context efficiently.

Key rule: **the agent must read `.claude/CLAUDE.md` before writing any code for this project.** It contains the critical domain rules (phone normalisation, deduplication logic, streaming exports) that prevent hard-to-find data integrity bugs.
