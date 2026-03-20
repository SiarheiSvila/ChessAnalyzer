import express, { type Express } from 'express';
import path from 'node:path';

import { AnalyzeController } from './controllers/analyze.controller';
import { createAnalyzeRoutes } from './routes/analyze.routes';
import type { AnalysisJobManager } from '../jobs/AnalysisJobManager';
import type { AnalysisResultStore } from '../storage/AnalysisResultStore';

export function createApp(jobManager: AnalysisJobManager, analysisResultStore?: AnalysisResultStore): Express {
  const app = express();
  const controller = new AnalyzeController(jobManager, analysisResultStore);
  const publicDir = path.join(process.cwd(), 'public');

  app.use(express.json({ limit: '1mb' }));

  app.use(express.static(publicDir, {
    etag: false,
    lastModified: false,
    maxAge: 0,
    setHeaders: (response) => {
      response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      response.setHeader('Pragma', 'no-cache');
      response.setHeader('Expires', '0');
    },
  }));

  app.get('/health', (_request, response) => {
    response.status(200).json({ ok: true });
  });

  app.get('/analysis/:jobId', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.sendFile(path.join(publicDir, 'index.html'));
  });

  app.get('/admin', (_request, response) => {
    response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    response.setHeader('Pragma', 'no-cache');
    response.setHeader('Expires', '0');
    response.sendFile(path.join(publicDir, 'admin.html'));
  });

  app.use('/api', createAnalyzeRoutes(controller));

  return app;
}