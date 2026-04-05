/**
 * Route index — mounts all routers under /api.
 *
 * Auth model by route:
 *   auth    → none       (bootstrap — issues the JWT)
 *   query   → api key + rate limit
 *   ingest  → jwt + api key + rate limit + multer
 *   export  → api key + jwt + ip allowlist + rate limit
 *   status  → api key + rate limit   (single job poll, used during upload)
 *   jobs    → jwt only               (admin list of all jobs)
 *   keys     → jwt only               (admin key management)
 *   insights → jwt only               (admin analytics dashboard)
 *
 * /health is mounted directly in app.ts (no auth, no rate limit).
 */

import { Router } from 'express';
import { logger } from '../middleware/logger';
import authRouter from './auth';
import queryRouter from './query';
import ingestRouter from './ingest';
import exportRouter from './export';
import statusRouter from './status';
import jobsRouter from './jobs';
import keysRouter from './keys';
import deleteRouter from './delete';
import insightsRouter from './insights';
import publicRouter from './public';

const router = Router();

logger.info({ message: 'Mounting /api routes' });
router.use('/api', authRouter);
router.use('/api', queryRouter);
router.use('/api', ingestRouter);
router.use('/api', exportRouter);
router.use('/api', statusRouter);
router.use('/api', jobsRouter);
router.use('/api', keysRouter);
router.use('/api', deleteRouter);
router.use('/api', insightsRouter);
router.use('/api/public', publicRouter);

export default router;
