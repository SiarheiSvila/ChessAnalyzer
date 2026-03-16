import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';

import request from 'supertest';

import { createApp } from '../../src/app/createApp';
import { AnalysisJobManager } from '../../src/jobs/AnalysisJobManager';
import { LocalAnalysisResultStore } from '../../src/storage/LocalAnalysisResultStore';

function createResult(eventDate: string) {
  return {
    pgn: '1. e4 e5',
    game: {
      headers: {
        White: 'sergei1506',
        Black: 'Zuvarna',
        Result: '1-0',
        Date: eventDate,
      },
      white: 'sergei1506',
      black: 'Zuvarna',
      result: '1-0',
    },
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
        color: 'w' as const,
        fenBefore: 'x',
        fenAfter: 'y',
        bestMove: 'e2e4',
        evalBefore: { kind: 'cp' as const, value: 10 },
        evalAfter: { kind: 'cp' as const, value: 20 },
        evalBestAfter: { kind: 'cp' as const, value: 20 },
        cpl: 0,
        label: 'Best' as const,
        isCritical: false,
        criticalReasons: [],
        evalSwingCp: 10,
        pv: ['e2e4'],
      },
    ],
    summary: {
      accuracyWhite: 90,
      accuracyBlack: 80,
      counts: {
        white: { best: 1, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
        black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
      },
      criticalMoments: 0,
    },
  };
}

describe('Admin games integration', () => {
  it('lists stored games sorted by date descending and serves admin page', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-admin-games-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      await store.save({
        jobId: '11111111-1111-1111-1111-111111111111',
        createdAt: '2026-03-16T00:00:00.000Z',
        completedAt: '2026-03-16T00:00:01.000Z',
        analysisVersion: 1,
        result: createResult('2025.12.01'),
      });

      await store.save({
        jobId: '22222222-2222-2222-2222-222222222222',
        createdAt: '2026-03-16T00:00:02.000Z',
        completedAt: '2026-03-16T00:00:03.000Z',
        analysisVersion: 1,
        result: createResult('2026.03.12'),
      });

      const manager = new AnalysisJobManager(async () => {
        throw new Error('runner is not used in this test');
      });

      const app = createApp(manager, store);

      const pageResponse = await request(app).get('/admin');
      assert.equal(pageResponse.status, 200);
      assert.match(pageResponse.text, /Game Admin/);

      const gamesResponse = await request(app).get('/api/admin/games');
      assert.equal(gamesResponse.status, 200);
      assert.equal(gamesResponse.body.games.length, 2);
      assert.equal(gamesResponse.body.games[0].jobId, '22222222-2222-2222-2222-222222222222');
      assert.equal(gamesResponse.body.games[1].jobId, '11111111-1111-1111-1111-111111111111');
      assert.equal(gamesResponse.body.games[0].outcome, 'Win');
      assert.equal(gamesResponse.body.games[0].myColor, 'white');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
