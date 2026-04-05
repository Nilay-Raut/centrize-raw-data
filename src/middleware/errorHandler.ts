/**
 * Central error handler middleware.
 *
 * Receives all thrown errors from routes and services.
 * Formats a consistent JSON error response.
 * NEVER call res.json() with error details from route files — throw AppError instead.
 *
 * Must be the LAST middleware registered in app.ts.
 */

import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors';
import { logger } from './logger';

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    // Operational error — log at warn level (not an alert)
    logger.warn({
      message: err.message,
      code: err.code,
      statusCode: err.statusCode,
      context: err.context,
    });

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      ...(err.context ?? {}),
    });
    return;
  }

  // Unexpected error — log at error level
  logger.error({ message: 'Unhandled error', err });

  // Never expose internal error details in production
  res.status(500).json({
    error: 'An unexpected error occurred',
    code: 'INTERNAL_ERROR',
  });
}
