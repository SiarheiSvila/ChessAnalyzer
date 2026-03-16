import { EngineError } from '../shared/errors/EngineError';
import { UciClient } from './uci/UciClient';
import type { UciAnalyzeOptions, UciClientOptions, UciEvaluation } from './uci/UciTypes';

export class StockfishService {
  private readonly client: UciClient;

  public constructor(options: UciClientOptions) {
    this.client = new UciClient(options);
  }

  public async initialize(): Promise<void> {
    console.info('[StockfishService] Initializing engine');
    try {
      await this.client.start();
    } catch (error) {
      console.error('[StockfishService] Engine initialization failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
      });

      if (!this.isRetryable(error)) {
        throw error;
      }

      console.warn('[StockfishService] Retryable init error, restarting engine');
      await this.client.restart();
    }

    console.info('[StockfishService] Engine initialized');
  }

  public async shutdown(): Promise<void> {
    console.info('[StockfishService] Shutting down engine');
    await this.client.stop();
    console.info('[StockfishService] Engine shutdown complete');
  }

  public async evaluateFen(fen: string, options?: UciAnalyzeOptions): Promise<UciEvaluation> {
    try {
      console.debug('[StockfishService] Evaluating FEN', {
        depth: options?.depth,
        moveTimeMs: options?.moveTimeMs,
        fen,
      });
      return await this.client.analyzePosition(fen, options);
    } catch (error) {
      console.error('[StockfishService] Evaluation failed', {
        message: error instanceof Error ? error.message : 'Unknown error',
        error,
      });

      if (!this.isRetryable(error)) {
        throw error;
      }

      console.warn('[StockfishService] Retryable engine error, restarting engine', {
        code: error instanceof EngineError ? error.code : undefined,
      });
      await this.client.restart();
      console.info('[StockfishService] Engine restarted, retrying evaluation');
      return this.client.analyzePosition(fen, options);
    }
  }

  private isRetryable(error: unknown): boolean {
    if (!(error instanceof EngineError)) {
      return false;
    }

    return (
      error.code === 'UCI_TIMEOUT'
      || error.code === 'UCI_PROCESS_EXIT'
      || error.code === 'UCI_PROCESS_ERROR'
      || error.code === 'UCI_PROCESS_NOT_WRITABLE'
    );
  }
}