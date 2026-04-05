# Campaign Data Platform

Contact data ingestion, normalisation, and query API for WhatsApp, Email, and Calling platforms.

## Quick Start (Local Dev)

```bash
# 1. Start Postgres 15 + Redis 7
docker compose up -d

# 2. Configure environment
cp .env.example .env
# Edit .env — at minimum set JWT_SECRET (openssl rand -hex 64)

# 3. Install dependencies
npm install

# 4. Run DB migrations
npm run migrate

# 5. Start the API
npm run dev

# 6. Start the worker (separate terminal)
npm run dev:worker
```

Health check: `curl http://localhost:3000/health`

## Architecture

```
POST /api/ingest  →  BullMQ queue  →  Normaliser Worker  →  PostgreSQL
POST /api/query   →  QueryService  →  PostgreSQL (cursor pagination)
GET  /api/export  →  ExportService →  PostgreSQL stream  →  CSV
GET  /api/status  →  JobService    →  PostgreSQL
```

Two PM2 processes in production: `cdp-api` (HTTP) and `cdp-worker` (BullMQ).

## Project Layout

```
campaign-data-platform/
├── src/                      Backend (Express + TypeScript)
│   ├── config/               env, db config, rate limit tiers
│   ├── middleware/            security, auth, rate limiting, logging
│   ├── routes/               query, ingest, export, status, auth
│   ├── services/             QueryService, NormaliserService, ExportService, JobService
│   ├── workers/              BullMQ normaliser worker
│   ├── db/                   Knex, Redis, migrations, query files
│   └── types/                models, errors, express extensions
│
├── apps/
│   ├── admin-portal/         Angular 18 admin UI (upload, query, jobs)
│   └── embed-widget/         Angular Element Web Component
│
├── libs/
│   ├── data-models/          Shared TypeScript interfaces
│   └── api-client/           Typed HTTP service wrapper
│
├── .claude/CLAUDE.md         Project-specific AI rules
├── AGENT.md                  AI agent collaboration guide
├── CONTRIBUTING.md           Git workflow, code standards, security rules
├── docker-compose.yml        Local Postgres 15 + Redis 7
├── ecosystem.config.js       PM2 production config
└── .env.example              Environment variable reference
```

## Key Constraints

- Phone numbers stored as E.164 (`+919876543210`) — normalised on ingest
- Deduplication on `(phone, segment)` — same phone in same segment = upsert
- CSV export streams — never buffers into memory
- API keys are bcrypt-hashed — raw key shown once at generation
- Rate limits per platform: WhatsApp 100/min · Email 60/min · Admin 300/min · Export 5/hr

## Documentation

- **Operations guide**: `/datasharedfiles/HOW_TO_USE.md`
- **Backend spec**: `/datasharedfiles/BACKEND.md`
- **Frontend spec**: `/datasharedfiles/FRONTEND.md`
- **AI rules**: `.claude/CLAUDE.md` + `AGENT.md`
- **Contributing**: `CONTRIBUTING.md`
