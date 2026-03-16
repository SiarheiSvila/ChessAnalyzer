import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import request from 'supertest';

import { createApp } from '../../src/app/createApp';
import { AnalysisJobManager } from '../../src/jobs/AnalysisJobManager';

describe('Phase5 UI integration', () => {
  it('serves frontend page with required evaluation and navigation elements', async () => {
    const manager = new AnalysisJobManager(async () => {
      return {
        game: { headers: {} },
        settings: {
          depth: 10,
          deepDepth: 16,
          deepReanalyzedPlies: 0,
          cache: { hits: 0, misses: 0, size: 0 },
        },
        moves: [],
        summary: {
          accuracyWhite: 0,
          accuracyBlack: 0,
          counts: {
            white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
          },
          criticalMoments: 0,
        },
      };
    });

    const app = createApp(manager);
    const response = await request(app).get('/');

    assert.equal(response.status, 200);
    assert.ok(response.text.includes('id="pgnInput"'));
    assert.ok(response.text.includes('id="moveList"'));
    assert.ok(response.text.includes('id="evalChart"'));
    assert.ok(response.text.includes('id="evalDisplay"'));
    assert.ok(response.text.includes('id="prevBtn"'));
    assert.ok(response.text.includes('id="nextBtn"'));
  });
});