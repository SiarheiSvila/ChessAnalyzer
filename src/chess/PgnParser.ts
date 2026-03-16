import { Chess } from 'chess.js';

import { AppError } from '../shared/errors/AppError';

export interface ParsedGame {
  headers: Record<string, string>;
  sanMoves: string[];
  pgn: string;
}

export class PgnParser {
  public parse(pgn: string): ParsedGame {
    const trimmed = pgn.trim();
    if (!trimmed) {
      throw new AppError('PGN input is empty', 'PGN_EMPTY');
    }

    const chess = new Chess();
    try {
      chess.loadPgn(trimmed, { strict: false });
    } catch (error) {
      throw new AppError('Invalid PGN. Could not parse game.', 'PGN_INVALID', { error });
    }

    return {
      headers: chess.getHeaders(),
      sanMoves: chess.history(),
      pgn: trimmed,
    };
  }
}