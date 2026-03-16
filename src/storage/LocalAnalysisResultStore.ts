import path from 'node:path';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';

import { AppError } from '../shared/errors/AppError';
import type { AnalysisResultStore, PersistedAnalysisRecord } from './AnalysisResultStore';

function assertSafeJobId(jobId: string): void {
  if (!/^[a-zA-Z0-9-]+$/.test(jobId)) {
    throw new AppError('Invalid job id format for storage operation.', 'INVALID_JOB_ID', { jobId });
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPersistedAnalysisRecord(value: unknown): value is PersistedAnalysisRecord {
  if (!isObject(value)) {
    return false;
  }

  return (
    typeof value.jobId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.completedAt === 'string' &&
    typeof value.analysisVersion === 'number' &&
    isObject(value.result)
  );
}

export class LocalAnalysisResultStore implements AnalysisResultStore {
  public constructor(private readonly baseDir: string) {}

  public async save(record: PersistedAnalysisRecord): Promise<void> {
    assertSafeJobId(record.jobId);

    await mkdir(this.baseDir, { recursive: true });

    const finalPath = this.getFilePath(record.jobId);
    const tempPath = `${finalPath}.${Date.now()}.tmp`;
    const payload = `${JSON.stringify(record)}\n`;

    await writeFile(tempPath, payload, 'utf-8');

    try {
      await rename(tempPath, finalPath);
    } catch (error) {
      await unlink(tempPath).catch(() => undefined);
      throw error;
    }
  }

  public async getByJobId(jobId: string): Promise<PersistedAnalysisRecord | undefined> {
    assertSafeJobId(jobId);

    const filePath = this.getFilePath(jobId);

    try {
      const raw = await readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;

      if (!isPersistedAnalysisRecord(parsed)) {
        throw new AppError('Stored analysis payload has invalid format.', 'STORAGE_PARSE_ERROR', { jobId });
      }

      return parsed;
    } catch (error) {
      if (isObject(error) && 'code' in error && error.code === 'ENOENT') {
        return undefined;
      }

      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof SyntaxError) {
        throw new AppError('Stored analysis payload is corrupted JSON.', 'STORAGE_PARSE_ERROR', {
          jobId,
          message: error.message,
        });
      }

      throw new AppError('Failed to read analysis from local storage.', 'STORAGE_READ_ERROR', {
        jobId,
        error,
      });
    }
  }

  private getFilePath(jobId: string): string {
    return path.join(this.baseDir, `${jobId}.json`);
  }
}
