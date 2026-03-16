import type { RawAnalysisResult } from '../analysis/dto/AnalysisResult';

export interface PersistedAnalysisRecord {
  jobId: string;
  createdAt: string;
  completedAt: string;
  analysisVersion: number;
  result: RawAnalysisResult;
}

export interface AnalysisResultStore {
  save(record: PersistedAnalysisRecord): Promise<void>;
  getByJobId(jobId: string): Promise<PersistedAnalysisRecord | undefined>;
}
