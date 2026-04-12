/**
 * Server entry point — called by PM2 as the cdp-api process.
 *
 * Imports app.ts and calls listen().
 * Handles graceful shutdown on SIGTERM/SIGINT.
 *
 * PM2 sends SIGINT before killing the process. We give in-flight requests
 * 10 seconds to complete before forcefully closing.
 */

import './config/env'; // Validate env vars — fail fast before anything else
import app from './app';
import { env } from './config/env';
import { logger } from './middleware/logger';
import db from './db/knex';
import redis from './db/redis';

const server = app.listen(env.port, '0.0.0.0', () => {
  logger.info({
    message: 'CDP API started',
    port: env.port,
    env: env.nodeEnv,
    pid: process.pid,
  });
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ message: `${signal} received — shutting down gracefully` });

  try {
    // 1. Stop accepting new connections
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });

    // 2. Close database and redis connections
    await db.destroy();
    await redis.quit();

    logger.info({ message: 'Connections closed. Goodbye.' });
    process.exit(0);
  } catch (err) {
    logger.error({ message: 'Error during shutdown', err });
    process.exit(1);
  }

  // Force exit after 10s if still alive
  setTimeout(() => {
    logger.error({ message: 'Shutdown timeout — forcing exit' });
    process.exit(1);
  }, 10_000).unref();
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

process.on('uncaughtException', (err) => {
  logger.error({ message: 'Uncaught exception', err });
  void shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
  logger.error({ message: 'Unhandled promise rejection', reason });
  void shutdown('unhandledRejection');
});
