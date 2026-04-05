/**
 * GET /api/jobs — list recent upload jobs
 *
 * Returns the 50 most recent upload_jobs ordered by created_at DESC.
 * Used by the JobsListComponent in the admin portal to display progress,
 * status badges, and row counts for all ingest operations.
 *
 * Auth: JWT only (admin portal). No platform API key required.
 *
 * Note: Individual job polling (while a job is running) uses the existing
 * GET /api/status/:jobId endpoint which accepts an API key — this endpoint
 * is the admin overview of all jobs.
 */

import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import { jwtAuth } from '../middleware/jwtAuth';
import { listRecentJobs } from '../db/queries/uploadJobs';
import { ValidationError } from '../types/errors';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

const MAX_JOBS_LIMIT = 100;
const DEFAULT_JOBS_LIMIT = 50;

router.get(
  '/jobs',
  jwtAuth,
  [
    query('limit')
      .optional()
      .isInt({ min: 1, max: MAX_JOBS_LIMIT })
      .withMessage(`limit must be an integer between 1 and ${MAX_JOBS_LIMIT}`)
      .toInt(),
  ],
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid query parameters', errorData));
      return;
    }

    const limit = (req.query['limit'] as unknown as number | undefined) ?? DEFAULT_JOBS_LIMIT;
    const jobs = await listRecentJobs(limit);
    res.json(jobs);
  }),
);

export default router;
