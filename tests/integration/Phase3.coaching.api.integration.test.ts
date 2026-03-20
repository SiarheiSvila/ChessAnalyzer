import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import request from 'supertest';

import type { RawAnalysisResult } from '../../src/analysis/dto/AnalysisResult';
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

function createResultWithCoaching(): RawAnalysisResult {
  return {
    game: { headers: { Event: 'Phase3 Coaching API test' } },
    settings: {
      depth: 8,
      deepDepth: 14,
      deepReanalyzedPlies: 0,
      cache: { hits: 0, misses: 0, size: 0 },
    },
    moves: [
      {
        ply: 1,
        san: 'e4',
        uciMove: 'e2e4',
        color: 'w',
        fenBefore: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        fenAfter: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
        bestMove: 'e2e4',
        evalBefore: { kind: 'cp', value: 20 },
        evalAfter: { kind: 'cp', value: 15 },
        evalBestAfter: { kind: 'cp', value: 30 },
        cpl: 15,
        label: 'Excellent',
        isCritical: true,
        criticalReasons: ['swing'],
        evalSwingCp: 15,
        pv: ['e2e4', 'e7e5'],
        coaching: {
          type: 'neutral_move',
          primaryReason: 'Solid move',
          reasonCodes: ['solid_move'],
          scoreGapCp: 15,
          bestLine: ['e2e4', 'e7e5'],
          playedLine: ['e2e4', 'e7e5'],
          sequenceLength: 2,
        },
      },
    ],
    summary: {
      accuracyWhite: 99,
      accuracyBlack: 99,
      counts: {
        white: { best: 0, excellent: 1, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { best: 0, excellent: 0, good: 1, inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      criticalMoments: 1,
    },
  };
}

describe('Phase3 coaching API and persistence integration', () => {
  it('forwards coaching options from API request into analysis runner', async () => {
    let capturedRequest: { depth?: number; enableCoaching?: boolean; coachingMultiPv?: number } | undefined;

    const manager = new AnalysisJobManager(async (analysisRequest) => {
      capturedRequest = {
        depth: analysisRequest.depth,
        enableCoaching: analysisRequest.enableCoaching,
        coachingMultiPv: analysisRequest.coachingMultiPv,
      };

      return createResultWithCoaching();
    });

    const app = createApp(manager);

    const response = await request(app)
      .post('/api/analyze')
      .send({
        pgn: '1. e4 e5',
        settings: {
          depth: 10,
          coaching: {
            enabled: true,
            multiPv: 4,
          },
        },
      });

    assert.equal(response.status, 202);
    assert.ok(response.body.jobId);

    await waitForCompletion(app, response.body.jobId as string);

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.depth, 10);
    assert.equal(capturedRequest.enableCoaching, true);
    assert.equal(capturedRequest.coachingMultiPv, 4);
  });

  it('persists and reloads coaching payload through /api/analysis/:jobId', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase3-coaching-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      const firstManager = new AnalysisJobManager(
        async () => createResultWithCoaching(),
        undefined,
        { analysisResultStore: store },
      );

      const firstApp = createApp(firstManager, store);
      const createResponse = await request(firstApp)
        .post('/api/analyze')
        .send({ pgn: '1. e4 e5', settings: { enableCoaching: true, coachingMultiPv: 3 } });

      assert.equal(createResponse.status, 202);
      const jobId = createResponse.body.jobId as string;

      await waitForCompletion(firstApp, jobId);

      const secondStore = new LocalAnalysisResultStore(tempDir);
      const secondManager = new AnalysisJobManager(async () => {
        throw new Error('runner should not be called for persisted result read');
      });
      const secondApp = createApp(secondManager, secondStore);

      const persistedResponse = await request(secondApp).get(`/api/analysis/${jobId}`);
      assert.equal(persistedResponse.status, 200);
      assert.equal(persistedResponse.body.jobId, jobId);
      assert.equal(persistedResponse.body.result.moves[0].coaching.primaryReason, 'Solid move');
      assert.equal(persistedResponse.body.result.moves[0].coaching.reasonCodes[0], 'solid_move');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('keeps backward compatibility for legacy requests without coaching fields', async () => {
    let capturedRequest: { depth?: number; enableCoaching?: boolean; coachingMultiPv?: number } | undefined;

    const manager = new AnalysisJobManager(async (analysisRequest) => {
      capturedRequest = {
        depth: analysisRequest.depth,
        enableCoaching: analysisRequest.enableCoaching,
        coachingMultiPv: analysisRequest.coachingMultiPv,
      };
      return createResultWithCoaching();
    });

    const app = createApp(manager);

    const response = await request(app).post('/api/analyze').send({ pgn: '1. d4 d5', settings: { depth: 8 } });
    assert.equal(response.status, 202);

    await waitForCompletion(app, response.body.jobId as string);

    assert.ok(capturedRequest);
    assert.equal(capturedRequest.depth, 8);
    assert.equal(capturedRequest.enableCoaching, undefined);
    assert.equal(capturedRequest.coachingMultiPv, undefined);
  });
});
