/**
 * Express application setup.
 *
 * This file ONLY configures the app — it does NOT call app.listen().
 * server.ts calls listen. Tests import this file directly without starting a port.
 *
 * Middleware order (must not be changed without understanding implications):
 *   1. toobusy       — reject fast when overloaded (before anything expensive)
 *   2. helmet        — security headers
 *   3. cors          — origin allowlist
 *   4. hpp           — parameter pollution guard
 *   5. body parsers  — JSON + urlencoded
 *   6. /health       — unauthenticated health check (before auth middleware)
 *   7. routes        — all /api/* routes (auth lives inside each router)
 *   8. 404 handler   — catch unmatched routes
 *   9. error handler — MUST be last
 */

import express from 'express';
import {
  tooBusyMiddleware,
  helmetMiddleware,
  corsMiddleware,
  hppMiddleware,
  jsonBodyParser,
  urlencodedBodyParser,
} from './middleware/security';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './middleware/logger';
import apiRoutes from './routes/index';
// import db from './db/knex';
// import redis from './db/redis';

const app = express();

app.use((req, _res, next) => {
  logger.debug({ message: 'Incoming request', method: req.method, url: req.url });
  next();
});

// ── Trust proxy (needed for correct req.ip behind nginx) ──────────────────────
app.set('trust proxy', 1);

// ── Global middleware ─────────────────────────────────────────────────────────
app.use(tooBusyMiddleware);
app.use(helmetMiddleware);
app.use(corsMiddleware);
app.use(hppMiddleware);
app.use(jsonBodyParser);
app.use(urlencodedBodyParser);

// ── Health check — no auth, no rate limit ─────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ api: 'ok' });
});

// ── API routes ────────────────────────────────────────────────────────────────
logger.info({ message: 'Mounting API routes' });
app.use(apiRoutes);

// ── 404 handler ───────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found', code: 'NOT_FOUND' });
});

// ── Central error handler — MUST be last ──────────────────────────────────────
app.use(errorHandler);

export default app;
