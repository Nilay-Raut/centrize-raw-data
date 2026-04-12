/**
 * POST /api/auth/login — authenticate admin user and return JWT.
 *
 * Rules:
 *   - Only one admin user (stored in admin_users table).
 *   - Uses bcrypt for password verification.
 *   - Returns a JWT signed with JWT_SECRET.
 *   - Admin portal uses this for all /api/admin/* routes.
 */

import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { env } from '../config/env';
import { ValidationError, UnauthorisedError } from '../types/errors';
import db from '../db/knex';
import type { AdminUser, JwtPayload } from '../types/models';
import { catchAsync } from '../utils/catchAsync';
import type { Request, Response, NextFunction } from 'express';

const router = Router();

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

router.post(
  '/auth/login',
  [
    body('email').isEmail().withMessage('Invalid email format').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  catchAsync(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      const errorData: Record<string, string> = {};
      const mappedErrors = errors.mapped();
      Object.entries(mappedErrors).forEach(([key, val]) => {
        errorData[key] = (val as { msg: string }).msg;
      });
      next(new ValidationError('Invalid credentials', errorData));
      return;
    }

    const { email, password, apiKey } = req.body as { 
      email: string; 
      password: string;
      apiKey?: string;
    };

    // Fetch user from DB
    const user = await (db('admin_users').where({ email }).first() as Promise<AdminUser | undefined>);

    if (!user) {
      next(new UnauthorisedError('Invalid email or password'));
      return;
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      next(new UnauthorisedError('Invalid email or password'));
      return;
    }

    // Optional: Verify API key if provided
    let apiKeyContext: Partial<JwtPayload> = {};
    if (apiKey) {
      const { verifyApiKey } = await import('../middleware/apiKeyAuth');
      const resolved = await verifyApiKey(apiKey);
      apiKeyContext = {
        apiKeyPrefix: resolved.keyPrefix,
        apiKeyId: resolved.keyId,
        apiKeyPlatform: resolved.platform,
      };
    }

    const token = jwt.sign(
      { 
        sub: user.id, 
        email: user.email, 
        canViewRaw: user.can_view_raw,
        ...apiKeyContext
      },
      env.jwtSecret,
      {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
        expiresIn: env.jwtExpiresIn as any
      },
    );

    res.json({ token });
  }),
);

export default router;
