/**
 * Worker entry point — started by PM2 as a separate process (cdp-worker).
 *
 * This process ONLY runs the BullMQ worker.
 * It shares the same DB + Redis connections but has no HTTP server.
 *
 * PM2 config: see ecosystem.config.js
 */

import { Job } from 'bullmq';
import '../config/env'; // Validate env vars first — fail fast
import { createNormaliserWorker } from './normaliserWorker';
import { workerLogger } from '../middleware/logger';

const worker = createNormaliserWorker();

workerLogger.info({ message: 'Normaliser worker started', pid: process.pid });

worker.on('completed', (job: Job) => {
  workerLogger.info({ message: 'Job completed', jobId: job.id });
});

worker.on('failed', (job: Job | undefined, err: Error) => {
  workerLogger.error({ message: 'Job failed', jobId: job?.id, err: err.message });
});

worker.on('error', (err: Error) => {
  workerLogger.error({ message: 'Worker error', err: err.message });
});

// Graceful shutdown — allow current job to finish
async function shutdown(): Promise<void> {
  workerLogger.info({ message: 'Shutting down worker...' });
  await worker.close();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
