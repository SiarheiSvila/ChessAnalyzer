import express, { type Express } from 'express';
import path from 'node:path';

import { AnalyzeController } from './controllers/analyze.controller';
import { createAnalyzeRoutes } from './routes/analyze.routes';
import type { AnalysisJobManager } from '../jobs/AnalysisJobManager';

export function createApp(jobManager: AnalysisJobManager): Express {
  const app = express();
  const controller = new AnalyzeController(jobManager);

  app.use(express.json({ limit: '1mb' }));

  app.use(express.static(path.join(process.cwd(), 'public')));

  app.get('/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.use('/api', createAnalyzeRoutes(controller));

  return app;
}