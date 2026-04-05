/**
 * All SQL for the upload_jobs table.
 * The BullMQ worker updates progress here as it processes rows.
 */

import db from '../knex';
import type { UploadJob, JobStatus } from '../../types/models';

export async function createJob(input: {
  filename: string;
  segment: string;
}): Promise<string> {
  const [row] = (await db('upload_jobs')
    .insert({ filename: input.filename, segment: input.segment })
    .returning('id')) as { id: string }[];
  return row?.id ?? '';
}

export async function getJob(id: string): Promise<UploadJob | null> {
  const row = (await db('upload_jobs').where({ id }).first()) as UploadJob | undefined;
  return row ?? null;
}

export async function updateJobStatus(
  id: string,
  status: JobStatus,
  extras?: { total_rows?: number; processed_rows?: number; failed_rows?: number; error_log?: string },
): Promise<void> {
  await db('upload_jobs')
    .where({ id })
    .update({ status, ...extras });
}

export async function incrementJobProgress(
  id: string,
  processedDelta: number,
  failedDelta: number,
): Promise<void> {
  await db('upload_jobs')
    .where({ id })
    .increment('processed_rows', processedDelta)
    .increment('failed_rows', failedDelta);
}

export async function listRecentJobs(limit = 50): Promise<UploadJob[]> {
  return db('upload_jobs')
    .select('*')
    .orderBy('created_at', 'desc')
    .limit(limit) as Promise<UploadJob[]>;
}

export async function deleteJob(id: string): Promise<void> {
  await db('upload_jobs').where({ id }).delete();
}

