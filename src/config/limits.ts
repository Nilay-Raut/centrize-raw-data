/**
 * Rate limit tiers and page size caps.
 *
 * ALL limits live here. Never hardcode limit numbers in route files or middleware.
 * To adjust a platform's limits: change here, redeploy — no DB change needed.
 *
 * These values match the documentation in HOW_TO_USE.md § 7.
 */

export interface PlatformLimits {
  /** Sliding window duration in milliseconds */
  windowMs: number;
  /** Maximum requests within the window */
  max: number;
  /** Maximum contacts returnable per page — API consumers cannot exceed this */
  maxPageSize: number;
  /** Human-readable window description for error messages */
  windowLabel: string;
}

export const LIMITS: Record<string, PlatformLimits> = {
  whatsapp: {
    windowMs: 60_000,      // 1 minute
    max: 100,
    maxPageSize: 1_000,
    windowLabel: '1 minute',
  },

  email: {
    windowMs: 60_000,      // 1 minute
    max: 60,
    maxPageSize: 2_000,
    windowLabel: '1 minute',
  },

  admin: {
    windowMs: 60_000,      // 1 minute
    max: 300,
    maxPageSize: 5_000,
    windowLabel: '1 minute',
  },

  csv_export: {
    windowMs: 3_600_000,   // 1 hour
    max: 5,
    maxPageSize: 500_000,  // Streamed — not a memory concern
    windowLabel: '1 hour',
  },

  public: {
    windowMs: 60_000,      // 1 minute
    max: 20,
    maxPageSize: 1_000,
    windowLabel: '1 minute',
  },
} as const;

/** Default page size when the caller does not specify one */
export const DEFAULT_PAGE_SIZE = 100;

/** Absolute maximum page size regardless of platform — safety cap */
export const ABSOLUTE_MAX_PAGE_SIZE = 500_000;

/** Server event loop lag threshold (ms) before returning 503 */
export const SERVER_BUSY_LAG_MS = 1000;

/** BullMQ job queue name for the normaliser worker */
export const NORMALISER_QUEUE_NAME = 'normaliser';

/** Redis key prefix for API key platform cache */
export const API_KEY_CACHE_PREFIX = 'apikey:platform:';

/** Redis TTL for cached API key resolutions (seconds) */
export const API_KEY_CACHE_TTL_SECONDS = 300; // 5 minutes

/** Maximum upload file size label for error messages */
export const UPLOAD_MAX_BYTES_LABEL = '50MB';
