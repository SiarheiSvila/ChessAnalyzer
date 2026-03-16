import { Router } from 'express';

import type { AnalyzeController } from '../controllers/analyze.controller';

export function createAnalyzeRoutes(controller: AnalyzeController): Router {
  const router = Router();

  router.post('/analyze', controller.createAnalysis);
  router.get('/analysis/:jobId', controller.getStoredAnalysis);
  router.get('/admin/games', controller.getAdminGames);
  router.delete('/admin/games/:jobId', controller.deleteAdminGame);
  router.get('/analyze/:jobId/status', controller.getStatus);
  router.get('/analyze/:jobId/result', controller.getResult);

  return router;
}