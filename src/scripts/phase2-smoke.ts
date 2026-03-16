import 'dotenv/config';

import { GameAnalyzer } from '../analysis/GameAnalyzer';
import { PositionEvaluator } from '../analysis/PositionEvaluator';
import { StockfishService } from '../engine/StockfishService';

const samplePgn = `
[Event "Phase2 Smoke"]
[Site "Local"]
[Date "2026.03.15"]
[Round "1"]
[White "WhitePlayer"]
[Black "BlackPlayer"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 1-0
`;

async function run(): Promise<void> {
  const enginePath = process.env.STOCKFISH_PATH ?? 'stockfish';
  const service = new StockfishService({
    enginePath,
    startupTimeoutMs: 10_000,
    commandTimeoutMs: 20_000,
    threads: 1,
    hashMb: 128,
  });

  try {
    await service.initialize();

    const analyzer = new GameAnalyzer(new PositionEvaluator(service));
    const analysis = await analyzer.analyzePgn(samplePgn, {
      depth: 10,
      onProgress: ({ currentPly, totalPlies, percent }) => {
        if (currentPly === totalPlies || currentPly % 4 === 0) {
          // eslint-disable-next-line no-console
          console.log(`Progress: ${currentPly}/${totalPlies} (${percent}%)`);
        }
      },
    });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          game: analysis.game,
          movesAnalyzed: analysis.moves.length,
          firstMove: analysis.moves[0],
          lastMove: analysis.moves[analysis.moves.length - 1],
        },
        null,
        2,
      ),
    );
  } finally {
    await service.shutdown();
  }
}

run().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
});