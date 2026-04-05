/**
 * POST /api/ingest
 *
 * Middleware chain: jwtAuth → apiKeyAuth → rateLimiter → multer → validate → handler
 *
 * Auth:    JWT (admin only) + API key
 * Body:    multipart/form-data: file + segment + field_mapping (JSON string)
 * Returns: { job_id, message }
 *
 * The file is saved to disk by multer (temp dir), then its path is passed to the
 * BullMQ worker. The worker deletes the temp file when done.
 */

import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import os from 'node:os';
import { body, validationResult } from 'express-validator';
import { jwtAuth } from '../middleware/jwtAuth';
import { apiKeyAuth } from '../middleware/apiKeyAuth';
import { rateLimiterMiddleware } from '../middleware/rateLimiter';
import { jobService } from '../services/JobService';
import { ValidationError, FileTooLargeError } from '../types/errors';
import { env } from '../config/env';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';
import type { IngestRequest } from '../types/models';

const router = Router();

// Multer — save to OS temp dir, enforce size limit
const upload = multer({
  dest: os.tmpdir(),
  limits: { fileSize: env.uploadMaxBytes },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.csv', '.xlsx', '.xls'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Unsupported file type: ${ext}. Allowed: ${allowed.join(', ')}`));
    }
  },
}).single('file');

const validateIngest = [
  body('segment')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('segment is required')
    .isLength({ max: 100 })
    .withMessage('segment must be 100 chars or fewer')
    .matches(/^[\w-]+$/)
    .withMessage('segment must contain only letters, numbers, hyphens, underscores'),
  body('field_mapping')
    .isString()
    .notEmpty()
    .withMessage('field_mapping is required (JSON string)'),
];

router.post(
  '/ingest',
  jwtAuth,
  apiKeyAuth,
  rateLimiterMiddleware,
  // Multer wraps its own errors — handle size limit specially
  (req: Request, res: Response, next: NextFunction) => {
    upload(req, res, (err: unknown) => {
      if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
        next(new FileTooLargeError(env.uploadMaxBytes));
        return;
      }
      if (err) {
        next(new ValidationError((err as Error).message));
        return;
      }
      next();
    });
  },
  validateIngest,
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid request', errorData));
      return;
    }

    if (!req.file) {
      next(new ValidationError('No file uploaded'));
      return;
    }

    const body = req.body as IngestRequest & { field_mapping: string };
    let fieldMapping: Record<string, string>;

    try {
      fieldMapping = JSON.parse(body.field_mapping) as Record<string, string>;
    } catch {
      next(new ValidationError('field_mapping must be valid JSON'));
      return;
    }

    const jobId = await jobService.enqueue({
      filename: req.file.originalname,
      filePath: req.file.path,
      segment: body.segment,
      fieldMapping,
    });

    res.status(202).json({
      job_id: jobId,
      message: 'File accepted for processing. Poll /api/status/:jobId for progress.',
    });
  }),
);

export default router;
