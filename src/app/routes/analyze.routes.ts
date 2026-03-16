import { Router } from 'express';

import type { AnalyzeController } from '../controllers/analyze.controller';

export function createAnalyzeRoutes(controller: AnalyzeController): Router {
  const router = Router();

  router.post('/analyze', controller.createAnalysis);
  router.get('/analyze/:jobId/status', controller.getStatus);
  router.get('/analyze/:jobId/result', controller.getResult);

  return router;
}