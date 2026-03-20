import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import request from 'supertest';

import { createApp } from '../../src/app/createApp';
import { AnalysisJobManager } from '../../src/jobs/AnalysisJobManager';
import { LocalAnalysisResultStore } from '../../src/storage/LocalAnalysisResultStore';

async function waitForCompletion(app: ReturnType<typeof createApp>, jobId: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 3000) {
    const statusResponse = await request(app).get(`/api/analyze/${jobId}/status`);
    if (statusResponse.body.state === 'completed') {
      return;
    }

    if (statusResponse.body.state === 'failed') {
      throw new Error(`Job ${jobId} failed unexpectedly`);
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for job completion');
}

describe('Phase7 persistent storage integration', () => {
  it('stores completed analysis and serves it via GET /api/analysis/:jobId multiple times', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-integration-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      const manager = new AnalysisJobManager(
        async (_request, _onProgress) => ({
          game: { headers: { Event: 'Phase7 test' } },
          settings: {
            depth: 8,
            deepDepth: 14,
            deepReanalyzedPlies: 0,
            cache: { hits: 0, misses: 0, size: 0 },
          },
          moves: [],
          summary: {
            accuracyWhite: 100,
            accuracyBlack: 100,
            counts: {
              white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
              black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            },
            criticalMoments: 0,
          },
        }),
        undefined,
        { analysisResultStore: store },
      );

      const app = createApp(manager, store);

      const createResponse = await request(app).post('/api/analyze').send({ pgn: '1. e4 e5' });
      assert.equal(createResponse.status, 202);
      const jobId = createResponse.body.jobId as string;

      await waitForCompletion(app, jobId);

      const firstLoad = await request(app).get(`/api/analysis/${jobId}`);
      assert.equal(firstLoad.status, 200);
      assert.equal(firstLoad.body.jobId, jobId);
      assert.equal(firstLoad.body.state, 'completed');

      const secondLoad = await request(app).get(`/api/analysis/${jobId}`);
      assert.equal(secondLoad.status, 200);
      assert.equal(secondLoad.body.jobId, jobId);

      const analysisPage = await request(app).get(`/analysis/${jobId}`);
      assert.equal(analysisPage.status, 200);
      assert.match(analysisPage.text, /id="pgnInput"/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('loads persisted analysis after app restart with empty in-memory jobs', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-restart-'));

    try {
      const firstStore = new LocalAnalysisResultStore(tempDir);
      const firstManager = new AnalysisJobManager(
        async (_request, _onProgress) => ({
          game: { headers: { Event: 'Phase7 restart test' } },
          settings: {
            depth: 8,
            deepDepth: 14,
            deepReanalyzedPlies: 0,
            cache: { hits: 0, misses: 0, size: 0 },
          },
          moves: [],
          summary: {
            accuracyWhite: 99,
            accuracyBlack: 99,
            counts: {
              white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
              black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            },
            criticalMoments: 0,
          },
        }),
        undefined,
        { analysisResultStore: firstStore },
      );

      const firstApp = createApp(firstManager, firstStore);
      const createResponse = await request(firstApp).post('/api/analyze').send({ pgn: '1. d4 d5' });
      assert.equal(createResponse.status, 202);
      const jobId = createResponse.body.jobId as string;
      await waitForCompletion(firstApp, jobId);

      const secondStore = new LocalAnalysisResultStore(tempDir);
      const secondManager = new AnalysisJobManager(async () => {
        throw new Error('runner should not be used when loading persisted analysis');
      });
      const secondApp = createApp(secondManager, secondStore);

      const response = await request(secondApp).get(`/api/analysis/${jobId}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.jobId, jobId);
      assert.equal(response.body.state, 'completed');
      assert.equal(response.body.result.game.headers.Event, 'Phase7 restart test');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns black viewer preference when configured player matches black side', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-viewer-'));
    const previousAdminPlayer = process.env.ADMIN_PLAYER_NAME;

    try {
      process.env.ADMIN_PLAYER_NAME = 'BlackHero';

      const store = new LocalAnalysisResultStore(tempDir);
      const manager = new AnalysisJobManager(
        async () => ({
          game: {
            headers: {
              Event: 'Phase7 viewer test',
              White: 'WhiteHero',
              Black: 'BlackHero',
              Result: '0-1',
            },
          },
          settings: {
            depth: 8,
            deepDepth: 14,
            deepReanalyzedPlies: 0,
            cache: { hits: 0, misses: 0, size: 0 },
          },
          moves: [],
          summary: {
            accuracyWhite: 99,
            accuracyBlack: 99,
            counts: {
              white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
              black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            },
            criticalMoments: 0,
          },
        }),
        undefined,
        { analysisResultStore: store },
      );

      const app = createApp(manager, store);
      const createResponse = await request(app).post('/api/analyze').send({ pgn: '1. e4 e5' });
      assert.equal(createResponse.status, 202);

      const jobId = createResponse.body.jobId as string;
      await waitForCompletion(app, jobId);

      const response = await request(app).get(`/api/analysis/${jobId}`);
      assert.equal(response.status, 200);
      assert.equal(response.body.viewer.playerColor, 'black');
      assert.equal(response.body.viewer.boardFlipped, true);
    } finally {
      if (previousAdminPlayer === undefined) {
        delete process.env.ADMIN_PLAYER_NAME;
      } else {
        process.env.ADMIN_PLAYER_NAME = previousAdminPlayer;
      }
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns 404 for unknown persisted analysis', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-missing-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      const manager = new AnalysisJobManager(async () => {
        throw new Error('should not run');
      });
      const app = createApp(manager, store);

      const response = await request(app).get('/api/analysis/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
      assert.equal(response.status, 404);
      assert.equal(response.body.error.code, 'JOB_NOT_FOUND');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
