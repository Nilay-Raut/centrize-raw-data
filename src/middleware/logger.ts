/**
 * Winston structured logger.
 *
 * Use this everywhere instead of console.log.
 * In production: JSON format (machine-readable, log aggregator friendly).
 * In development: pretty colorized format.
 *
 * Rule: NEVER log full API keys, JWTs, or password hashes.
 * Rule: NEVER log full request bodies (may contain PII).
 */

import winston from 'winston';
import { env } from '../config/env';

const { combine, timestamp, json, colorize, simple, errors } = winston.format;

export const logger = winston.createLogger({
  level: env.logLevel,
  format: env.isProd
    ? combine(errors({ stack: true }), timestamp(), json())
    : combine(errors({ stack: true }), colorize(), simple()),
  defaultMeta: { service: 'cdp-api' },
  transports: [new winston.transports.Console()],
  // Do not exit on uncaught exceptions — PM2 handles restarts
  exitOnError: false,
});

/** Logger for the worker process — separate service label */
export const workerLogger = logger.child({ service: 'cdp-worker' });
