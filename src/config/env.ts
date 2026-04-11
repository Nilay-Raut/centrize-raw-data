/**
 * Environment variable validation and export.
 *
 * This module MUST be imported before anything else in server.ts and workerBoot.ts.
 * If any required variable is missing, the process exits immediately (fail fast).
 * Never access process.env directly elsewhere — import from this module.
 */

import 'dotenv/config';

const required: string[] = [
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'ALLOWED_ORIGINS',
  'ADMIN_IP_ALLOWLIST',
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  process.exit(1);
}

// S3 vars are only required when USE_S3=true
if (process.env['USE_S3'] === 'true') {
  const s3Required = ['S3_BUCKET', 'S3_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'];
  const s3Missing = s3Required.filter((key) => !process.env[key]);
  if (s3Missing.length > 0) {
    console.error(`[startup] USE_S3=true but missing S3 environment variables: ${s3Missing.join(', ')}`);
    process.exit(1);
  }
}

function getInt(key: string, fallback: number): number {
  const val = process.env[key];
  if (!val) return fallback;
  const parsed = parseInt(val, 10);
  if (isNaN(parsed)) {
    console.error(`[startup] Invalid integer for env var ${key}: "${val}"`);
    process.exit(1);
  }
  return parsed;
}

export const env = {
  nodeEnv: process.env['NODE_ENV'] ?? 'development',
  port: getInt('PORT', 3000),
  isProd: process.env['NODE_ENV'] === 'production',

  // Database
  databaseUrl: process.env['DATABASE_URL']!,
  dbPoolMin: getInt('DATABASE_POOL_MIN', 2),
  dbPoolMax: getInt('DATABASE_POOL_MAX', 10),

  // Redis
  redisUrl: process.env['REDIS_URL']!,

  // Auth
  jwtSecret: process.env['JWT_SECRET']!,
  jwtExpiresIn: process.env['JWT_EXPIRES_IN'] ?? '8h',

  // Security
  allowedOrigins: process.env['ALLOWED_ORIGINS']!.split(',').map((o) => o.trim()),
  adminIps: process.env['ADMIN_IP_ALLOWLIST']!.split(',').map((ip) => ip.trim()),

  // Worker
  workerConcurrency: getInt('WORKER_CONCURRENCY', 3),

  // Upload
  uploadMaxBytes: getInt('UPLOAD_MAX_BYTES', 52_428_800), // 50MB default

  // Storage mode: true = upload to S3 then worker downloads; false = pass local temp path
  useS3: process.env['USE_S3'] === 'true',

  // S3 Storage (only used when useS3=true)
  s3Bucket: process.env['S3_BUCKET'] ?? '',
  s3Region: process.env['S3_REGION'] ?? '',
  awsAccessKey: process.env['AWS_ACCESS_KEY_ID'] ?? '',
  awsSecretKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',

  // Logging
  logLevel: process.env['LOG_LEVEL'] ?? 'info',
} as const;
