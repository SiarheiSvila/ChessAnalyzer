import { AppError } from './AppError';

export class EngineError extends AppError {
  public constructor(message: string, code = 'ENGINE_ERROR', details?: unknown) {
    super(message, code, details);
    this.name = 'EngineError';
  }
}