import { ErrorCode } from './error-codes';

/**
 * Structure matching the OpenAPI ErrorDetail schema.
 */
export interface ErrorDetail {
  /** JSON Pointer to the offending request field. */
  field?: string;
  /** Machine-readable detail code, e.g., REQUIRED, TOO_LONG, MILEAGE_LOWER_THAN_RECORDED. */
  code: string;
  /** Human-readable message. */
  message: string;
  /** Named values for message templates, e.g., available and requested quantities. */
  params?: Record<string, string>;
}

/**
 * Base application error class.
 * Extends Error and carries structured error information matching the OpenAPI Error schema.
 * The requestId is added by GlobalExceptionFilter and is not part of this class.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: ErrorDetail[];
  public readonly conflicts?: unknown[];

  constructor(
    statusCode: number,
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[],
    conflicts?: unknown[],
  ) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.conflicts = conflicts;

    // Preserve proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, AppError.prototype);
  }
}
