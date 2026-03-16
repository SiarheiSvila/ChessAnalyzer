import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';

import { createApp } from '../../src/app/createApp';
import { AnalysisJobManager } from '../../src/jobs/AnalysisJobManager';

async function waitForTerminalState(
  app: ReturnType<typeof createApp>,
  jobId: string,
): Promise<'completed' | 'failed'> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < 3000) {
    const statusResponse = await request(app).get(`/api/analyze/${jobId}/status`);
    if (statusResponse.body.state === 'completed' || statusResponse.body.state === 'failed') {
      return statusResponse.body.state;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error('Timed out waiting for job terminal state');
}

describe('Phase4 API integration', () => {
  it('returns jobId and exposes valid status lifecycle', async () => {
    const manager = new AnalysisJobManager(async (_request, onProgress) => {
      onProgress({ currentPly: 1, totalPlies: 2, percent: 50 });
      await new Promise((resolve) => setTimeout(resolve, 30));
      onProgress({ currentPly: 2, totalPlies: 2, percent: 100 });
      return {
        game: { headers: {} },
        settings: {
          depth: 8,
          deepDepth: 14,
          deepReanalyzedPlies: 0,
          cache: { hits: 0, misses: 0, size: 0 },
        },
        moves: [],
        summary: {
          accuracyWhite: 99,
          accuracyBlack: 98,
          counts: {
            white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
          },
          criticalMoments: 0,
        },
      };
    });

    const app = createApp(manager);

    const createResponse = await request(app).post('/api/analyze').send({ pgn: '1. e4 e5' });
    assert.equal(createResponse.status, 202);
    assert.ok(createResponse.body.jobId);

    const terminalState = await waitForTerminalState(app, createResponse.body.jobId);
    assert.equal(terminalState, 'completed');

    const resultResponse = await request(app).get(`/api/analyze/${createResponse.body.jobId}/result`);
    assert.equal(resultResponse.status, 200);
    assert.equal(resultResponse.body.state, 'completed');
    assert.ok(resultResponse.body.result);
  });

  it('returns structured validation errors for invalid payload', async () => {
    const manager = new AnalysisJobManager(async () => {
      throw new Error('should not run');
    });

    const app = createApp(manager);

    const response = await request(app).post('/api/analyze').send({ pgn: '', settings: { depth: 99 } });
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  it('returns stable failed-job schema from result endpoint', async () => {
    const manager = new AnalysisJobManager(async () => {
      throw new Error('Engine crashed');
    });

    const app = createApp(manager);

    const createResponse = await request(app).post('/api/analyze').send({ pgn: '1. d4 d5' });
    assert.equal(createResponse.status, 202);
    const jobId = createResponse.body.jobId as string;

    const terminalState = await waitForTerminalState(app, jobId);
    assert.equal(terminalState, 'failed');

    const resultResponse = await request(app).get(`/api/analyze/${jobId}/result`);
    assert.equal(resultResponse.status, 500);
    assert.equal(resultResponse.body.state, 'failed');
    assert.equal(resultResponse.body.error.code, 'ANALYSIS_FAILED');
    assert.equal(resultResponse.body.error.message, 'Engine crashed');
  });
});