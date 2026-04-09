/**
 * GET /api/export
 *
 * Triple-guarded route:
 *   1. apiKeyAuth   — valid platform key (csv_export tier)
 *   2. jwtAuth      — valid admin JWT
 *   3. ipAllowlist  — origin IP must be in ADMIN_IP_ALLOWLIST
 *
 * Query params: same filter fields as POST /api/query
 * Streams a CSV file — never buffers the full result set.
 * Each export is logged for audit purposes.
 */

import { Router } from 'express';
import { query, validationResult } from 'express-validator';
import dayjs from 'dayjs';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { jwtAuth } from '../middleware/jwtAuth';
import { ipAllowlist } from '../middleware/ipAllowlist';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { exportService } from '../services/ExportService';
import { ValidationError, ForbiddenError } from '../types/errors';
import { logger } from '../middleware/logger';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';
import type { ContactFilter } from '../types/models';

const router = Router();

const validateExport = [
  query('segment').optional().isString().trim(),
  query('language').optional().isString().trim(),
  query('opt_out_whatsapp').optional().isIn(['true', 'false']),
  query('opt_out_email').optional().isIn(['true', 'false']),
  query('tags').optional().isString(),
];

router.get(
  '/export',
  apiKeyAuth,
  jwtAuth,
  ipAllowlist,
  rateLimiterMiddleware,
  validateExport,
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid export filters', errorData));
      return;
    }

    const q = req.query as Record<string, string>;

    // Restriction: Only "Raw Access" keys can export CSV data
    if (!req.resolvedApiKey?.canViewRaw) {
      next(new ForbiddenError('Your API key is not authorized for raw data export. Please contact an administrator.'));
      return;
    }

    const filter: ContactFilter = {};
    if (q['segment']) filter.segment = q['segment'];
    if (q['language']) filter.language = q['language'];
    if (q['opt_out_whatsapp'] !== undefined) filter.opt_out_whatsapp = q['opt_out_whatsapp'] === 'true';
    if (q['opt_out_email'] !== undefined) filter.opt_out_email = q['opt_out_email'] === 'true';
    if (q['tags']) filter.tags = q['tags'].split(',').map((t) => t.trim()).filter(Boolean);

    const filename = `export-${q['segment'] ?? 'all'}-${dayjs().format('YYYY-MM-DD-HHmm')}.csv`;

    // Audit log — every export is recorded
    logger.info({
      message: 'CSV export started',
      keyPrefix: req.resolvedApiKey?.keyPrefix,
      admin: req.jwtPayload?.email,
      ip: req.ip,
      filter,
      filename,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-store');
    await exportService.stream(filter, res);

  }),
);

export default router;
