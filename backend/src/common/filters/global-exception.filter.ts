import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError, ErrorDetail } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { RequestContext } from '../request-context/request-context';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  constructor(private readonly requestContext: RequestContext) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const requestId = this.requestContext.getRequestId() ?? this.extractRequestId(request);

    if (exception instanceof AppError) {
      this.handleAppError(exception, response, requestId);
      return;
    }

    if (exception instanceof HttpException) {
      this.handleHttpException(exception, response, requestId);
      return;
    }

    this.handleUnknownError(exception, response, requestId);
  }

  private handleAppError(exception: AppError, response: Response, requestId: string): void {
    this.setAuthenticationChallenge(exception.statusCode, response);
    const errorResponse = {
      code: exception.code,
      message: exception.message,
      details: exception.details,
      ...(exception.conflicts ? { conflicts: exception.conflicts } : {}),
      requestId,
    };

    response.status(exception.statusCode).json(errorResponse);
  }

  private handleHttpException(exception: HttpException, response: Response, requestId: string): void {
    const status = exception.getStatus();
    const exceptionResponse = exception.getResponse();

    let code: ErrorCode;
    let message: string;
    let details: ErrorDetail[] | undefined;

    if (status === HttpStatus.UNPROCESSABLE_ENTITY) {
      code = ErrorCode.VALIDATION_FAILED;
      message = 'Validation failed';
      details = this.extractValidationDetails(exceptionResponse);
    } else {
      code = this.mapHttpStatusToErrorCode(status);
      message = this.extractMessage(exceptionResponse);
    }

    const errorResponse = {
      code,
      message,
      details,
      requestId,
    };

    this.setAuthenticationChallenge(status, response);
    response.status(status).json(errorResponse);
  }

  private setAuthenticationChallenge(status: number, response: Response): void {
    if (status === HttpStatus.UNAUTHORIZED) response.setHeader('WWW-Authenticate', 'Bearer');
  }

  private handleUnknownError(exception: unknown, response: Response, requestId: string): void {
    this.logger.error('Unexpected error', {
      exception: exception instanceof Error ? exception.stack : String(exception),
      requestId,
    });

    const errorResponse = {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'An unexpected error occurred',
      requestId,
    };

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(errorResponse);
  }

  private extractValidationDetails(exceptionResponse: unknown): ErrorDetail[] | undefined {
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse &&
      Array.isArray((exceptionResponse as Record<string, unknown>).message)
    ) {
      const messages = (exceptionResponse as Record<string, unknown>).message as string[];
      return messages.map((msg, index) => ({
        field: `/${index}`,
        code: 'VALIDATION_ERROR',
        message: msg,
      }));
    }
    return undefined;
  }

  private extractMessage(exceptionResponse: unknown): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const msg = (exceptionResponse as Record<string, unknown>).message;
      if (typeof msg === 'string') {
        return msg;
      }
      if (Array.isArray(msg) && msg.length > 0) {
        return msg[0];
      }
    }
    return 'An error occurred';
  }

  private mapHttpStatusToErrorCode(status: number): ErrorCode {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCode.UNAUTHENTICATED;
      case HttpStatus.FORBIDDEN:
        return ErrorCode.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCode.NOT_FOUND;
      case HttpStatus.REQUEST_TIMEOUT:
        return ErrorCode.BAD_REQUEST;
      case HttpStatus.CONFLICT:
        return ErrorCode.INVALID_STATE_TRANSITION;
      case HttpStatus.PAYLOAD_TOO_LARGE:
        return ErrorCode.PAYLOAD_TOO_LARGE;
      case HttpStatus.UNSUPPORTED_MEDIA_TYPE:
        return ErrorCode.UNSUPPORTED_MEDIA_TYPE;
      case HttpStatus.TOO_MANY_REQUESTS:
        return ErrorCode.RATE_LIMITED;
      case HttpStatus.SERVICE_UNAVAILABLE:
        return ErrorCode.SERVICE_UNAVAILABLE;
      default:
        return ErrorCode.INTERNAL_ERROR;
    }
  }

  private extractRequestId(request: Request): string {
    const header = request.headers['x-request-id'];
    if (header && typeof header === 'string') {
      return header;
    }
    return 'unknown';
  }
}
