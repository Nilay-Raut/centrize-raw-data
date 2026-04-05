/**
 * IP allowlist guard — applied ONLY to GET /api/export.
 *
 * The export route has 3 layers of security:
 *   1. apiKeyAuth   — valid platform key required
 *   2. jwtAuth      — valid admin JWT required
 *   3. ipAllowlist  — request must originate from a registered IP (this file)
 *
 * JWT alone is insufficient for bulk data export (50k–500k rows).
 * The allowlist is set in ADMIN_IP_ALLOWLIST env var (comma-separated).
 *
 * To add a new IP: update .env → pm2 reload cdp-api (no code change needed).
 */

import type { Request, Response, NextFunction } from 'express';
import { env } from '../config/env';
import { ForbiddenError } from '../types/errors';
import { logger } from './logger';

export function ipAllowlist(req: Request, _res: Response, next: NextFunction): void {
  // req.ip respects X-Forwarded-For when Express trust proxy is set
  const clientIp = req.ip ?? '';

  if (env.adminIps.includes(clientIp)) {
    next();
    return;
  }

  // Log the blocked attempt — useful for security audits
  logger.warn({
    message: 'Export route blocked — IP not in allowlist',
    ip: clientIp,
    path: req.path,
  });

  next(new ForbiddenError('Your IP address is not authorised for data export'));
}
