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
import path from 'node:path';
import { parse as parseCsv } from 'fast-csv';
import * as xlsx from 'xlsx';
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

/**
 * Helper to yield to the event loop — prevents blocking the worker's
 * heartbeats to BullMQ/Redis during CPU-intensive loops.
 */
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

/**
 * Get row iterator for the file based on extension.
 * Returns a generator that yields rows as key-value objects.
 */
async function* getRowIterator(filePath: string, s3Key: string): AsyncGenerator<Record<string, any>> {
  const ext = path.extname(s3Key).toLowerCase();

  if (ext === '.xlsx' || ext === '.xls') {
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('Excel file has no sheets');
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) throw new Error(`Sheet "${sheetName}" not found in Excel file`);
    
    const rows = xlsx.utils.sheet_to_json(worksheet, { defval: '' });
    for (let i = 0; i < rows.length; i++) {
      // Yield to event loop every BATCH_SIZE rows during extraction
      if (i > 0 && i % BATCH_SIZE === 0) {
        await yieldToEventLoop();
      }
      yield rows[i] as Record<string, any>;
    }
  } else {
    // Default to CSV
    const stream = fs.createReadStream(filePath).pipe(parseCsv({ headers: true, ignoreEmpty: true }));
    for await (const row of stream) {
      yield row as Record<string, any>;
    }
  }
}

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

      // Allow heartbeats during batching
      await yieldToEventLoop();
    };

    // ─── Pass 1: Count total rows for progress denominator ─────────────
    let totalRows = 0;
    const ext = path.extname(s3Key).toLowerCase();

    if (ext === '.xlsx' || ext === '.xls') {
      // OPTIMIZATION: Get count from Excel range metadata (instant)
      const workbook = xlsx.readFile(filePath, { sheetRows: 1 }); // Just headers to get ref
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName!];
      const ref = worksheet?.['!ref'];
      if (ref) {
        const range = xlsx.utils.decode_range(ref);
        totalRows = range.e.r; // End row index (0-indexed, so 10 rows means e.r is 9, e.r is actual data row count if headers exist)
      }
    } else {
      const countIterator = getRowIterator(filePath, s3Key);
      for await (const _ of countIterator) {
        totalRows++;
      }
    }

    workerLogger.info({ message: 'Row count complete', jobId, totalRows });
    await updateJobStatus(jobId, 'processing', { total_rows: totalRows });

    // ─── Pass 2: Normalise and Insert ──────────────────────────────────
    const processIterator = getRowIterator(filePath, s3Key);

    for await (const row of processIterator) {
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
    lockDuration: 60000,      // Increase to 60s for large batches
    lockRenewTime: 15000,      // Renew every 15s
  });
}
