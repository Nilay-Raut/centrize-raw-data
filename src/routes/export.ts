/**
 * GET /api/export
 *
 * Guarded by:
 *   1. apiKeyAuth   — valid platform key; must have can_view_raw = true
 *   2. jwtAuth      — valid admin JWT (set by admin portal login)
 *   3. ipAllowlist  — origin IP must be in ADMIN_IP_ALLOWLIST
 *
 * Query params: segment, language, company_name, industry, city, state,
 *               tags, opt_out_whatsapp, opt_out_email
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
import { ValidationError, ForbiddenError, InternalError } from '../types/errors';
import { logger } from '../middleware/logger';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';
import type { ContactFilter } from '../types/models';

const router = Router();

const validateExport = [
  query('segment').optional().isString().trim(),
  query('language').optional().isString().trim(),
  query('company_name').optional().isString().trim(),
  query('industry').optional().isString().trim(),
  query('city').optional().isString().trim(),
  query('state').optional().isString().trim(),
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

    // Block export for masked-access keys (can_view_raw: false).
    // Full-access keys (can_view_raw: true) pass through.
    if (!req.resolvedApiKey?.canViewRaw) {
      next(new ForbiddenError('This API key does not have raw data export access. Use a Full Access key.'));
      return;
    }

    const q = req.query as Record<string, string>;

    const filter: ContactFilter = {};
    if (q['segment']) filter.segment = q['segment'];
    if (q['language']) filter.language = q['language'];
    if (q['company_name']) filter.company_name = q['company_name'];
    if (q['industry']) filter.industry = q['industry'];
    if (q['city']) filter.city = q['city'];
    if (q['state']) filter.state = q['state'];
    if (q['opt_out_whatsapp'] !== undefined) filter.opt_out_whatsapp = q['opt_out_whatsapp'] === 'true';
    if (q['opt_out_email'] !== undefined) filter.opt_out_email = q['opt_out_email'] === 'true';
    if (q['tags']) filter.tags = q['tags'].split(',').map((t) => t.trim()).filter(Boolean);

    // Pre-flight: verify DB is reachable BEFORE setting headers.
    // Once headers are sent we can no longer return a JSON error to the client.
    try {
      await exportService.preflight();
    } catch {
      next(new InternalError('Database unavailable — please retry in a moment.'));
      return;
    }

    const filename = `export-${q['segment'] ?? 'all'}-${dayjs().format('YYYY-MM-DD-HHmm')}.csv`;

    logger.info({
      message: 'CSV export started',
      admin: req.jwtPayload?.email,
      ip: req.ip,
      filter,
      filename,
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-store');

    // Stream — headers are queued but NOT yet flushed (headersSent = false until first write).
    try {
      await exportService.stream(filter, res);
      logger.info({ message: 'CSV export completed', admin: req.jwtPayload?.email, filename });
    } catch (streamErr) {
      const cause = streamErr instanceof Error ? streamErr.message : String(streamErr);
      logger.error({ message: 'CSV export stream failed', cause, admin: req.jwtPayload?.email, filename });
      if (!res.headersSent) {
        // DB/stream failed before writing a single byte — send a clean JSON error with cause
        next(new InternalError(`Export failed: ${cause}`));
      } else if (!res.writableEnded) {
        // Partial data already sent — close the connection cleanly (truncated CSV)
        res.end();
      }
    }
  }),
);

export default router;
