/**
 * BullMQ normaliser worker — processes upload jobs.
 *
 * For each job:
 *   1. Update job status → 'processing'
 *   2. Count total rows (first pass — for progress denominator)
 *   3. Stream rows through NormaliserService, batch into groups of 500
 *   4. Bulk upsert each batch into contacts table
 *   5. Update progress every batch
 *   6. Update job status → 'done' or 'failed'
 *   7. Delete the temp file
 *
 * Rules:
 *   - NEVER load the full file into memory. Stream row-by-row.
 *   - Batch size = 500 rows (balances insert overhead vs. memory).
 *   - Failed rows are counted but do not abort the whole job.
 *   - Temp file is always deleted (even on failure).
 */

import { Worker, type Job } from 'bullmq';
import fs from 'node:fs';
import { parse as parseCsv } from 'fast-csv';
import redis from '../db/redis';
import { normaliseRow } from '../services/NormaliserService';
import { bulkUpsertContacts } from '../db/queries/contacts';
import { updateJobStatus, incrementJobProgress } from '../db/queries/uploadJobs';
import { NORMALISER_QUEUE_NAME } from '../config/limits';
import { workerLogger } from '../middleware/logger';
import type { NormaliserJobData } from '../services/JobService';
import type { UpsertContactInput } from '../db/queries/contacts';
import type { StandardField } from '../types/models';
import { s3Service } from '../utils/s3';

const BATCH_SIZE = 500;

async function processJob(job: Job<NormaliserJobData>): Promise<void> {
  const { jobId, s3Key, segment, fieldMapping } = job.data;

  workerLogger.info({ message: 'Processing job', jobId, segment, s3Key });

  let filePath: string | null = null;
  
  try {
    await updateJobStatus(jobId, 'processing');

    // ─── Download from S3 to local temp ──────────────────────────────────
    filePath = await s3Service.downloadToTemp(s3Key);
    workerLogger.debug({ message: 'S3 file downloaded', jobId, filePath });

    let processedRows = 0;
    let failedRows = 0;
    let batch: UpsertContactInput[] = [];

    const flushBatch = async (): Promise<void> => {
      if (batch.length === 0) return;
      try {
        await bulkUpsertContacts(batch);
        processedRows += batch.length;
      } catch (err) {
        failedRows += batch.length;
        workerLogger.error({ message: 'Batch upsert failed', jobId, err });
      }
      await incrementJobProgress(jobId, batch.length, 0);
      await job.updateProgress(processedRows);
      batch = [];
    };

    // ─── Pass 1: Count total rows for progress denominator ─────────────
    let totalRows = 0;
    await new Promise<void>((resolve, reject) => {
      if (!filePath) return reject(new Error('File path is missing'));
      fs.createReadStream(filePath)
        .pipe(parseCsv({ headers: true, ignoreEmpty: true }))
        .on('data', () => {
          totalRows++;
        })
        .on('error', reject)
        .on('end', resolve);
    });

    workerLogger.info({ message: 'Row count complete', jobId, totalRows });
    await updateJobStatus(jobId, 'processing', { total_rows: totalRows });

    // ─── Pass 2: Normalise and Insert ──────────────────────────────────
    const fileStream = fs.createReadStream(filePath);
    const csvStream = fileStream.pipe(parseCsv({ headers: true, ignoreEmpty: true }));

    for await (const row of csvStream) {
      const result = normaliseRow(
        row as Record<string, string>,
        fieldMapping as Record<string, StandardField>,
        segment,
        jobId,
      );

      if (!result.contact) {
        failedRows++;
        workerLogger.debug({ message: 'Skipped row', jobId, error: result.error });
      } else {
        batch.push(result.contact);
      }

      if (batch.length >= BATCH_SIZE) {
        await flushBatch();
      }
    }

    await flushBatch(); // Final flush

    await updateJobStatus(jobId, 'done', { processed_rows: processedRows, failed_rows: failedRows });
    workerLogger.info({ message: 'Job complete', jobId, processedRows, failedRows });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await updateJobStatus(jobId, 'failed', { error_log: errorMessage });
    workerLogger.error({ message: 'Job failed', jobId, err });
    throw err; // Re-throw so BullMQ can retry
  } finally {
    // Always clean up the temp file
    if (filePath) {
      fs.unlink(filePath, (err) => {
        if (err) {
          workerLogger.warn({ message: 'Failed to delete temp file', filePath, err: err.message });
        }
      });
    }
  }
}

export function createNormaliserWorker(): Worker<NormaliserJobData> {
  return new Worker<NormaliserJobData>(NORMALISER_QUEUE_NAME, processJob, {
    connection: redis,
    concurrency: parseInt(process.env['WORKER_CONCURRENCY'] ?? '3', 10),
  });
}
