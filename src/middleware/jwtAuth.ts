/**
 * JWT authentication middleware.
 *
 * Applied to admin-only routes: POST /api/ingest, GET /api/export, GET /api/status.
 * The admin portal logs in via POST /api/auth/login and receives a JWT.
 * All subsequent requests include: Authorization: Bearer <token>
 *
 * On success: sets req.jwtPayload with decoded token claims.
 * On failure: throws UnauthorisedError (caught by errorHandler).
 */

import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { UnauthorisedError } from '../types/errors';
import type { JwtPayload } from '../types/models';

export function jwtAuth(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    next(new UnauthorisedError('Missing or malformed Authorization header'));
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  try {
    const payload = jwt.verify(token, env.jwtSecret) as JwtPayload;
    req.jwtPayload = payload;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      next(new UnauthorisedError('Token expired — please log in again'));
    } else if (err instanceof jwt.JsonWebTokenError) {
      next(new UnauthorisedError('Invalid token'));
    } else {
      next(err);
    }
  }
}
