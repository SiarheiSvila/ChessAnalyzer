import 'dotenv/config';
import path from 'node:path';

import { GameAnalyzer } from '../analysis/GameAnalyzer';
import { PositionEvaluator } from '../analysis/PositionEvaluator';
import { StockfishService } from '../engine/StockfishService';
import { AnalysisJobManager } from '../jobs/AnalysisJobManager';
import { LocalAnalysisResultStore } from '../storage/LocalAnalysisResultStore';
import { createApp } from './createApp';

const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const enginePath = process.env.STOCKFISH_PATH;
const analysisStorageDir = (process.env.ANALYSIS_STORAGE_DIR ?? '').trim() || path.join(process.cwd(), 'storage', 'local', 'analyses');

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
const analysisStore = new LocalAnalysisResultStore(analysisStorageDir);

const jobManager = new AnalysisJobManager(async (request, onProgress) => {
  await stockfishService.initialize();
  return analyzer.analyzePgn(request.pgn, {
    depth: request.depth,
    onProgress,
  });
}, undefined, { analysisResultStore: analysisStore });

const app = createApp(jobManager, analysisStore);

const server = app.listen(port, () => {
  console.log(`Chess analyzer API running on port ${port}`);
  console.log(`Analysis storage directory: ${analysisStorageDir}`);
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