import 'dotenv/config';

import { StockfishService } from '../engine/StockfishService';

async function run(): Promise<void> {
  const enginePath = process.env.STOCKFISH_PATH ?? 'stockfish';
  const fen = process.env.TEST_FEN ?? 'r1bqkbnr/pppp1ppp/2n5/4p3/3PP3/5N2/PPP2PPP/RNBQKB1R b KQkq - 2 3';

  const service = new StockfishService({
    enginePath,
    startupTimeoutMs: 10_000,
    commandTimeoutMs: 20_000,
    threads: 1,
    hashMb: 128,
  });

  try {
    await service.initialize();
    const evaluation = await service.evaluateFen(fen, { depth: 12, timeoutMs: 20_000 });

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          bestMove: evaluation.bestMove,
          score: evaluation.info.score,
          depth: evaluation.info.depth,
          pv: evaluation.info.pv,
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