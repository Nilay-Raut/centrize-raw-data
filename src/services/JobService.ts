/**
 * JobService — enqueue and track BullMQ upload jobs.
 *
 * Rules:
 *   - No Express imports.
 *   - Enqueue returns the job ID immediately — processing is async.
 *   - All DB interaction goes through db/queries/uploadJobs.ts.
 */

import { Queue } from 'bullmq';
import redis from '../db/redis';
import { createJob, getJob, deleteJob as deleteJobInDb } from '../db/queries/uploadJobs';
import { NotFoundError } from '../types/errors';
import { NORMALISER_QUEUE_NAME } from '../config/limits';
import type { UploadJob } from '../types/models';

import { s3Service } from '../utils/s3';

// ─── Queue ────────────────────────────────────────────────────────────────────

export interface NormaliserJobData {
  jobId: string;
  s3Key: string;             // S3 key for the uploaded file
  filename: string;
  segment: string;
  fieldMapping: Record<string, string>;
}

const normaliserQueue = new Queue<NormaliserJobData>(NORMALISER_QUEUE_NAME, {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 5_000 },
    removeOnComplete: { count: 100 },
    removeOnFail: { count: 50 },
  },
});

// ─── Service ──────────────────────────────────────────────────────────────────

export class JobService {
  /**
   * Create a job record in the DB and enqueue it for processing.
   * Returns the job ID immediately — caller polls /api/status/:jobId for progress.
   */
  async enqueue(input: {
    filename: string;
    filePath: string;
    segment: string;
    fieldMapping: Record<string, string>;
  }): Promise<string> {
    // Create the DB record first — so status is visible immediately
    const jobId = await createJob({
      filename: input.filename,
      segment: input.segment,
    });

    // Upload to S3 before queuing — Ensures durability
    const s3Key = `uploads/${jobId}-${input.filename}`;
    await s3Service.uploadFile(input.filePath, s3Key);

    // Add to BullMQ — worker picks this up asynchronously
    await normaliserQueue.add(
      'normalise',
      {
        jobId,
        s3Key,
        filename: input.filename,
        segment: input.segment,
        fieldMapping: input.fieldMapping,
      },
      { jobId }, // Use same ID as DB record for traceability
    );

    return jobId;
  }

  /** Fetch job status — used by GET /api/status/:jobId */
  async getStatus(jobId: string): Promise<UploadJob> {
    const job = await getJob(jobId);
    if (!job) {
      throw new NotFoundError('Upload job', jobId);
    }
    return job;
  }

  /** 
   * Delete a job from the DB AND remove it from the BullMQ history in Redis.
   * This clears the "index data store" (Redis metadata) associated with the job.
   */
  async deleteJob(jobId: string): Promise<void> {
    // 1. Clear BullMQ state (if it exists) to free up Redis memory
    try {
      const job = await normaliserQueue.getJob(jobId);
      if (job) {
        await job.remove();
      }
    } catch (err) {
      // Re-throwing as warning — non-critical if BullMQ is already clean
    }

    // 2. Clear DB record
    await deleteJobInDb(jobId);
  }
}

export const jobService = new JobService();
