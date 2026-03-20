import { randomUUID } from 'node:crypto';
import os from 'node:os';

import type { RawAnalysisResult } from '../analysis/dto/AnalysisResult';
import { AppError } from '../shared/errors/AppError';
import type { AnalysisResultStore } from '../storage/AnalysisResultStore';
import type { AnalysisJobRecord } from './JobStore';
import { JobStore } from './JobStore';

export interface AnalysisRequest {
  pgn: string;
  depth?: number;
  enableCoaching?: boolean;
  coachingMultiPv?: number;
}

export type AnalysisRunner = (
  request: AnalysisRequest,
  onProgress: (progress: { currentPly: number; totalPlies: number; percent: number }) => void,
) => Promise<RawAnalysisResult>;

export class AnalysisJobManager {
  private readonly store: JobStore;
  private readonly queuedJobs: Array<{ jobId: string; request: AnalysisRequest }> = [];
  private activeJobs = 0;
  private readonly maxConcurrentJobs: number;
  private readonly analysisResultStore?: AnalysisResultStore;

  public constructor(
    private readonly runner: AnalysisRunner,
    store?: JobStore,
    options?: { maxConcurrentJobs?: number; analysisResultStore?: AnalysisResultStore },
  ) {
    this.store = store ?? new JobStore();
    this.maxConcurrentJobs = Math.max(1, options?.maxConcurrentJobs ?? Math.max(1, Math.floor(os.availableParallelism() / 2)));
    this.analysisResultStore = options?.analysisResultStore;
  }

  public createJob(request: AnalysisRequest): { jobId: string } {
    const jobId = randomUUID();
    const now = new Date().toISOString();
    this.store.create({
      jobId,
      state: 'queued',
      progress: 0,
      currentPly: 0,
      totalPlies: 0,
      createdAt: now,
      updatedAt: now,
    });

    console.info('[AnalysisJobManager] Job queued', {
      jobId,
      depth: request.depth,
      pgnLength: request.pgn.length,
    });

    this.queuedJobs.push({ jobId, request });
    this.dispatch();
    return { jobId };
  }

  public async runSynchronous(request: AnalysisRequest): Promise<RawAnalysisResult> {
    const result = await this.runner(request, () => {
      return;
    });

    return {
      ...result,
      pgn: request.pgn,
    };
  }

  public getStatus(jobId: string): AnalysisJobRecord | undefined {
    return this.store.get(jobId);
  }

  public getResult(jobId: string): AnalysisJobRecord | undefined {
    return this.store.get(jobId);
  }

  private async runJob(jobId: string, request: AnalysisRequest): Promise<void> {
    console.info('[AnalysisJobManager] Job started', {
      jobId,
      depth: request.depth,
    });

    this.store.update(jobId, {
      state: 'running',
      progress: 0,
      currentPly: 0,
      totalPlies: 0,
    });

    try {
      const rawResult = await this.runner(request, ({ currentPly, totalPlies, percent }) => {
        console.debug('[AnalysisJobManager] Job progress', {
          jobId,
          currentPly,
          totalPlies,
          percent,
        });

        this.store.update(jobId, {
          progress: percent,
          currentPly,
          totalPlies,
        });
      });

      const result: RawAnalysisResult = {
        ...rawResult,
        pgn: request.pgn,
      };

      this.store.update(jobId, {
        state: 'completed',
        progress: 100,
        result,
      });

      if (this.analysisResultStore) {
        const completedRecord = this.store.get(jobId);
        if (!completedRecord) {
          throw new AppError('Completed job was not found in memory store.', 'JOB_STATE_ERROR', { jobId });
        }

        await this.analysisResultStore.save({
          jobId,
          createdAt: completedRecord.createdAt,
          completedAt: completedRecord.updatedAt,
          analysisVersion: 1,
          result,
        });
      }

      console.info('[AnalysisJobManager] Job completed', {
        jobId,
        moves: result.moves.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown analysis error';

      console.error('[AnalysisJobManager] Job failed', {
        jobId,
        message,
        error,
      });

      this.store.update(jobId, {
        state: 'failed',
        result: undefined,
        error: {
          code: error instanceof AppError ? error.code : 'ANALYSIS_FAILED',
          message,
        },
      });
    } finally {
      this.activeJobs -= 1;
      this.dispatch();
    }
  }

  private dispatch(): void {
    while (this.activeJobs < this.maxConcurrentJobs && this.queuedJobs.length > 0) {
      const next = this.queuedJobs.shift();
      if (!next) {
        return;
      }

      this.activeJobs += 1;
      console.info('[AnalysisJobManager] Dispatching job', {
        jobId: next.jobId,
        activeJobs: this.activeJobs,
        queuedJobs: this.queuedJobs.length,
        maxConcurrentJobs: this.maxConcurrentJobs,
      });
      void this.runJob(next.jobId, next.request);
    }
  }
}