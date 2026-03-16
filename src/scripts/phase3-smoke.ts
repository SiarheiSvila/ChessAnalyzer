import 'dotenv/config';

import { GameAnalyzer } from '../analysis/GameAnalyzer';
import { PositionEvaluator } from '../analysis/PositionEvaluator';
import { StockfishService } from '../engine/StockfishService';

const samplePgn = `
[Event "Phase3 Smoke"]
[Site "Local"]
[Date "2026.03.15"]
[Round "1"]
[White "WhitePlayer"]
[Black "BlackPlayer"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. Ba4 Nf6 5. O-O Be7 6. Re1 b5 7. Bb3 d6 8. c3 O-O 9. h3 Nb8 10. d4 Nbd7 11. c4 c6 12. Nc3 Qc7 13. Be3 Bb7 14. Rc1 Rfe8 15. cxb5 axb5 16. Nxb5 Qb8 17. Nc3 Bf8 18. Ng5 Re7 19. f4 h6 20. Nf3 exf4 1-0
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
        if (currentPly === totalPlies || currentPly % 8 === 0) {
          console.log(`Progress: ${currentPly}/${totalPlies} (${percent}%)`);
        }
      },
    });

    console.log(
      JSON.stringify(
        {
          movesAnalyzed: analysis.moves.length,
          criticalMoments: analysis.summary.criticalMoments,
          accuracyWhite: analysis.summary.accuracyWhite,
          accuracyBlack: analysis.summary.accuracyBlack,
          firstMove: {
            ply: analysis.moves[0].ply,
            san: analysis.moves[0].san,
            cpl: analysis.moves[0].cpl,
            label: analysis.moves[0].label,
            isCritical: analysis.moves[0].isCritical,
          },
          lastMove: {
            ply: analysis.moves[analysis.moves.length - 1].ply,
            san: analysis.moves[analysis.moves.length - 1].san,
            cpl: analysis.moves[analysis.moves.length - 1].cpl,
            label: analysis.moves[analysis.moves.length - 1].label,
            isCritical: analysis.moves[analysis.moves.length - 1].isCritical,
          },
          counts: analysis.summary.counts,
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
  console.error(error);
  process.exitCode = 1;
});