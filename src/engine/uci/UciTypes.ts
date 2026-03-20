export type UciScore =
  | {
      kind: 'cp';
      value: number;
    }
  | {
      kind: 'mate';
      value: number;
    };

export interface UciInfo {
  depth?: number;
  selDepth?: number;
  multipv?: number;
  nodes?: number;
  nps?: number;
  timeMs?: number;
  pv?: string[];
  score?: UciScore;
  raw: string;
}

export interface UciCandidateLine {
  rank: number;
  info: UciInfo;
}

export interface UciEvaluation {
  bestMove: string;
  ponder?: string;
  info: UciInfo;
  candidateLines?: UciCandidateLine[];
}

export interface UciAnalyzeOptions {
  depth?: number;
  moveTimeMs?: number;
  timeoutMs?: number;
  multiPv?: number;
}

export interface UciClientOptions {
  enginePath: string;
  startupTimeoutMs?: number;
  commandTimeoutMs?: number;
  hashMb?: number;
  threads?: number;
}