import 'dotenv/config';

import { GameAnalyzer } from '../analysis/GameAnalyzer';
import { PositionEvaluator } from '../analysis/PositionEvaluator';
import { StockfishService } from '../engine/StockfishService';
import { AnalysisJobManager } from '../jobs/AnalysisJobManager';
import { createApp } from './createApp';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const enginePath = process.env.STOCKFISH_PATH;

if (!enginePath) {
  throw new Error('Missing required env variable STOCKFISH_PATH');
}

const stockfishService = new StockfishService({
  enginePath,
  startupTimeoutMs: 10_000,
  commandTimeoutMs: 20_000,
  threads: 1,
  hashMb: 128,
});

const analyzer = new GameAnalyzer(new PositionEvaluator(stockfishService));

const jobManager = new AnalysisJobManager(async (request, onProgress) => {
  await stockfishService.initialize();
  return analyzer.analyzePgn(request.pgn, {
    depth: request.depth,
    onProgress,
  });
});

const app = createApp(jobManager);

const server = app.listen(port, () => {
  console.log(`Chess analyzer API running on port ${port}`);
});

async function shutdown(): Promise<void> {
  server.close(async () => {
    await stockfishService.shutdown();
    process.exit(0);
  });
}

process.on('SIGINT', () => {
  void shutdown();
});

process.on('SIGTERM', () => {
  void shutdown();
});