import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';

import { LocalAnalysisResultStore } from '../../src/storage/LocalAnalysisResultStore';

describe('LocalAnalysisResultStore', () => {
  it('saves and reads persisted analysis by jobId', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-store-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      const record = {
        jobId: '11111111-1111-1111-1111-111111111111',
        createdAt: '2026-03-16T10:00:00.000Z',
        completedAt: '2026-03-16T10:00:01.000Z',
        analysisVersion: 1,
        result: {
          game: { headers: {} },
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
        },
      };

      await store.save(record);
      const loaded = await store.getByJobId(record.jobId);

      assert.deepEqual(loaded, record);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns undefined for missing analysis', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-store-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      const loaded = await store.getByJobId('22222222-2222-2222-2222-222222222222');
      assert.equal(loaded, undefined);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('throws for invalid jobId format', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-store-'));

    try {
      const store = new LocalAnalysisResultStore(tempDir);
      await assert.rejects(() => store.getByJobId('../escape'), /Invalid job id format/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('throws parse error for corrupted persisted json', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'chessnpm-phase7-store-'));
    const jobId = '33333333-3333-3333-3333-333333333333';

    try {
      await writeFile(path.join(tempDir, `${jobId}.json`), '{invalid-json', 'utf-8');
      const store = new LocalAnalysisResultStore(tempDir);
      await assert.rejects(() => store.getByJobId(jobId), /corrupted JSON/);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
