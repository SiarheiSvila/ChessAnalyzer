import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { PgnParser } from '../../src/chess/PgnParser';

describe('PgnParser real PGN fixture', () => {
  it('parses pgns/example1.pgn and extracts headers and SAN moves', () => {
    const filePath = join(process.cwd(), 'pgns', 'example1.pgn');
    const pgn = readFileSync(filePath, 'utf8');

    const parser = new PgnParser();
    const parsed = parser.parse(pgn);

    assert.equal(parsed.headers.Event, 'Live Chess');
    assert.equal(parsed.headers.Site, 'Chess.com');
    assert.equal(parsed.headers.Result, '1-0');

    assert.equal(parsed.sanMoves.length, 93);
    assert.equal(parsed.sanMoves[0], 'e4');
    assert.equal(parsed.sanMoves[1], 'c6');
    assert.equal(parsed.sanMoves[parsed.sanMoves.length - 1], 'Bxg4');
  });
});