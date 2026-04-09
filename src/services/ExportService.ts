/**
 * ExportService — streams a CSV of filtered contacts directly to the HTTP response.
 *
 * CRITICAL: This service STREAMS — it never loads the full result set into memory.
 * A 5-lakh row export must not crash or significantly increase Node.js heap usage.
 *
 * Pipeline:
 *   PostgreSQL cursor (Knex stream)
 *     → fast-csv formatter
 *       → res (HTTP response stream)
 *
 * Rules:
 *   - stream() is the only method. It pipes and resolves when done.
 *   - On pipeline error, the error is forwarded to the Express error handler.
 *   - Tags array is serialised as semicolon-separated: "delhi;premium;overdue"
 */

import { Readable } from 'node:stream';
import { format as csvFormat } from 'fast-csv';
import type { Response } from 'express';
import { checkDbConnection, streamContactsQuery } from '../db/queries/contacts';
import type { ContactFilter } from '../types/models';

const EXPORT_COLUMNS = [
  'id', 'phone', 'email', 'name', 'language',
  'segment', 'tags', 'opt_out_whatsapp', 'opt_out_email', 'opt_out_call',
  'company_name', 'designation', 'industry', 'sector', 'sub_sector',
  'address', 'city', 'state', 'pincode', 'gender', 'dob', 'website', 'linkedin_url'
] as const;

type ExportRow = Record<typeof EXPORT_COLUMNS[number], unknown>;

export class ExportService {
  /**
   * Verifies DB is reachable. Call this BEFORE setting response headers so
   * a DB-down failure can still return a clean JSON error to the client.
   */
  async preflight(): Promise<void> {
    await checkDbConnection();
  }

  /**
   * Stream a filtered contact list as CSV to the HTTP response.
   *
   * Caller must:
   *   1. Call preflight() first (before setting headers)
   *   2. Set Content-Disposition and Content-Type headers
   *   3. Await this — it resolves when done, throws on error
   *
   * Uses manual pipe() instead of pipeline() so that res is NOT destroyed
   * if the DB stream errors before writing the first byte. That keeps
   * res.headersSent === false, allowing the route to still send a JSON error.
   *
   * Client disconnect is handled internally: the DB stream is destroyed so
   * we stop reading from PostgreSQL and free the connection immediately.
   */
  async stream(filter: ContactFilter, res: Response): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const dbStream: Readable = streamContactsQuery(filter);
      const csvStream = csvFormat<ExportRow, ExportRow>({
        headers: [...EXPORT_COLUMNS],
      }).transform((row: ExportRow) => ({
        ...row,
        tags: Array.isArray(row['tags']) ? (row['tags'] as string[]).join(';') : '',
      }));

      let settled = false;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        dbStream.destroy();
        csvStream.destroy();
        reject(err);
      };

      // Only listen for errors on the DB and CSV streams — NOT on res.
      // Listening on res.on('error') can fire for socket-level issues unrelated
      // to our stream logic, causing spurious failures before any data is written.
      dbStream.on('error', fail);
      csvStream.on('error', fail);

      res.on('finish', () => {
        if (!settled) { settled = true; resolve(); }
      });

      // Client disconnected mid-download → destroy source streams to free the DB connection
      res.once('close', () => {
        if (!res.writableEnded) {
          dbStream.destroy();
          csvStream.destroy();
        }
      });

      // pipe() does NOT destroy res on source error — this is intentional.
      // It keeps res alive so the route can inspect res.headersSent and act accordingly.
      dbStream.pipe(csvStream).pipe(res);
    });
  }
}

export const exportService = new ExportService();
