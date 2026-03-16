import type { UciInfo, UciScore } from './UciTypes';

const numberPattern = /^-?\d+$/;

function toInt(token: string | undefined): number | undefined {
  if (!token || !numberPattern.test(token)) {
    return undefined;
  }

  return Number.parseInt(token, 10);
}

export function parseBestMoveLine(line: string): { bestMove: string; ponder?: string } | undefined {
  if (!line.startsWith('bestmove ')) {
    return undefined;
  }

  const tokens = line.trim().split(/\s+/);
  if (tokens.length < 2) {
    return undefined;
  }

  const bestMove = tokens[1];
  const ponderIndex = tokens.indexOf('ponder');
  const ponder = ponderIndex > -1 ? tokens[ponderIndex + 1] : undefined;

  return { bestMove, ponder };
}

export function parseInfoLine(line: string): UciInfo | undefined {
  if (!line.startsWith('info ')) {
    return undefined;
  }

  const tokens = line.trim().split(/\s+/);
  const info: UciInfo = { raw: line };

  for (let index = 1; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === 'depth') {
      info.depth = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'seldepth') {
      info.selDepth = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'multipv') {
      info.multipv = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'nodes') {
      info.nodes = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'nps') {
      info.nps = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'time') {
      info.timeMs = toInt(tokens[index + 1]);
      index += 1;
      continue;
    }

    if (token === 'score') {
      const scoreType = tokens[index + 1];
      const scoreValue = toInt(tokens[index + 2]);

      if (scoreType && scoreValue !== undefined) {
        let score: UciScore | undefined;
        if (scoreType === 'cp') {
          score = { kind: 'cp', value: scoreValue };
        } else if (scoreType === 'mate') {
          score = { kind: 'mate', value: scoreValue };
        }

        if (score) {
          info.score = score;
        }
      }

      index += 2;
      continue;
    }

    if (token === 'pv') {
      info.pv = tokens.slice(index + 1);
      break;
    }
  }

  return info;
}