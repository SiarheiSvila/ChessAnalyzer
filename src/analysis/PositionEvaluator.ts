import type { UciAnalyzeOptions, UciEvaluation } from '../engine/uci/UciTypes';

export interface FenEvaluationService {
  evaluateFen(fen: string, options?: UciAnalyzeOptions): Promise<UciEvaluation>;
}

export interface PositionEvaluateOptions extends UciAnalyzeOptions {
  useCache?: boolean;
}

export interface PositionEvaluatorCacheStats {
  hits: number;
  misses: number;
  size: number;
}

export class PositionEvaluator {
  private readonly cache = new Map<string, UciEvaluation>();
  private cacheHits = 0;
  private cacheMisses = 0;

  public constructor(private readonly stockfishService: FenEvaluationService) {}

  public async evaluateFen(fen: string, options: PositionEvaluateOptions = {}): Promise<UciEvaluation> {
    const useCache = options.useCache !== false;
    const key = this.cacheKey(fen, options);

    if (useCache) {
      const cached = this.cache.get(key);
      if (cached) {
        this.cacheHits += 1;
        return cached;
      }
    }

    const result = await this.stockfishService.evaluateFen(fen, options);
    this.cacheMisses += 1;

    if (useCache) {
      this.cache.set(key, result);
    }

    return result;
  }

  public clearCache(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  public getCacheStats(): PositionEvaluatorCacheStats {
    return {
      hits: this.cacheHits,
      misses: this.cacheMisses,
      size: this.cache.size,
    };
  }

  private cacheKey(fen: string, options: PositionEvaluateOptions): string {
    const depthPart = options.depth ?? 'd?';
    const moveTimePart = options.moveTimeMs ?? 't?';
    const multiPvPart = options.multiPv ?? 'm1';
    return `${fen}|depth:${depthPart}|movetime:${moveTimePart}|multipv:${multiPvPart}`;
  }
}