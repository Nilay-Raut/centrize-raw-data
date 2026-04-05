/**
 * Security middleware stack.
 *
 * Applied globally in app.ts before all routes.
 * Order matters — do not reorder without understanding the implications.
 *
 * Stack:
 *   1. toobusy  — reject requests when event loop lag > SERVER_BUSY_LAG_MS (503)
 *   2. helmet   — sets secure HTTP headers (CSP, HSTS, X-Frame-Options, etc.)
 *   3. cors     — restrict origins to ALLOWED_ORIGINS env var
 *   4. hpp      — prevent HTTP parameter pollution attacks
 *   5. json body limit — reject bodies over 1MB (files use multipart, not JSON)
 */

import type { Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import hpp from 'hpp';
import toobusy from 'toobusy-js';
import express from 'express';
import { env } from '../config/env';
import { SERVER_BUSY_LAG_MS } from '../config/limits';
import { ServerBusyError } from '../types/errors';

// Configure toobusy threshold
toobusy.maxLag(SERVER_BUSY_LAG_MS);

/** Returns 503 when the Node.js event loop is overloaded */
export function tooBusyMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  // Disable in test environment to avoid 503s during heavy load
  if (process.env['NODE_ENV'] === 'test') {
    next();
    return;
  }
  if (toobusy()) {
    console.log(`[toobusy] event loop lag detected. NODE_ENV=${process.env['NODE_ENV']}`);
    next(new ServerBusyError());
    return;
  }
  next();
}

/** Helmet — secure HTTP headers */
export const helmetMiddleware = helmet({
  contentSecurityPolicy: env.isProd, // Only enforce CSP in production
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // Allow widget CDN embedding
});

/** CORS — only allow configured origins */
export const corsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (server-to-server, curl, Postman)
    if (!origin) {
      callback(null, true);
      return;
    }
    if (env.allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS: origin ${origin} not allowed`));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key', 'x-api-key'],
  credentials: false, // API keys in headers — no cookies needed
});

/** HPP — prevent parameter pollution e.g. ?sort=asc&sort=desc */
export const hppMiddleware = hpp();

/** Body size limits — JSON max 1MB, URL-encoded max 1MB */
export const jsonBodyParser = express.json({ limit: '1mb' });
export const urlencodedBodyParser = express.urlencoded({ extended: true, limit: '1mb' });
