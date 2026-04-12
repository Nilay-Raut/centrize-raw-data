/**
 * GET /api/status/:jobId
 *
 * Returns the current progress of an upload job.
 * Auth: JWT (admin only) — called by the admin portal after uploading a file.
 */

import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { jwtAuth } from '../middleware/jwtAuth';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { jobService } from '../services/JobService';
import { ValidationError } from '../types/errors';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

router.get(
  '/status/:jobId',
  jwtAuth,
  rateLimiterMiddleware,
  [param('jobId').isUUID().withMessage('jobId must be a valid UUID')],
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid Job ID', errorData));
      return;
    }

    const job = await jobService.getStatus(req.params['jobId']!);
    res.json(job);
  }),
);

export default router;
