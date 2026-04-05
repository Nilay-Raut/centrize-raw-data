/**
 * POST /api/query
 *
 * Middleware chain: apiKeyAuth → rateLimiter → validate → handler
 *
 * Auth:  API key (X-Api-Key header)
 * Rate:  Platform tier (whatsapp/email/admin)
 * Body:  FilterPayload
 * Returns: QueryResult (paginated contact list with cursor)
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { queryService } from '../services/QueryService';
import { ValidationError } from '../types/errors';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';
import type { FilterPayload, ContactFilter } from '../types/models';

const router = Router();

export const validateQuery = [
  body('filters').optional().isObject().withMessage('filters must be an object'),
  body('page_size').optional().isInt({ min: 1, max: 500_000 }).withMessage('page_size must be a positive integer'),
  body('cursor').optional().isString(),
  body('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
  body('fields').optional().isArray(),
];

router.post(
  '/query',
  apiKeyAuth,
  rateLimiterMiddleware,
  validateQuery,
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

    const payload = req.body as FilterPayload;
    if (!req.resolvedApiKey) {
      next(new ValidationError('API key resolution failed'));
      return;
    }
    const { platform } = req.resolvedApiKey;

    // Build filter incrementally to satisfy exactOptionalPropertyTypes
    const filter: ContactFilter = {};
    if (payload.filters) {
      if (payload.filters.segment) filter.segment = payload.filters.segment;
      if (payload.filters.language) filter.language = payload.filters.language;
      if (payload.filters.opt_out_whatsapp !== undefined) filter.opt_out_whatsapp = payload.filters.opt_out_whatsapp;
      if (payload.filters.opt_out_email !== undefined) filter.opt_out_email = payload.filters.opt_out_email;
      if (payload.filters.opt_out_call !== undefined) filter.opt_out_call = payload.filters.opt_out_call;
      if (payload.filters.tags) filter.tags = payload.filters.tags;
      if (payload.filters.tags_any) filter.tags_any = payload.filters.tags_any;

      // Extended search fields
      if (payload.filters.city) filter.city = payload.filters.city;
      if (payload.filters.state) filter.state = payload.filters.state;
      if (payload.filters.industry) filter.industry = payload.filters.industry;
      if (payload.filters.sector) filter.sector = payload.filters.sector;
      if (payload.filters.company_name) filter.company_name = payload.filters.company_name;
    }

    const result = await queryService.query(
      {
        ...payload,
        filters: filter,
      },
      platform,
    );
    res.json(result);
  }),
);

export default router;
