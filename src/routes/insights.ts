/**
 * GET /api/insights
 *
 * Admin-only dashboard analytics endpoint.
 * Auth: JWT (same as /api/jobs — no platform API key needed).
 *
 * Returns a single JSON object with all aggregations needed to render
 * the Insights dashboard in the admin portal. Runs ~14 parallel DB queries.
 */

import { Router } from 'express';
import { jwtAuth } from '../middleware/jwtAuth';
import { getInsights } from '../db/queries/insights';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response } from 'express';

const router = Router();

router.get(
  '/insights',
  jwtAuth,
  catchAsync(async (_req: Request, res: Response): Promise<void> => {
    const data = await getInsights();
    res.json(data);
  }),
);

export default router;
