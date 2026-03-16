import { Chess, Move } from 'chess.js';

import { AppError } from '../shared/errors/AppError';

export interface ReplayPly {
  ply: number;
  san: string;
  uciMove: string;
  fenBefore: string;
  fenAfter: string;
  color: 'w' | 'b';
}

function toUciMove(move: Move): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

export class ReplayService {
  public buildPlies(pgn: string): ReplayPly[] {
    const parsedBoard = new Chess();
    try {
      parsedBoard.loadPgn(pgn, { strict: false });
    } catch (error) {
      throw new AppError('Invalid PGN. Replay could not load game.', 'PGN_INVALID_REPLAY', { error });
    }

    const verboseMoves = parsedBoard.history({ verbose: true });
    const replayBoard = new Chess();
    const plies: ReplayPly[] = [];

    for (let index = 0; index < verboseMoves.length; index += 1) {
      const move = verboseMoves[index];
      const fenBefore = replayBoard.fen();
      const applied = replayBoard.move({
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });

      if (!applied) {
        throw new AppError('Replay failed to apply legal PGN move', 'PGN_REPLAY_APPLY_FAILED', {
          index,
          san: move.san,
          from: move.from,
          to: move.to,
        });
      }

      plies.push({
        ply: index + 1,
        san: move.san,
        uciMove: toUciMove(move),
        fenBefore,
        fenAfter: replayBoard.fen(),
        color: move.color,
      });
    }

    return plies;
  }
}