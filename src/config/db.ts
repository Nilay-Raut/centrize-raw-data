/**
 * Knex configuration for PostgreSQL.
 * The knex singleton is created in src/db/knex.ts — import from there.
 * This file only exports the config object (testable without side effects).
 */

import type { Knex } from 'knex';
import { env } from './env';

export const knexConfig: Knex.Config = {
  client: 'pg',
  connection: env.databaseUrl,
  pool: {
    min: env.dbPoolMin,
    max: env.dbPoolMax,
    // Knex default acquireTimeoutMillis is 60s — acceptable
  },
  migrations: {
    directory: './src/db/migrations',
    extension: 'ts',
    tableName: 'knex_migrations',
  },
  // Log slow queries in development
  ...(env.isProd
    ? {}
    : {
        debug: false,
        log: {
          warn(message: string): void {
            console.warn('[knex]', message);
          },
        },
      }),
};
