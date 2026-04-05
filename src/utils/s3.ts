/**
 * S3Service — handle file persistence to Amazon S3.
 *
 * Uses AWS SDK v3 with @aws-sdk/lib-storage for optimized multipart uploads
 * of large files (up to 50MB).
 */

import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { env } from '../config/env';
import { logger } from '../middleware/logger';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

class S3Service {
  private client: S3Client;

  constructor() {
    this.client = new S3Client({
      region: env.s3Region,
      credentials: {
        accessKeyId: env.awsAccessKey,
        secretAccessKey: env.awsSecretKey,
      },
    });
  }

  /** Upload a local file to S3 */
  async uploadFile(localPath: string, remoteKey: string): Promise<void> {
    const fileStream = fs.createReadStream(localPath);

    const upload = new Upload({
      client: this.client,
      params: {
        Bucket: env.s3Bucket,
        Key: remoteKey,
        Body: fileStream,
      },
    });

    try {
      await upload.done();
      logger.info({ message: 'File uploaded to S3', key: remoteKey });
    } catch (err) {
      logger.error({ message: 'S3 upload failed', key: remoteKey, err });
      throw err;
    }
  }

  /** Download a file from S3 to a local temporary path */
  async downloadToTemp(remoteKey: string): Promise<string> {
    const tempPath = path.join(os.tmpdir(), `${Date.now()}-${remoteKey.replace(/\//g, '-')}`);
    
    try {
      const { Body } = await this.client.send(
        new GetObjectCommand({
          Bucket: env.s3Bucket,
          Key: remoteKey,
        })
      );

      if (!(Body instanceof Readable)) {
        throw new Error('S3 response body is not a readable stream');
      }

      const writeStream = fs.createWriteStream(tempPath);
      await finished(Body.pipe(writeStream));
      
      return tempPath;
    } catch (err) {
      logger.error({ message: 'S3 download failed', key: remoteKey, err });
      throw err;
    }
  }
}

export const s3Service = new S3Service();
