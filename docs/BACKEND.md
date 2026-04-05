# Campaign Data Platform — Backend Implementation Guide

> Express.js + NestJS Worker + PostgreSQL + Redis + BullMQ  
> Maintainable by 1–2 developers. Every decision is documented here.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Project Setup](#2-project-setup)
3. [Folder Structure](#3-folder-structure)
4. [Environment Variables](#4-environment-variables)
5. [Database Schema](#5-database-schema)
6. [Security Middleware Stack](#6-security-middleware-stack)
7. [API Key System](#7-api-key-system)
8. [Rate Limiting](#8-rate-limiting)
9. [Routes & Controllers](#9-routes--controllers)
10. [Service Layer](#10-service-layer)
11. [Data Normalisation Worker](#11-data-normalisation-worker)
12. [CSV Export — Protected Route](#12-csv-export--protected-route)
13. [Error Handling](#13-error-handling)
14. [Logging](#14-logging)
15. [Database Migrations](#15-database-migrations)
16. [PM2 Production Setup](#16-pm2-production-setup)
17. [Health Checks](#17-health-checks)
18. [Adding a New Platform Consumer](#18-adding-a-new-platform-consumer)

---

## 1. Architecture Overview

```
Incoming Request
      │
      ▼
┌─────────────────────────────────────────┐
│  Security Middleware Stack              │
│  helmet · cors · hpp · toobusy · jwt   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Rate Limiter (Redis-backed, per key)   │
│  WhatsApp:100/min  Email:60/min         │
│  Admin:300/min     CSV:5/hour           │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Route Layer (thin — validate & delegate)│
│  POST /query  POST /ingest              │
│  GET  /export GET  /status              │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Service Layer (pure business logic)    │
│  QueryService · NormaliserService       │
│  ExportService · JobService             │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│  Data Layer                             │
│  PostgreSQL (knex) · Redis · BullMQ     │
└─────────────────────────────────────────┘
```

**Key rules:**
- Routes never query the database directly
- Services never import anything from Express (`req`, `res`, `next`)
- All limits live in `config/limits.ts`, never hardcoded
- One middleware file per concern
- All errors go to the central error handler
- CSV exports stream — never load full dataset into memory

---

## 2. Project Setup

### Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- PM2 (`npm install -g pm2`)

### Initial Installation

```bash
mkdir campaign-data-platform && cd campaign-data-platform
npm init -y

# Core
npm install express express-rate-limit rate-limit-redis ioredis knex pg
npm install helmet cors hpp express-validator toobusy-js express-jwt jsonwebtoken
npm install bcrypt bullmq fast-csv dayjs uuid dotenv

# Dev
npm install -D typescript ts-node nodemon @types/express @types/node
npm install -D @types/bcrypt @types/cors @types/hpp @types/uuid eslint

# Init TypeScript
npx tsc --init
```

### `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### `package.json` scripts

```json
{
  "scripts": {
    "dev": "nodemon --exec ts-node src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js",
    "migrate": "ts-node src/db/migrate.ts",
    "migrate:rollback": "ts-node src/db/migrate.ts rollback",
    "lint": "eslint src/**/*.ts",
    "test": "jest"
  }
}
```

---

## 3. Folder Structure

```
src/
├── config/
│   ├── limits.ts          # All rate limits and page size caps
│   ├── db.ts              # Knex config
│   └── env.ts             # Validated env variables
│
├── middleware/
│   ├── security.ts        # helmet, cors, hpp, toobusy, body limits
│   ├── apiKeyAuth.ts      # Resolve platform from hashed API key
│   ├── jwtAuth.ts         # JWT verification (admin + export routes)
│   ├── rateLimiter.ts     # Per-platform Redis-backed limiter
│   ├── ipAllowlist.ts     # CSV export IP guard
│   └── errorHandler.ts    # Central error handler
│
├── routes/
│   ├── index.ts           # Mounts all routers
│   ├── query.ts           # POST /api/query
│   ├── ingest.ts          # POST /api/ingest
│   ├── export.ts          # GET  /api/export  (triple-guarded)
│   └── status.ts          # GET  /api/status/:jobId
│
├── services/
│   ├── QueryService.ts    # Filter, paginate, return contacts
│   ├── NormaliserService.ts # Field mapping + dedup logic
│   ├── ExportService.ts   # Stream CSV from DB cursor
│   └── JobService.ts      # Enqueue and track BullMQ jobs
│
├── workers/
│   ├── normaliserWorker.ts # BullMQ worker — processes upload jobs
│   └── workerBoot.ts      # Entry point for worker process
│
├── db/
│   ├── knex.ts            # Knex instance
│   ├── redis.ts           # ioredis instance
│   ├── migrations/        # All schema migrations (numbered)
│   └── queries/
│       ├── contacts.ts    # All contact table queries
│       └── apiKeys.ts     # API key queries
│
├── types/
│   ├── express.d.ts       # Extends Request with platform, apiKey
│   └── models.ts          # ContactRecord, FilterPayload, etc.
│
├── app.ts                 # Express app setup (no listen call)
└── server.ts              # Calls app.listen — kept separate for testing
```

> **Why split `app.ts` and `server.ts`?**  
> Tests import `app.ts` directly without starting a real server port. `server.ts` is only the entry point for `node` / PM2.

---

## 4. Environment Variables

Create a `.env` file in root. **Never commit this file.**  
Add `.env` to `.gitignore` on day one.

```env
# Server
NODE_ENV=production
PORT=3000

# Database
DATABASE_URL=postgres://user:password@localhost:5432/campaign_data
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379

# Auth
JWT_SECRET=<generate with: openssl rand -hex 64>
JWT_EXPIRES_IN=8h

# Security
ALLOWED_ORIGINS=https://admin.yourapp.com,https://whatsapp.yourapp.com
ADMIN_IP_ALLOWLIST=10.0.1.45,10.0.1.46

# Worker
WORKER_CONCURRENCY=3
UPLOAD_MAX_BYTES=52428800

# Monitoring
LOG_LEVEL=info
```

### `src/config/env.ts`

Validate all env at startup — fail fast if anything is missing.

```typescript
import 'dotenv/config';

const required = [
  'DATABASE_URL', 'REDIS_URL', 'JWT_SECRET',
  'ALLOWED_ORIGINS', 'ADMIN_IP_ALLOWLIST',
];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000'),
  isProd: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  jwtSecret: process.env.JWT_SECRET!,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '8h',
  allowedOrigins: process.env.ALLOWED_ORIGINS!.split(','),
  adminIps: process.env.ADMIN_IP_ALLOWLIST!.split(','),
  workerConcurrency: parseInt(process.env.WORKER_CONCURRENCY || '3'),
  uploadMaxBytes: parseInt(process.env.UPLOAD_MAX_BYTES || '52428800'),
};
```

---

## 5. Database Schema

### `src/db/migrations/001_initial_schema.ts`

```typescript
import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // Contacts — the core table. Partitioned by segment if rows > 10M
  await knex.schema.createTable('contacts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('phone', 20).notNullable();        // E.164 format: +919876543210
    t.string('email', 255);
    t.string('name', 255);
    t.string('language', 10).defaultTo('en');
    t.specificType('tags', 'text[]');            // GIN indexed below
    t.string('segment', 100).notNullable();
    t.string('source_batch_id', 100);            // which upload created this
    t.jsonb('custom').defaultTo('{}');           // overflow fields
    t.boolean('opt_out_whatsapp').defaultTo(false);
    t.boolean('opt_out_email').defaultTo(false);
    t.boolean('opt_out_call').defaultTo(false);
    t.timestamps(true, true);
  });

  // Indexes for fast filtered queries
  await knex.raw(`CREATE INDEX contacts_phone_idx ON contacts(phone)`);
  await knex.raw(`CREATE INDEX contacts_email_idx ON contacts(email)`);
  await knex.raw(`CREATE INDEX contacts_segment_idx ON contacts(segment)`);
  await knex.raw(`CREATE INDEX contacts_tags_gin_idx ON contacts USING GIN(tags)`);
  await knex.raw(`CREATE UNIQUE INDEX contacts_phone_segment_uniq ON contacts(phone, segment)`);

  // API keys — hashed, never plain text
  await knex.schema.createTable('api_keys', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();         // "WhatsApp Platform Prod"
    t.string('key_hash', 255).notNullable();     // bcrypt hash
    t.string('key_prefix', 8).notNullable();     // first 8 chars for cache lookup
    t.enum('platform', ['whatsapp', 'email', 'admin', 'csv_export']).notNullable();
    t.boolean('active').defaultTo(true);
    t.timestamp('last_used_at');
    t.timestamps(true, true);
  });

  // Upload jobs
  await knex.schema.createTable('upload_jobs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('filename', 255).notNullable();
    t.string('s3_key', 500).notNullable();
    t.enum('status', ['queued', 'processing', 'done', 'failed']).defaultTo('queued');
    t.integer('total_rows').defaultTo(0);
    t.integer('processed_rows').defaultTo(0);
    t.integer('failed_rows').defaultTo(0);
    t.text('error_log');
    t.string('segment', 100).notNullable();
    t.jsonb('field_mapping').defaultTo('{}');    // { csv_col: standard_field }
    t.string('uploaded_by', 100);
    t.timestamps(true, true);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('upload_jobs');
  await knex.schema.dropTableIfExists('api_keys');
  await knex.schema.dropTableIfExists('contacts');
}
```

### Standard Contact Schema (TypeScript)

```typescript
// src/types/models.ts

export interface ContactRecord {
  id: string;
  phone: string;           // Always E.164: +91XXXXXXXXXX
  email?: string;
  name?: string;
  language: string;
  tags: string[];
  segment: string;
  source_batch_id?: string;
  custom: Record<string, unknown>;
  opt_out_whatsapp: boolean;
  opt_out_email: boolean;
  opt_out_call: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface FilterPayload {
  filters: {
    segment?: string;
    tags?: string[];           // AND logic — contact must have ALL tags
    tags_any?: string[];       // OR logic — contact must have ANY tag
    opt_out_whatsapp?: boolean;
    opt_out_email?: boolean;
    opt_out_call?: boolean;
    language?: string;
    phone_prefix?: string;     // e.g. "+91" for India only
    custom?: Record<string, unknown>;
  };
  page_size: number;           // Capped by platform limit
  cursor?: string;             // base64 encoded {id, created_at}
  fields?: string[];           // Return only these fields (projection)
}

export interface QueryResult {
  data: Partial<ContactRecord>[];
  next_cursor: string | null;
  total_count: number;         // Approximate for large sets
  page_size: number;
}
```

---

## 6. Security Middleware Stack

### `src/middleware/security.ts`

```typescript
import { RequestHandler } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import toobusy from 'toobusy-js';
import express from 'express';
import { env } from '../config/env';

// Shed load when event loop lag > 70ms
const busyGuard: RequestHandler = (_req, res, next) => {
  if (toobusy()) {
    return res.status(503).json({
      error: 'server_busy',
      message: 'Server is under heavy load. Retry in a few seconds.',
    });
  }
  next();
};

// Block requests from unknown origins
const corsGuard = cors({
  origin: (origin, callback) => {
    // Allow server-to-server calls (no origin header)
    if (!origin) return callback(null, true);
    if (env.allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: Origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
});

export const securityStack: RequestHandler[] = [
  busyGuard,
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
  }),
  corsGuard,
  // Prevent HTTP Parameter Pollution: ?a=1&a=2 → a='2' not ['1','2']
  hpp(),
  // Body size limits — prevents payload bomb attacks
  express.json({ limit: '2mb' }),
  express.urlencoded({ extended: false, limit: '2mb' }),
];
```

---

## 7. API Key System

API keys are bcrypt-hashed. No plain text stored anywhere.

### Generate a key (run once per platform, store securely)

```typescript
// scripts/generateApiKey.ts
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';

const raw = randomBytes(32).toString('hex');       // 64-char hex key
const hash = await bcrypt.hash(raw, 12);
const prefix = raw.slice(0, 8);

console.log(`Raw key (give to platform):  cdp_${raw}`);
console.log(`Hash (store in DB):          ${hash}`);
console.log(`Prefix (store in DB):        ${prefix}`);
// Run: ts-node scripts/generateApiKey.ts
```

### `src/middleware/apiKeyAuth.ts`

```typescript
import { RequestHandler } from 'express';
import bcrypt from 'bcrypt';
import { redis } from '../db/redis';
import { db } from '../db/knex';

export const apiKeyAuth: RequestHandler = async (req, res, next) => {
  const rawKey = req.headers['x-api-key'] as string;
  if (!rawKey || !rawKey.startsWith('cdp_')) {
    return res.status(401).json({ error: 'missing_or_invalid_api_key' });
  }

  const prefix = rawKey.slice(4, 12);  // first 8 chars after "cdp_"
  const cacheKey = `apikey:platform:${prefix}`;

  // Fast path — cache hit avoids DB on every request
  const cached = await redis.get(cacheKey);
  if (cached) {
    req.platform = cached as Platform;
    req.apiKey = rawKey;
    return next();
  }

  // Slow path — verify against DB
  const rows = await db('api_keys')
    .select('id', 'platform', 'key_hash')
    .where({ active: true, key_prefix: prefix });

  const match = rows.find(r => bcrypt.compareSync(rawKey, r.key_hash));
  if (!match) {
    return res.status(403).json({ error: 'invalid_api_key' });
  }

  // Cache for 5 minutes, update last_used_at in background
  await redis.setex(cacheKey, 300, match.platform);
  db('api_keys').where({ id: match.id }).update({ last_used_at: new Date() }).catch(() => {});

  req.platform = match.platform;
  req.apiKey = rawKey;
  next();
};
```

### Extend Express Request type

```typescript
// src/types/express.d.ts
import 'express';

export type Platform = 'whatsapp' | 'email' | 'admin' | 'csv_export';

declare module 'express' {
  interface Request {
    platform: Platform;
    apiKey: string;
  }
}
```

---

## 8. Rate Limiting

### `src/config/limits.ts`

```typescript
export const PLATFORM_LIMITS = {
  whatsapp: {
    windowMs: 60_000,          // 1 minute window
    max: 100,                  // 100 requests per minute
    maxPageSize: 1000,         // Max contacts per query
  },
  email: {
    windowMs: 60_000,
    max: 60,
    maxPageSize: 2000,
  },
  admin: {
    windowMs: 60_000,
    max: 300,
    maxPageSize: 5000,
  },
  csv_export: {
    windowMs: 60 * 60_000,    // 1 hour window
    max: 5,                    // 5 exports per hour
    maxRows: 500_000,
  },
} as const;

export type PlatformKey = keyof typeof PLATFORM_LIMITS;
```

### `src/middleware/rateLimiter.ts`

```typescript
import { rateLimit } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { redis } from '../db/redis';
import { PLATFORM_LIMITS, PlatformKey } from '../config/limits';
import { RequestHandler } from 'express';

export const createRateLimiter = (platform: PlatformKey): RequestHandler => {
  const cfg = PLATFORM_LIMITS[platform];
  return rateLimit({
    windowMs: cfg.windowMs,
    max: cfg.max,
    // Key = platform + API key — isolates each consumer
    keyGenerator: (req) => `${platform}:${req.apiKey}`,
    store: new RedisStore({
      sendCommand: (...args: string[]) => redis.call(...args),
    }),
    handler: (_req, res) => {
      res.status(429).json({
        error: 'rate_limit_exceeded',
        platform,
        limit: cfg.max,
        window_seconds: cfg.windowMs / 1000,
        retry_after: Math.ceil(cfg.windowMs / 1000),
      });
    },
    standardHeaders: true,   // Sends RateLimit-* headers
    legacyHeaders: false,
  });
};

// Dynamic version — reads platform from req at runtime
export const dynamicRateLimiter: RequestHandler = (req, res, next) => {
  const limiter = createRateLimiter(req.platform as PlatformKey);
  return limiter(req, res, next);
};
```

---

## 9. Routes & Controllers

### `src/app.ts`

```typescript
import express from 'express';
import { securityStack } from './middleware/security';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes/index';

const app = express();

// 1. Security first — before anything else
app.use(securityStack);

// 2. Auth on all /api routes
app.use('/api', apiKeyAuth);

// 3. Business routes
app.use('/api', routes);

// 4. Not found handler
app.use((_req, res) => res.status(404).json({ error: 'not_found' }));

// 5. Central error handler — must be last
app.use(errorHandler);

export default app;
```

### `src/routes/query.ts`

```typescript
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { dynamicRateLimiter } from '../middleware/rateLimiter';
import { PLATFORM_LIMITS } from '../config/limits';
import { QueryService } from '../services/QueryService';

const router = Router();

const validateQuery = [
  body('filters').isObject().withMessage('filters must be an object'),
  body('page_size').isInt({ min: 1, max: 5000 }).withMessage('page_size must be 1–5000'),
  body('cursor').optional().isString(),
  body('filters.segment').optional().isString().trim().escape(),
  body('filters.tags').optional().isArray(),
  body('filters.tags.*').isString().trim().escape(),
];

router.post('/query',
  dynamicRateLimiter,
  validateQuery,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Silently cap page_size to platform maximum — never error on this
    const platformMax = PLATFORM_LIMITS[req.platform]?.maxPageSize ?? 1000;
    req.body.page_size = Math.min(req.body.page_size, platformMax);

    try {
      const result = await QueryService.query(req.body, req.platform);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
```

### `src/routes/ingest.ts`

```typescript
import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import multer from 'multer';
import { createRateLimiter } from '../middleware/rateLimiter';
import { JobService } from '../services/JobService';
import { env } from '../config/env';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
    cb(null, allowed.includes(file.mimetype));
  },
});

const validateIngest = [
  body('segment').isString().trim().notEmpty().withMessage('segment is required'),
  body('field_mapping').isObject().withMessage('field_mapping is required'),
];

router.post('/ingest',
  createRateLimiter('admin'),
  upload.single('file'),
  validateIngest,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
    if (!req.file) return res.status(400).json({ error: 'no_file_uploaded' });

    try {
      const job = await JobService.enqueueUpload({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        segment: req.body.segment,
        fieldMapping: JSON.parse(req.body.field_mapping),
        uploadedBy: req.apiKey,
      });

      res.status(202).json({
        message: 'Upload queued',
        job_id: job.id,
        status_url: `/api/status/${job.id}`,
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
```

### `src/routes/export.ts`

```typescript
import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { jwtAuth } from '../middleware/jwtAuth';
import { ipAllowlist } from '../middleware/ipAllowlist';
import { createRateLimiter } from '../middleware/rateLimiter';
import { ExportService } from '../services/ExportService';

const router = Router();

const validateExport = [
  query('segment').isString().trim().notEmpty(),
  query('tags').optional().isString(),
];

// Triple guard: JWT + IP allowlist + strict rate limit
router.get('/export',
  jwtAuth,
  ipAllowlist,
  createRateLimiter('csv_export'),
  validateExport,
  async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const filters = {
        segment: req.query.segment as string,
        tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
      };

      // Set headers before streaming starts
      const filename = `export-${filters.segment}-${Date.now()}.csv`;
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');

      // Stream rows — never buffers full file into memory
      const csvStream = await ExportService.streamCsv(filters);
      csvStream.pipe(res);
      csvStream.on('error', next);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
```

---

## 10. Service Layer

### `src/services/QueryService.ts`

```typescript
import { db } from '../db/knex';
import { redis } from '../db/redis';
import { FilterPayload, QueryResult } from '../types/models';
import { Platform } from '../types/express';

export class QueryService {
  static async query(payload: FilterPayload, platform: Platform): Promise<QueryResult> {
    const { filters, page_size, cursor, fields } = payload;

    // Try cache first (5-minute TTL for common queries)
    const cacheKey = `query:${platform}:${JSON.stringify({ filters, page_size, cursor })}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    let query = db('contacts').select(fields?.length ? fields : '*');

    // Apply filters
    if (filters.segment) query = query.where('segment', filters.segment);
    if (filters.language) query = query.where('language', filters.language);
    if (filters.opt_out_whatsapp !== undefined)
      query = query.where('opt_out_whatsapp', filters.opt_out_whatsapp);
    if (filters.opt_out_email !== undefined)
      query = query.where('opt_out_email', filters.opt_out_email);

    // Tags AND logic — must have all specified tags
    if (filters.tags?.length) {
      query = query.whereRaw('tags @> ?', [JSON.stringify(filters.tags)]);
    }
    // Tags OR logic — must have any of specified tags
    if (filters.tags_any?.length) {
      query = query.whereRaw('tags && ?', [JSON.stringify(filters.tags_any)]);
    }

    // Cursor-based pagination — faster than OFFSET for large sets
    if (cursor) {
      const decoded = JSON.parse(Buffer.from(cursor, 'base64').toString());
      query = query.where('id', '>', decoded.id);
    }

    const rows = await query.orderBy('id', 'asc').limit(page_size + 1);

    // If we got page_size+1 rows, there's a next page
    const hasMore = rows.length > page_size;
    const data = rows.slice(0, page_size);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ id: data[data.length - 1].id })).toString('base64')
      : null;

    // Approximate total — full COUNT(*) is expensive on large tables
    const [{ count }] = await db('contacts')
      .where(filters.segment ? { segment: filters.segment } : {})
      .count('id as count');

    const result: QueryResult = {
      data,
      next_cursor: nextCursor,
      total_count: parseInt(count as string),
      page_size,
    };

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, JSON.stringify(result));
    return result;
  }
}
```

### `src/services/ExportService.ts`

```typescript
import { Readable } from 'stream';
import { format as csvFormat } from 'fast-csv';
import { db } from '../db/knex';

interface ExportFilters {
  segment: string;
  tags?: string[];
}

const CSV_COLUMNS = [
  'id', 'phone', 'email', 'name', 'language',
  'segment', 'tags', 'opt_out_whatsapp', 'opt_out_email', 'opt_out_call',
];

export class ExportService {
  static async streamCsv(filters: ExportFilters): Promise<Readable> {
    const csvStream = csvFormat({ headers: CSV_COLUMNS, writeBOM: true });

    let query = db('contacts')
      .select(CSV_COLUMNS)
      .where('segment', filters.segment);

    if (filters.tags?.length) {
      query = query.whereRaw('tags @> ?', [JSON.stringify(filters.tags)]);
    }

    // knex streaming — rows never fully loaded into memory
    const dbStream = query.stream();

    dbStream.on('data', (row) => {
      // Flatten tags array to semicolon-separated string for CSV
      csvStream.write({ ...row, tags: (row.tags || []).join(';') });
    });

    dbStream.on('end', () => csvStream.end());
    dbStream.on('error', (err) => csvStream.destroy(err));

    return csvStream;
  }
}
```

---

## 11. Data Normalisation Worker

### `src/workers/normaliserWorker.ts`

```typescript
import { Worker, Job } from 'bullmq';
import { parse } from 'fast-csv';
import { Readable } from 'stream';
import { db } from '../db/knex';
import { redis } from '../db/redis';
import { env } from '../config/env';
import { normalisePhone, normaliseEmail } from '../services/NormaliserService';

interface UploadJobData {
  jobId: string;
  fileBuffer: Buffer;
  filename: string;
  segment: string;
  fieldMapping: Record<string, string>;   // { csv_col: standard_field }
}

export const normaliserWorker = new Worker<UploadJobData>(
  'normalise-upload',
  async (job: Job<UploadJobData>) => {
    const { jobId, fileBuffer, segment, fieldMapping } = job.data;

    let processed = 0;
    let failed = 0;
    const batch: object[] = [];
    const BATCH_SIZE = 500;

    const flush = async () => {
      if (!batch.length) return;
      // ON CONFLICT — deduplicate on phone+segment
      await db.raw(`
        INSERT INTO contacts (${Object.keys(batch[0]).join(',')})
        VALUES ${batch.map(() => `(${Object.keys(batch[0]).map(() => '?').join(',')})`).join(',')}
        ON CONFLICT (phone, segment) DO UPDATE SET
          updated_at = now(),
          tags = EXCLUDED.tags,
          custom = contacts.custom || EXCLUDED.custom
      `, batch.flatMap(r => Object.values(r)));
      processed += batch.length;
      batch.length = 0;

      // Update progress in DB
      await db('upload_jobs').where({ id: jobId }).update({ processed_rows: processed });
      await job.updateProgress(processed);
    };

    await new Promise<void>((resolve, reject) => {
      Readable.from(fileBuffer)
        .pipe(parse({ headers: true, trim: true, skipRows: 0 }))
        .on('data', async (row) => {
          try {
            const record = mapRow(row, fieldMapping, segment);
            if (!record.phone) { failed++; return; }
            batch.push(record);
            if (batch.length >= BATCH_SIZE) await flush();
          } catch {
            failed++;
          }
        })
        .on('end', async () => { await flush(); resolve(); })
        .on('error', reject);
    });

    await db('upload_jobs')
      .where({ id: jobId })
      .update({ status: 'done', processed_rows: processed, failed_rows: failed });
  },
  {
    connection: redis,
    concurrency: env.workerConcurrency,
  }
);

function mapRow(
  row: Record<string, string>,
  mapping: Record<string, string>,
  segment: string,
): Record<string, unknown> {
  const record: Record<string, unknown> = { segment };

  for (const [csvCol, stdField] of Object.entries(mapping)) {
    const value = row[csvCol]?.trim();
    if (!value) continue;

    if (stdField === 'phone') record.phone = normalisePhone(value);
    else if (stdField === 'email') record.email = normaliseEmail(value);
    else if (stdField === 'tags') record.tags = value.split(/[;,]/);
    else record[stdField] = value;
  }

  // Unrecognised columns go into custom jsonb
  const mappedCols = new Set(Object.keys(mapping));
  const custom: Record<string, string> = {};
  for (const col of Object.keys(row)) {
    if (!mappedCols.has(col) && row[col]) custom[col] = row[col];
  }
  if (Object.keys(custom).length) record.custom = custom;

  return record;
}
```

---

## 12. CSV Export — Protected Route

The export route has three independent security layers that must ALL pass:

| Layer | What it checks | Why |
|-------|---------------|-----|
| JWT | Short-lived token (8h expiry) | Proves authenticated admin session |
| IP Allowlist | Request IP must match `ADMIN_IP_ALLOWLIST` | Prevents leaked tokens being used from unknown locations |
| Rate limit | Max 5 exports per hour | Prevents bulk data harvesting |

### `src/middleware/ipAllowlist.ts`

```typescript
import { RequestHandler } from 'express';
import { env } from '../config/env';

export const ipAllowlist: RequestHandler = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || '';
  // Handle proxied requests (nginx sets X-Real-IP)
  const realIp = req.headers['x-real-ip'] as string || ip;

  if (!env.adminIps.includes(realIp)) {
    return res.status(403).json({
      error: 'ip_not_allowed',
      message: 'This endpoint is restricted to authorised IPs only.',
    });
  }
  next();
};
```

---

## 13. Error Handling

### `src/middleware/errorHandler.ts`

```typescript
import { ErrorRequestHandler } from 'express';
import { env } from '../config/env';

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  // Always log full error internally
  console.error({
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    platform: req.platform,
    error: err.message,
    stack: err.stack,
  });

  // JWT errors
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ error: 'invalid_or_expired_token' });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: 'validation_error', details: err.message });
  }

  // Never leak stack traces or internal details in production
  res.status(err.status || 500).json({
    error: 'internal_error',
    message: env.isProd ? 'An unexpected error occurred.' : err.message,
  });
};
```

---

## 14. Logging

Use `pino` for structured JSON logs — fast, parseable by Cloudwatch / Datadog.

```bash
npm install pino pino-pretty
```

```typescript
// src/config/logger.ts
import pino from 'pino';
import { env } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: env.isProd ? undefined : { target: 'pino-pretty' },
  base: { service: 'campaign-data-api' },
});
```

Add request logging middleware:

```typescript
// src/middleware/requestLogger.ts
import { RequestHandler } from 'express';
import { logger } from '../config/logger';

export const requestLogger: RequestHandler = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    logger.info({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      platform: req.platform,
      ms: Date.now() - start,
    });
  });
  next();
};
```

---

## 15. Database Migrations

```typescript
// src/db/migrate.ts
import { db } from './knex';
import path from 'path';

const action = process.argv[2] || 'latest';

async function run() {
  const config = { directory: path.join(__dirname, 'migrations') };
  if (action === 'rollback') {
    await db.migrate.rollback(config);
    console.log('Rolled back last migration');
  } else {
    await db.migrate.latest(config);
    console.log('Migrations applied');
  }
  await db.destroy();
}

run().catch(console.error);
```

**Always run migrations before deploying new code:**

```bash
npm run migrate        # Apply pending
npm run migrate:rollback  # Undo last (emergency only)
```

---

## 16. PM2 Production Setup

### `ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'cdp-api',
      script: 'dist/server.js',
      instances: 2,           // One per CPU core on t3.medium
      exec_mode: 'cluster',
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
    {
      name: 'cdp-worker',
      script: 'dist/workers/workerBoot.js',
      instances: 1,           // Single worker instance
      exec_mode: 'fork',
      max_memory_restart: '800M',
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
```

```bash
# First deploy
npm run build
npm run migrate
pm2 start ecosystem.config.js --env production
pm2 save

# Subsequent deploys (zero-downtime rolling reload)
npm run build && npm run migrate && pm2 reload cdp-api
```

---

## 17. Health Checks

```typescript
// src/routes/health.ts
router.get('/health', async (_req, res) => {
  const checks = {
    api: 'ok',
    db: 'unknown',
    redis: 'unknown',
  };

  try {
    await db.raw('SELECT 1');
    checks.db = 'ok';
  } catch { checks.db = 'error'; }

  try {
    await redis.ping();
    checks.redis = 'ok';
  } catch { checks.redis = 'error'; }

  const allOk = Object.values(checks).every(v => v === 'ok');
  res.status(allOk ? 200 : 503).json(checks);
});
```

---

## 18. Adding a New Platform Consumer

When a new platform needs API access, follow these exact steps:

1. **Generate API key** — `ts-node scripts/generateApiKey.ts`
2. **Insert into DB:**
   ```sql
   INSERT INTO api_keys (name, key_hash, key_prefix, platform)
   VALUES ('Calling Platform Prod', '<hash>', '<prefix>', 'whatsapp');
   ```
   > Use `whatsapp` tier unless a new tier is needed
3. **Add rate limit tier** in `src/config/limits.ts` if different limits needed
4. **Add origin to `ALLOWED_ORIGINS`** in `.env` and restart
5. **Hand the raw `cdp_...` key** to the platform team — never send via email, use a secret manager
6. **Test** — `curl -H "X-Api-Key: cdp_..." POST /api/query`
