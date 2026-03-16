import type { Request, Response } from 'express';

import type { AnalysisJobManager } from '../../jobs/AnalysisJobManager';
import { AppError } from '../../shared/errors/AppError';
import type { AnalysisResultStore } from '../../storage/AnalysisResultStore';

interface AnalyzeRequestBody {
  pgn?: unknown;
  settings?: {
    depth?: unknown;
  };
  synchronous?: unknown;
}

interface AdminGameListItem {
  jobId: string;
  myName: string;
  myColor: 'white' | 'black';
  myElo: string;
  opponentName: string;
  opponentColor: 'white' | 'black';
  opponentElo: string;
  outcome: 'Win' | 'Loss' | 'Draw' | 'Unknown';
  moves: number;
  date: string;
  sortDate: string;
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

function normalizeName(name: string | undefined): string {
  return typeof name === 'string' && name.trim().length > 0 ? name.trim() : 'Unknown';
}

function normalizeElo(elo: string | undefined): string {
  return typeof elo === 'string' && elo.trim().length > 0 ? elo.trim() : '-';
}

function parseDateToIso(dateHeader: string | undefined, fallbackIso: string): string {
  if (typeof dateHeader !== 'string' || dateHeader.trim().length === 0) {
    return fallbackIso;
  }

  const normalized = dateHeader.trim();
  const match = normalized.match(/^(\d{4})[.\/-](\d{2})[.\/-](\d{2})$/);
  if (!match) {
    return fallbackIso;
  }

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }

  return parsed.toISOString();
}

function toOutcome(result: string | undefined, myColor: 'white' | 'black'): 'Win' | 'Loss' | 'Draw' | 'Unknown' {
  const normalized = typeof result === 'string' ? result.trim() : '';

  if (normalized === '1-0') {
    return myColor === 'white' ? 'Win' : 'Loss';
  }

  if (normalized === '0-1') {
    return myColor === 'black' ? 'Win' : 'Loss';
  }

  if (normalized === '1/2-1/2') {
    return 'Draw';
  }

  return 'Unknown';
}

export class AnalyzeController {
  public constructor(
    private readonly jobManager: AnalysisJobManager,
    private readonly analysisResultStore?: AnalysisResultStore,
  ) {}

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

  public getResult = async (request: Request, response: Response): Promise<void> => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;
    console.debug('[AnalyzeController] Result requested', { jobId });
    const record = this.jobManager.getResult(jobId);

    if (!record) {
      if (!this.analysisResultStore) {
        response.status(404).json({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Analysis job was not found.',
          },
        });
        return;
      }

      try {
        const persisted = await this.analysisResultStore.getByJobId(jobId);
        if (!persisted) {
          response.status(404).json({
            error: {
              code: 'JOB_NOT_FOUND',
              message: 'Analysis job was not found.',
            },
          });
          return;
        }

        response.status(200).json({
          jobId: persisted.jobId,
          state: 'completed',
          result: persisted.result,
        });
        return;
      } catch (error) {
        const appError = error instanceof AppError ? error : new AppError('Failed to read persisted analysis.', 'STORAGE_ERROR', error);

        response.status(500).json({
          error: {
            code: appError.code,
            message: appError.message,
          },
        });
        return;
      }
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

  public getStoredAnalysis = async (request: Request, response: Response): Promise<void> => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;

    if (!this.analysisResultStore) {
      response.status(404).json({
        error: {
          code: 'JOB_NOT_FOUND',
          message: 'Analysis job was not found.',
        },
      });
      return;
    }

    try {
      const persisted = await this.analysisResultStore.getByJobId(jobId);
      if (!persisted) {
        response.status(404).json({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Analysis job was not found.',
          },
        });
        return;
      }

      response.status(200).json({
        jobId: persisted.jobId,
        state: 'completed',
        result: persisted.result,
      });
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Failed to read persisted analysis.', 'STORAGE_ERROR', error);
      response.status(500).json({
        error: {
          code: appError.code,
          message: appError.message,
        },
      });
    }
  };

  public getAdminGames = async (request: Request, response: Response): Promise<void> => {
    if (!this.analysisResultStore?.listAll) {
      response.status(200).json({ games: [] });
      return;
    }

    const configuredPlayer = typeof request.query.player === 'string' && request.query.player.trim().length > 0
      ? request.query.player.trim()
      : (process.env.ADMIN_PLAYER_NAME ?? '').trim();

    try {
      const records = await this.analysisResultStore.listAll();
      const inferredPlayer = (() => {
        if (configuredPlayer.length > 0) {
          return configuredPlayer;
        }

        const counts = new Map<string, number>();
        for (const record of records) {
          const headers = record.result.game.headers;
          const whiteName = normalizeName(headers.White ?? record.result.game.white);
          const blackName = normalizeName(headers.Black ?? record.result.game.black);

          counts.set(whiteName, (counts.get(whiteName) ?? 0) + 1);
          counts.set(blackName, (counts.get(blackName) ?? 0) + 1);
        }

        let bestName = '';
        let bestCount = 0;
        for (const [name, count] of counts.entries()) {
          if (count > bestCount) {
            bestName = name;
            bestCount = count;
          }
        }

        return bestName;
      })();

      const effectivePlayer = inferredPlayer.trim();
      const games: AdminGameListItem[] = records.map((record) => {
        const headers = record.result.game.headers;
        const whiteName = normalizeName(headers.White ?? record.result.game.white);
        const blackName = normalizeName(headers.Black ?? record.result.game.black);
        const whiteElo = normalizeElo(headers.WhiteElo);
        const blackElo = normalizeElo(headers.BlackElo);

        const playerMatchesWhite = effectivePlayer.length > 0 && whiteName.toLowerCase() === effectivePlayer.toLowerCase();
        const playerMatchesBlack = effectivePlayer.length > 0 && blackName.toLowerCase() === effectivePlayer.toLowerCase();

        const myColor: 'white' | 'black' = playerMatchesBlack && !playerMatchesWhite ? 'black' : 'white';
        const sortDate = parseDateToIso(headers.Date, record.completedAt);

        return {
          jobId: record.jobId,
          myName: myColor === 'white' ? whiteName : blackName,
          myColor,
          myElo: myColor === 'white' ? whiteElo : blackElo,
          opponentName: myColor === 'white' ? blackName : whiteName,
          opponentColor: myColor === 'white' ? 'black' : 'white',
          opponentElo: myColor === 'white' ? blackElo : whiteElo,
          outcome: toOutcome(record.result.game.result ?? headers.Result, myColor),
          moves: Math.ceil(record.result.moves.length / 2),
          date: headers.Date ?? sortDate.slice(0, 10),
          sortDate,
        };
      });

      games.sort((left, right) => Date.parse(right.sortDate) - Date.parse(left.sortDate));
      response.status(200).json({ games });
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Failed to load stored games.', 'STORAGE_ERROR', error);
      response.status(500).json({
        error: {
          code: appError.code,
          message: appError.message,
        },
      });
    }
  };

  public deleteAdminGame = async (request: Request, response: Response): Promise<void> => {
    const jobId = Array.isArray(request.params.jobId) ? request.params.jobId[0] : request.params.jobId;

    if (!this.analysisResultStore?.deleteByJobId) {
      response.status(501).json({
        error: {
          code: 'DELETE_NOT_SUPPORTED',
          message: 'Deleting stored games is not supported by the configured storage.',
        },
      });
      return;
    }

    try {
      const deleted = await this.analysisResultStore.deleteByJobId(jobId);
      if (!deleted) {
        response.status(404).json({
          error: {
            code: 'JOB_NOT_FOUND',
            message: 'Stored game was not found.',
          },
        });
        return;
      }

      response.status(200).json({ ok: true, jobId });
    } catch (error) {
      const appError = error instanceof AppError ? error : new AppError('Failed to delete stored game.', 'STORAGE_DELETE_ERROR', error);
      response.status(500).json({
        error: {
          code: appError.code,
          message: appError.message,
        },
      });
    }
  };
}