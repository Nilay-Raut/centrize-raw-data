/**
 * Extends Express Request with CDP-specific fields injected by middleware.
 * apiKeyAuth middleware sets: platform, resolvedApiKey
 * jwtAuth middleware sets: jwtPayload
 */

import { JwtPayload, ResolvedApiKey } from './models';

declare global {
  namespace Express {
    interface Request {
      /** Resolved from the API key — set by apiKeyAuth middleware */
      resolvedApiKey?: ResolvedApiKey;
      /** Decoded JWT payload — set by jwtAuth middleware */
      jwtPayload?: JwtPayload;
    }
  }
}

export {};
