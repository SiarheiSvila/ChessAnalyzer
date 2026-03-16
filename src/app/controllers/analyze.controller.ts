import type { Request, Response } from 'express';

import type { AnalysisJobManager } from '../../jobs/AnalysisJobManager';

interface AnalyzeRequestBody {
  pgn?: unknown;
  settings?: {
    depth?: unknown;
  };
  synchronous?: unknown;
}

function asValidDepth(input: unknown): number | undefined {
  if (input === undefined) {
    return undefined;
  }

  if (typeof input !== 'number' || Number.isNaN(input) || input < 1 || input > 40) {
    return undefined;
  }

  return Math.floor(input);
}

export class AnalyzeController {
  public constructor(private readonly jobManager: AnalysisJobManager) {}

  public createAnalysis = async (request: Request, response: Response): Promise<void> => {
    const body = request.body as AnalyzeRequestBody;
    const pgn = typeof body.pgn === 'string' ? body.pgn.trim() : '';
    const depth = asValidDepth(body.settings?.depth);
    const synchronous = body.synchronous === true;

    console.info('[AnalyzeController] Create analysis request', {
      synchronous,
      depth,
      pgnLength: pgn.length,
    });

    if (!pgn) {
      console.warn('[AnalyzeController] Validation failed: empty PGN');
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Field `pgn` must be a non-empty string.',
        },
      });
      return;
    }

    if (body.settings?.depth !== undefined && depth === undefined) {
      console.warn('[AnalyzeController] Validation failed: invalid depth', {
        providedDepth: body.settings?.depth,
      });
      response.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Field `settings.depth` must be a number between 1 and 40.',
        },
      });
      return;
    }

    if (synchronous) {
      try {
        const result = await this.jobManager.runSynchronous({ pgn, depth });
        console.info('[AnalyzeController] Synchronous analysis completed', {
          moves: result.moves.length,
        });
        response.status(200).json({ mode: 'synchronous', result });
      } catch (error) {
        console.error('[AnalyzeController] Synchronous analysis failed', {
          message: error instanceof Error ? error.message : 'Unknown analysis error',
          error,
        });
        response.status(500).json({
          error: {
            code: 'ANALYSIS_FAILED',
            message: error instanceof Error ? error.message : 'Unknown analysis error',
          },
        });
      }

      return;
    }

    const { jobId } = this.jobManager.createJob({ pgn, depth });
    console.info('[AnalyzeController] Asynchronous job created', { jobId });
    response.status(202).json({ jobId });
  };

  public getStatus = (request: Request, response: Response): void => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;
    console.debug('[AnalyzeController] Status requested', { jobId });
    const record = this.jobManager.getStatus(jobId);
    if (!record) {
      response.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Analysis job was not found.',
        },
      });
      return;
    }

    response.status(200).json({
      jobId: record.jobId,
      state: record.state,
      progress: record.progress,
      currentPly: record.currentPly,
      totalPlies: record.totalPlies,
      error: record.error,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  };

  public getResult = (request: Request, response: Response): void => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;
    console.debug('[AnalyzeController] Result requested', { jobId });
    const record = this.jobManager.getResult(jobId);
    if (!record) {
      response.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Analysis job was not found.',
        },
      });
      return;
    }

    if (record.state === 'failed') {
      response.status(500).json({
        jobId: record.jobId,
        state: record.state,
        error: record.error,
      });
      return;
    }

    if (record.state !== 'completed' || !record.result) {
      response.status(202).json({
        jobId: record.jobId,
        state: record.state,
        progress: record.progress,
      });
      return;
    }

    response.status(200).json({
      jobId: record.jobId,
      state: record.state,
      result: record.result,
    });
  };
}