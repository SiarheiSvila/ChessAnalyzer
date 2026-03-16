import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AnalysisJobManager } from '../../src/jobs/AnalysisJobManager';
import type { AnalysisResultStore, PersistedAnalysisRecord } from '../../src/storage/AnalysisResultStore';

async function waitForState(
  manager: AnalysisJobManager,
  jobId: string,
  states: Array<'completed' | 'failed'>,
): Promise<'completed' | 'failed'> {
  const start = Date.now();

  while (Date.now() - start < 3000) {
    const status = manager.getStatus(jobId);
    if (status && states.includes(status.state as 'completed' | 'failed')) {
      return status.state as 'completed' | 'failed';
    }

    await new Promise((resolve) => setTimeout(resolve, 20));
  }

  throw new Error('Timed out waiting for terminal state');
}

describe('AnalysisJobManager', () => {
  it('transitions queued -> running -> completed and stores result', async () => {
    const manager = new AnalysisJobManager(async (_request, onProgress) => {
      onProgress({ currentPly: 1, totalPlies: 2, percent: 50 });
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
          accuracyWhite: 100,
          accuracyBlack: 100,
          counts: {
            white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
          },
          criticalMoments: 0,
        },
      };
    });

    const { jobId } = manager.createJob({ pgn: '1. e4 e5' });
    const terminal = await waitForState(manager, jobId, ['completed']);
    const status = manager.getStatus(jobId);

    assert.equal(terminal, 'completed');
    assert.ok(status);
    assert.equal(status?.state, 'completed');
    assert.equal(status?.progress, 100);
    assert.ok(status?.result);
  });

  it('transitions to failed with structured error', async () => {
    const manager = new AnalysisJobManager(async () => {
      throw new Error('boom');
    });

    const { jobId } = manager.createJob({ pgn: '1. e4 e5' });
    const terminal = await waitForState(manager, jobId, ['failed']);
    const status = manager.getStatus(jobId);

    assert.equal(terminal, 'failed');
    assert.equal(status?.state, 'failed');
    assert.equal(status?.error?.code, 'ANALYSIS_FAILED');
    assert.equal(status?.error?.message, 'boom');
  });

  it('respects max concurrent job limit', async () => {
    let running = 0;
    let maxRunning = 0;

    const manager = new AnalysisJobManager(
      async (_request, _onProgress) => {
        running += 1;
        maxRunning = Math.max(maxRunning, running);
        await new Promise((resolve) => setTimeout(resolve, 50));
        running -= 1;

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
            accuracyWhite: 100,
            accuracyBlack: 100,
            counts: {
              white: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
              black: { best: 0, excellent: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 },
            },
            criticalMoments: 0,
          },
        };
      },
      undefined,
      { maxConcurrentJobs: 1 },
    );

    const first = manager.createJob({ pgn: '1. e4 e5' });
    const second = manager.createJob({ pgn: '1. d4 d5' });

    await waitForState(manager, first.jobId, ['completed']);
    await waitForState(manager, second.jobId, ['completed']);

    assert.equal(maxRunning, 1);
  });

  it('persists completed analysis to configured store', async () => {
    const savedRecords: PersistedAnalysisRecord[] = [];
    const resultStore: AnalysisResultStore = {
      save: async (record) => {
        savedRecords.push(record);
      },
      getByJobId: async () => undefined,
    };

    const manager = new AnalysisJobManager(
      async (_request, _onProgress) => ({
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
      }),
      undefined,
      { analysisResultStore: resultStore },
    );

    const { jobId } = manager.createJob({ pgn: '1. e4 e5' });
    await waitForState(manager, jobId, ['completed']);

    assert.equal(savedRecords.length, 1);
    assert.equal(savedRecords[0]?.jobId, jobId);
    assert.equal(savedRecords[0]?.analysisVersion, 1);
  });

  it('does not persist failed analysis to configured store', async () => {
    const savedRecords: PersistedAnalysisRecord[] = [];
    const resultStore: AnalysisResultStore = {
      save: async (record) => {
        savedRecords.push(record);
      },
      getByJobId: async () => undefined,
    };

    const manager = new AnalysisJobManager(
      async () => {
        throw new Error('engine failed');
      },
      undefined,
      { analysisResultStore: resultStore },
    );

    const { jobId } = manager.createJob({ pgn: '1. e4 e5' });
    await waitForState(manager, jobId, ['failed']);

    assert.equal(savedRecords.length, 0);
  });
});