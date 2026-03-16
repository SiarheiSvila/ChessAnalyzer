import type { RawAnalysisResult } from '../analysis/dto/AnalysisResult';

export type AnalysisJobState = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface AnalysisJobRecord {
  jobId: string;
  state: AnalysisJobState;
  progress: number;
  currentPly: number;
  totalPlies: number;
  createdAt: string;
  updatedAt: string;
  error?: {
    code: string;
    message: string;
  };
  result?: RawAnalysisResult;
}

export class JobStore {
  private readonly jobs = new Map<string, AnalysisJobRecord>();

  public create(job: AnalysisJobRecord): void {
    this.jobs.set(job.jobId, job);
  }

  public get(jobId: string): AnalysisJobRecord | undefined {
    return this.jobs.get(jobId);
  }

  public update(jobId: string, patch: Partial<AnalysisJobRecord>): AnalysisJobRecord | undefined {
    const existing = this.jobs.get(jobId);
    if (!existing) {
      return undefined;
    }

    const next: AnalysisJobRecord = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.jobs.set(jobId, next);
    return next;
  }
}