import { ChildProcessWithoutNullStreams, spawn } from 'node:child_process';
import { EOL } from 'node:os';

import { EngineError } from '../../shared/errors/EngineError';
import { parseBestMoveLine, parseInfoLine } from './UciProtocol';
import type { UciAnalyzeOptions, UciClientOptions, UciEvaluation, UciInfo } from './UciTypes';

type PendingCommand = {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
  matcher: (line: string) => boolean;
  timer: NodeJS.Timeout;
};

function withTimeout<T>(
  timeoutMs: number,
  onTimeout: () => Error,
  callback: (resolve: (value: T) => void, reject: (error: Error) => void, timer: NodeJS.Timeout) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(onTimeout()), timeoutMs);
    callback(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
      timer,
    );
  });
}

export class UciClient {
  private readonly options: Required<Pick<UciClientOptions, 'startupTimeoutMs' | 'commandTimeoutMs'>> & UciClientOptions;

  private process: ChildProcessWithoutNullStreams | undefined;
  private startPromise: Promise<void> | undefined;
  private pending: PendingCommand | undefined;
  private queued: Array<() => void> = [];
  private isInitialized = false;
  private infoLines: UciInfo[] = [];
  private readBuffer = '';

  public constructor(options: UciClientOptions) {
    this.options = {
      ...options,
      startupTimeoutMs: options.startupTimeoutMs ?? 5_000,
      commandTimeoutMs: options.commandTimeoutMs ?? 10_000,
    };
  }

  public async start(): Promise<void> {
    if (this.process && this.isInitialized) {
      return;
    }

    if (this.startPromise) {
      await this.startPromise;
      return;
    }

    this.startPromise = (async () => {
      await this.spawnProcess();
      await this.sendAndWait('uci', (line) => line === 'uciok', this.options.startupTimeoutMs);
      await this.sendAndWait('isready', (line) => line === 'readyok', this.options.startupTimeoutMs);

      if (this.options.threads !== undefined) {
        await this.sendAndWait(
          `setoption name Threads value ${this.options.threads}`,
          (line) => line === 'readyok',
          this.options.commandTimeoutMs,
          true,
        );
      }

      if (this.options.hashMb !== undefined) {
        await this.sendAndWait(
          `setoption name Hash value ${this.options.hashMb}`,
          (line) => line === 'readyok',
          this.options.commandTimeoutMs,
          true,
        );
      }

      this.isInitialized = true;
    })();

    try {
      await this.startPromise;
    } finally {
      this.startPromise = undefined;
    }
  }

  public async stop(): Promise<void> {
    if (this.startPromise) {
      await this.startPromise.catch(() => {
        return;
      });
    }

    if (!this.process) {
      return;
    }

    try {
      this.writeLine('quit');
    } catch {
      // Ignore write errors during shutdown
    }

    this.process.removeAllListeners();
    this.process.kill();
    this.process = undefined;
    this.pending = undefined;
    this.startPromise = undefined;
    this.queued = [];
    this.readBuffer = '';
    this.isInitialized = false;
  }

  public async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  public async analyzePosition(fen: string, options: UciAnalyzeOptions = {}): Promise<UciEvaluation> {
    if (!this.isInitialized) {
      await this.start();
    }

    const timeoutMs = options.timeoutMs ?? this.options.commandTimeoutMs;

    this.infoLines = [];
    await this.sendAndWait(`position fen ${fen}`, (line) => line === 'readyok', timeoutMs, true);

    const goCommand = options.depth
      ? `go depth ${options.depth}`
      : options.moveTimeMs
        ? `go movetime ${options.moveTimeMs}`
        : 'go depth 12';

    const bestMoveLine = await this.sendAndWait(goCommand, (line) => line.startsWith('bestmove '), timeoutMs);
    const parsedBestMove = parseBestMoveLine(bestMoveLine);

    if (!parsedBestMove) {
      throw new EngineError('Could not parse bestmove line', 'UCI_PARSE_BESTMOVE_ERROR', { line: bestMoveLine });
    }

    const chosenInfo = this.pickBestInfo(this.infoLines);
    if (!chosenInfo) {
      throw new EngineError('No info lines were parsed from engine output', 'UCI_MISSING_INFO_LINES');
    }

    return {
      bestMove: parsedBestMove.bestMove,
      ponder: parsedBestMove.ponder,
      info: chosenInfo,
    };
  }

  private pickBestInfo(infoLines: UciInfo[]): UciInfo | undefined {
    if (infoLines.length === 0) {
      return undefined;
    }

    return [...infoLines].sort((left, right) => {
      const leftDepth = left.depth ?? -1;
      const rightDepth = right.depth ?? -1;
      return rightDepth - leftDepth;
    })[0];
  }

  private async spawnProcess(): Promise<void> {
    console.info('[UciClient] Spawning Stockfish process', {
      enginePath: this.options.enginePath,
    });

    this.process = spawn(this.options.enginePath, [], {
      stdio: 'pipe',
    });

    this.process.on('error', (error) => {
      console.error('[UciClient] Process error', { error });
      this.failPending(new EngineError('Stockfish process error', 'UCI_PROCESS_ERROR', { error }));
    });

    this.process.on('exit', (code, signal) => {
      console.warn('[UciClient] Process exited', { code, signal });
      this.failPending(
        new EngineError('Stockfish process exited unexpectedly', 'UCI_PROCESS_EXIT', {
          code,
          signal,
        }),
      );
      this.process = undefined;
      this.isInitialized = false;
    });

    this.process.stdout.on('data', (chunk: Buffer) => {
      this.onStdout(chunk.toString('utf8'));
    });

    this.process.stderr.on('data', (chunk: Buffer) => {
      this.onStdout(chunk.toString('utf8'));
    });
  }

  private onStdout(text: string): void {
    this.readBuffer += text;

    const parts = this.readBuffer.split(/\r?\n/);
    this.readBuffer = parts.pop() ?? '';

    for (const rawLine of parts) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const infoLine = parseInfoLine(line);
      if (infoLine) {
        this.infoLines.push(infoLine);
      }

      if (this.pending && this.pending.matcher(line)) {
        const pending = this.pending;
        this.pending = undefined;
        clearTimeout(pending.timer);
        pending.resolve(line);
        this.drainQueue();
      }
    }
  }

  private failPending(error: Error): void {
    if (!this.pending) {
      return;
    }

    const pending = this.pending;
    this.pending = undefined;
    clearTimeout(pending.timer);
    pending.reject(error);
    this.drainQueue();
  }

  private async sendAndWait(
    command: string,
    matcher: (line: string) => boolean,
    timeoutMs: number,
    requiresReady = false,
  ): Promise<string> {
    const enqueueCommand = async (): Promise<string> =>
      withTimeout<string>(
        timeoutMs,
        () => new EngineError(`Command timed out: ${command}`, 'UCI_TIMEOUT', { command, timeoutMs }),
        (resolve, reject, timer) => {
          try {
            this.writeLine(command);
            if (requiresReady) {
              this.writeLine('isready');
            }

            this.pending = { resolve, reject, matcher, timer };
          } catch (error) {
            reject(error instanceof Error ? error : new EngineError('Failed to send UCI command', 'UCI_SEND_ERROR', { command, error }));
          }
        },
      );

    if (this.pending) {
      return new Promise<string>((resolve, reject) => {
        this.queued.push(() => {
          enqueueCommand().then(resolve).catch(reject);
        });
      });
    }

    return enqueueCommand();
  }

  private drainQueue(): void {
    const next = this.queued.shift();
    if (next) {
      next();
    }
  }

  private writeLine(command: string): void {
    if (!this.process || !this.process.stdin.writable) {
      console.error('[UciClient] Attempted to write command but process is not writable', {
        command,
        hasProcess: Boolean(this.process),
        stdinWritable: Boolean(this.process?.stdin?.writable),
      });
      throw new EngineError('Engine process is not writable', 'UCI_PROCESS_NOT_WRITABLE');
    }

    this.process.stdin.write(`${command}${EOL}`);
  }
}