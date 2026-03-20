import { Chess } from 'chess.js';

import { PgnParser } from '../chess/PgnParser';
import { ReplayService } from '../chess/ReplayService';
import { CoachingClassifier } from './CoachingClassifier';
import { detectCriticalMoment } from './CriticalMoments';
import { PositionEvaluator } from './PositionEvaluator';
import {
  calculateCpl,
  classifyMove,
  moverPerspectiveAfterMove,
  summarizeBySide,
} from './Scoring';
import type { AnalyzedMove, RawAnalysisResult } from './dto/AnalysisResult';

export interface AnalyzeGameOptions {
  depth?: number;
  deepDepth?: number;
  enableDeepPass?: boolean;
  criticalCplThreshold?: number;
  enableCoaching?: boolean;
  coachingMultiPv?: number;
  onProgress?: (progress: { currentPly: number; totalPlies: number; percent: number }) => void;
}

export class GameAnalyzer {
  private static readonly COACHING_PLAYED_LINE_MAX_MOVES = 16;

  private readonly pgnParser: PgnParser;
  private readonly replayService: ReplayService;
  private readonly coachingClassifier: CoachingClassifier;

  public constructor(private readonly positionEvaluator: PositionEvaluator) {
    this.pgnParser = new PgnParser();
    this.replayService = new ReplayService();
    this.coachingClassifier = new CoachingClassifier();
  }

  public async analyzePgn(pgn: string, options: AnalyzeGameOptions = {}): Promise<RawAnalysisResult> {
    this.positionEvaluator.clearCache();

    const depth = options.depth ?? 12;
    const deepDepth = options.deepDepth ?? Math.min(depth + 6, 22);
    const enableDeepPass = options.enableDeepPass !== false;
    const criticalCplThreshold = options.criticalCplThreshold ?? 120;
    const enableCoaching = options.enableCoaching ?? false;
    const coachingMultiPv = options.coachingMultiPv ?? 3;
    const parsed = this.pgnParser.parse(pgn);
    const plies = this.replayService.buildPlies(parsed.pgn);

    const moves: AnalyzedMove[] = new Array(plies.length);

    for (let index = 0; index < plies.length; index += 1) {
      const ply = plies[index];
      moves[index] = await this.analyzePly(ply, depth, { enableCoaching, coachingMultiPv, plies });

      options.onProgress?.({
        currentPly: index + 1,
        totalPlies: plies.length,
        percent: Math.round(((index + 1) / plies.length) * 80),
      });
    }

    const deepReanalyzeIndexes = enableDeepPass
      ? moves
          .map((move, index) => ({ move, index }))
          .filter(({ move }) => move.isCritical || move.cpl >= criticalCplThreshold)
          .map(({ index }) => index)
      : [];

    for (let index = 0; index < deepReanalyzeIndexes.length; index += 1) {
      const moveIndex = deepReanalyzeIndexes[index];
      moves[moveIndex] = await this.analyzePly(plies[moveIndex], deepDepth, { enableCoaching, coachingMultiPv, plies });

      options.onProgress?.({
        currentPly: index + 1,
        totalPlies: deepReanalyzeIndexes.length,
        percent: 80 + Math.round(((index + 1) / Math.max(1, deepReanalyzeIndexes.length)) * 20),
      });
    }

    const summaryBySide = summarizeBySide(moves);
    const criticalMoments = moves.filter((move) => move.isCritical).length;
    const cache = this.positionEvaluator.getCacheStats();

    return {
      game: {
        event: parsed.headers.Event,
        white: parsed.headers.White,
        black: parsed.headers.Black,
        result: parsed.headers.Result,
        headers: parsed.headers,
      },
      settings: {
        depth,
        deepDepth,
        deepReanalyzedPlies: deepReanalyzeIndexes.length,
        cache,
      },
      moves,
      summary: {
        accuracyWhite: summaryBySide.white.accuracy,
        accuracyBlack: summaryBySide.black.accuracy,
        counts: {
          white: summaryBySide.white.counts,
          black: summaryBySide.black.counts,
        },
        criticalMoments,
      },
    };
  }

  private async analyzePly(
    ply: {
      ply: number;
      san: string;
      uciMove: string;
      color: 'w' | 'b';
      fenBefore: string;
      fenAfter: string;
    },
    depth: number,
    coachingOptions?: {
      enableCoaching: boolean;
      coachingMultiPv: number;
      plies: Array<{ ply: number; san: string; uciMove: string; color: 'w' | 'b'; fenBefore: string; fenAfter: string }>;
    },
  ): Promise<AnalyzedMove> {
    const multiPv = coachingOptions?.enableCoaching ? coachingOptions.coachingMultiPv : undefined;
    const evalBefore = await this.positionEvaluator.evaluateFen(ply.fenBefore, { depth, multiPv });
    const evalAfter = await this.positionEvaluator.evaluateFen(ply.fenAfter, { depth });
    const bestAfterFen = this.applyUciMove(ply.fenBefore, evalBefore.bestMove);
    const evalBestAfter = await this.positionEvaluator.evaluateFen(bestAfterFen, { depth });

    const evalBeforeForMover = evalBefore.info.score ?? { kind: 'cp' as const, value: 0 };
    const evalAfterForMover = {
      kind: 'cp' as const,
      value: moverPerspectiveAfterMove(evalAfter.info.score ?? { kind: 'cp', value: 0 }),
    };
    const bestAfterForMoverCp = moverPerspectiveAfterMove(evalBestAfter.info.score ?? { kind: 'cp', value: 0 });

    const cpl = calculateCpl(bestAfterForMoverCp, evalAfterForMover.value);
    const label = classifyMove(cpl);
    const critical = detectCriticalMoment({
      evalBeforeForMover,
      evalAfterForMover,
      cpl,
    });

    const analyzedMove: AnalyzedMove = {
      ply: ply.ply,
      san: ply.san,
      uciMove: ply.uciMove,
      color: ply.color,
      fenBefore: ply.fenBefore,
      fenAfter: ply.fenAfter,
      bestMove: evalBefore.bestMove,
      evalBefore: evalBeforeForMover,
      evalAfter: evalAfterForMover,
      evalBestAfter: {
        kind: 'cp',
        value: bestAfterForMoverCp,
      },
      cpl,
      label,
      isCritical: critical.isCritical,
      criticalReasons: critical.reasons,
      evalSwingCp: critical.evalSwingCp,
      pv: evalBefore.info.pv ?? [],
    };

    // Add coaching explanation if enabled
    if (coachingOptions?.enableCoaching) {
      const bestLine = evalBefore.info.pv ?? [];
      const playedLine = this.buildPlayedLineFromIndex(coachingOptions.plies, ply.ply);
      const coaching = this.coachingClassifier.classifyMove(analyzedMove, bestLine, playedLine);
      if (coaching) {
        analyzedMove.coaching = coaching;
      }
    }

    return analyzedMove;
  }

  /**
   * Build played continuation from the game after the given ply.
   */
  private buildPlayedLineFromIndex(plies: Array<{ ply: number; uciMove: string }>, startPly: number): string[] {
    const result: string[] = [];
    const startIndex = plies.findIndex((p) => p.ply === startPly);
    if (startIndex === -1) {
      return result;
    }

    // Extract up to 16 continuation moves after the selected move.
    for (
      let i = startIndex + 1;
      i < Math.min(startIndex + 1 + GameAnalyzer.COACHING_PLAYED_LINE_MAX_MOVES, plies.length);
      i++
    ) {
      result.push(plies[i].uciMove);
    }
    return result;
  }

  private applyUciMove(fen: string, uciMove: string): string {
    const board = new Chess(fen);
    const from = uciMove.slice(0, 2);
    const to = uciMove.slice(2, 4);
    const promotion = uciMove.length > 4 ? (uciMove[4] as 'q' | 'r' | 'b' | 'n') : undefined;
    const result = board.move({ from, to, promotion });

    if (!result) {
      return fen;
    }

    return board.fen();
  }
}