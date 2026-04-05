/**
 * POST /api/public/query
 *
 * Public unauthenticated endpoint for contact count previews.
 * Stricter rate limits and result caps applied.
 */

import { Router } from 'express';
import { validationResult } from 'express-validator';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { queryService } from '../services/QueryService';
import { ValidationError } from '../types/errors';
import { catchAsync } from '../utils/catchAsync';
import { validateQuery } from './query';
import type { Request, Response, NextFunction } from 'express';
import type { FilterPayload, ContactFilter } from '../types/models';

const router = Router();

router.post(
  '/query',
  // Skip apiKeyAuth — this is public
  rateLimiterMiddleware,
  validateQuery,
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      errors.array().forEach((err: any) => {
        errorData[err.path || err.param] = err.msg;
      });
      next(new ValidationError('Invalid query parameters', errorData));
      return;
    }

    const payload = req.body as FilterPayload;
    
    // Force 'public' platform for limit enforcement and tracking
    const platform = 'public';

    // Enforce 1000 row limit for public requests
    const pageSize = Math.min(payload.page_size ?? 1000, 1000);

    // Build filter incrementally
    const filter: ContactFilter = {};
    if (payload.filters) {
      if (payload.filters.segment) filter.segment = payload.filters.segment;
      if (payload.filters.language) filter.language = payload.filters.language;
      if (payload.filters.opt_out_whatsapp !== undefined) filter.opt_out_whatsapp = payload.filters.opt_out_whatsapp;
      if (payload.filters.opt_out_email !== undefined) filter.opt_out_email = payload.filters.opt_out_email;
      if (payload.filters.opt_out_call !== undefined) filter.opt_out_call = payload.filters.opt_out_call;
      if (payload.filters.tags) filter.tags = payload.filters.tags;
      if (payload.filters.tags_any) filter.tags_any = payload.filters.tags_any;
      
      // Basic location/industry fields allowed for public search
      if (payload.filters.city) filter.city = payload.filters.city;
      if (payload.filters.state) filter.state = payload.filters.state;
      if (payload.filters.industry) filter.industry = payload.filters.industry;
    }

    const result = await queryService.query(
      {
        ...payload,
        filters: filter,
        page_size: pageSize,
      },
      platform,
    );

    res.json(result);
  }),
);

export default router;
