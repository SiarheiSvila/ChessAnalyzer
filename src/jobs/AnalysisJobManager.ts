import { randomUUID } from 'node:crypto';
import os from 'node:os';

import type { RawAnalysisResult } from '../analysis/dto/AnalysisResult';
import type { AnalysisJobRecord } from './JobStore';
import { JobStore } from './JobStore';

export interface AnalysisRequest {
  pgn: string;
  depth?: number;
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

  public constructor(
    private readonly runner: AnalysisRunner,
    store?: JobStore,
    options?: { maxConcurrentJobs?: number },
  ) {
    this.store = store ?? new JobStore();
    this.maxConcurrentJobs = Math.max(1, options?.maxConcurrentJobs ?? Math.max(1, Math.floor(os.availableParallelism() / 2)));
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
    return this.runner(request, () => {
      return;
    });
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
      const result = await this.runner(request, ({ currentPly, totalPlies, percent }) => {
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

      this.store.update(jobId, {
        state: 'completed',
        progress: 100,
        result,
      });

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
        error: {
          code: 'ANALYSIS_FAILED',
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