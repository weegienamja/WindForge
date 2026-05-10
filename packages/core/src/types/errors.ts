export enum ScoringErrorCode {
  DataFetchFailed = 'DATA_FETCH_FAILED',
  DataUnavailable = 'DATA_UNAVAILABLE',
  InsufficientData = 'INSUFFICIENT_DATA',
  InvalidCoordinate = 'INVALID_COORDINATE',
  InvalidWeights = 'INVALID_WEIGHTS',
  Timeout = 'TIMEOUT',
  Configuration = 'CONFIGURATION',
  OutOfRange = 'OUT_OF_RANGE',
  ParseError = 'PARSE_ERROR',
  Unknown = 'UNKNOWN',
}

export interface ScoringError {
  code: ScoringErrorCode;
  message: string;
  cause?: unknown;
}

export function scoringError(
  code: ScoringErrorCode,
  message: string,
  cause?: unknown,
): ScoringError {
  return { code, message, cause };
}
