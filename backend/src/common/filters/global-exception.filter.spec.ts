import { HttpStatus } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { GlobalExceptionFilter } from './global-exception.filter';
import { RequestContext } from '../request-context/request-context';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { Request, Response } from 'express';

describe('GlobalExceptionFilter', () => {
  let filter: GlobalExceptionFilter;
  let requestContext: RequestContext;
  let mockResponse: Partial<Response>;
  let mockRequest: Partial<Request>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;
  let setHeaderMock: jest.Mock;

  beforeEach(() => {
    requestContext = new RequestContext();
    filter = new GlobalExceptionFilter(requestContext);

    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    setHeaderMock = jest.fn();

    mockResponse = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    mockRequest = {
      headers: {},
    };
  });

  const callFilter = (exception: unknown) => {
    filter.catch(exception, {
      switchToHttp: () => ({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    } as any);
  };

  describe('AppError handling', () => {
    it('should return AppError with correct status, code, message, and requestId', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const appError = new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, 'Invalid input');
        callFilter(appError);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(jsonMock).toHaveBeenCalledWith({
          code: ErrorCode.BAD_REQUEST,
          message: 'Invalid input',
          details: undefined,
          requestId,
        });
      });
    });

    it('should include details when present', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const details = [
          { field: '/email', code: 'INVALID_FORMAT', message: 'Invalid email' },
        ];
        const appError = new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', details);
        callFilter(appError);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(jsonMock).toHaveBeenCalledWith({
          code: ErrorCode.VALIDATION_FAILED,
          message: 'Validation failed',
          details,
          requestId,
        });
      });
    });

    it('includes schedule conflicts without changing the legacy error fields', () => {
      const requestId = 'test-request-id';
      const conflicts = [{
        conflictKey: 'BAY_UNAVAILABLE-bay-1', kind: 'BAY_UNAVAILABLE', overridable: false,
        overridden: false, message: 'Bay is not available',
      }];
      requestContext.run({ requestId }, () => {
        const appError = new AppError(HttpStatus.CONFLICT, ErrorCode.SCHEDULE_CONFLICT, 'Scheduling conflict', undefined, conflicts);
        callFilter(appError);

        expect(jsonMock).toHaveBeenCalledWith({
          code: ErrorCode.SCHEDULE_CONFLICT,
          message: 'Scheduling conflict',
          details: undefined,
          conflicts,
          requestId,
        });
      });
    });

    it('should use requestId from RequestContext', () => {
      const requestId = 'context-request-id';
      requestContext.run({ requestId }, () => {
        const appError = new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Not found');
        callFilter(appError);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({ requestId: 'context-request-id' }),
        );
      });
    });
  });

  describe('HttpException handling', () => {
    it('should map 400 to BAD_REQUEST', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Bad request', HttpStatus.BAD_REQUEST);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.BAD_REQUEST,
            message: 'Bad request',
            requestId,
          }),
        );
      });
    });

    it('should map 401 to UNAUTHENTICATED', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.UNAUTHENTICATED,
            message: 'Unauthorized',
            requestId,
          }),
        );
      });
    });

    it('should map 403 to FORBIDDEN', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Forbidden', HttpStatus.FORBIDDEN);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.FORBIDDEN,
            message: 'Forbidden',
            requestId,
          }),
        );
      });
    });

    it('should map 404 to NOT_FOUND', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Not found', HttpStatus.NOT_FOUND);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.NOT_FOUND,
            message: 'Not found',
            requestId,
          }),
        );
      });
    });

    it('should map 409 to INVALID_STATE_TRANSITION', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Conflict', HttpStatus.CONFLICT);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.CONFLICT);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.INVALID_STATE_TRANSITION,
            message: 'Conflict',
            requestId,
          }),
        );
      });
    });

    it('should map 413 to PAYLOAD_TOO_LARGE', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Payload too large', HttpStatus.PAYLOAD_TOO_LARGE);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.PAYLOAD_TOO_LARGE);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.PAYLOAD_TOO_LARGE,
            message: 'Payload too large',
            requestId,
          }),
        );
      });
    });

    it('should map 415 to UNSUPPORTED_MEDIA_TYPE', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Unsupported media type', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNSUPPORTED_MEDIA_TYPE);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.UNSUPPORTED_MEDIA_TYPE,
            message: 'Unsupported media type',
            requestId,
          }),
        );
      });
    });

    it('should map 422 to VALIDATION_FAILED with details', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException(
          { message: ['Field is required', 'Invalid format'] },
          HttpStatus.UNPROCESSABLE_ENTITY,
        );
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.UNPROCESSABLE_ENTITY);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Validation failed',
            details: expect.arrayContaining([
              expect.objectContaining({ code: 'VALIDATION_ERROR' }),
            ]),
            requestId,
          }),
        );
      });
    });

    it('should map 429 to RATE_LIMITED', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Too many requests', HttpStatus.TOO_MANY_REQUESTS);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests',
            requestId,
          }),
        );
      });
    });

    it('should map 503 to SERVICE_UNAVAILABLE', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Service unavailable', HttpStatus.SERVICE_UNAVAILABLE);
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.SERVICE_UNAVAILABLE,
            message: 'Service unavailable',
            requestId,
          }),
        );
      });
    });

    it('should map unknown status to INTERNAL_ERROR', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException('Unknown', 418); // I'm a teapot
        callFilter(httpException);

        expect(statusMock).toHaveBeenCalledWith(418);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.INTERNAL_ERROR,
            message: 'Unknown',
            requestId,
          }),
        );
      });
    });

    it('should extract message from object response', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const httpException = new HttpException({ message: 'Object message' }, HttpStatus.BAD_REQUEST);
        callFilter(httpException);

        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            message: 'Object message',
          }),
        );
      });
    });
  });

  describe('Unknown error handling', () => {
    it('should return INTERNAL_ERROR for unknown errors', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        callFilter(new Error('Something went wrong'));

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An unexpected error occurred',
            requestId,
          }),
        );
      });
    });

    it('should return INTERNAL_ERROR for non-Error thrown values', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        callFilter('string error');

        expect(statusMock).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
        expect(jsonMock).toHaveBeenCalledWith(
          expect.objectContaining({
            code: ErrorCode.INTERNAL_ERROR,
            message: 'An unexpected error occurred',
            requestId,
          }),
        );
      });
    });

    it('should not leak stack trace in response', () => {
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        const error = new Error('Internal error');
        error.stack = 'Error: Internal error\n    at Object.<anonymous>';
        callFilter(error);

        const response = jsonMock.mock.calls[0][0];
        expect(response.message).toBe('An unexpected error occurred');
        expect(JSON.stringify(response)).not.toContain('stack');
        expect(JSON.stringify(response)).not.toContain('Internal error');
      });
    });

    it('should log unexpected errors', () => {
      const loggerSpy = jest.spyOn(filter['logger'], 'error').mockImplementation();
      const requestId = 'test-request-id';
      requestContext.run({ requestId }, () => {
        callFilter(new Error('Unexpected'));

        expect(loggerSpy).toHaveBeenCalledWith('Unexpected error', expect.objectContaining({
          requestId,
          exception: expect.stringContaining('Unexpected'),
        }));
      });
      loggerSpy.mockRestore();
    });
  });

  describe('Request ID fallback', () => {
    it('should use X-Request-Id header when RequestContext has no requestId', () => {
      mockRequest.headers = { 'x-request-id': 'header-request-id' };
      callFilter(new Error('test'));

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'header-request-id',
        }),
      );
    });

    it('should use unknown when no RequestContext and no header', () => {
      mockRequest.headers = {};
      callFilter(new Error('test'));

      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: 'unknown',
        }),
      );
    });
  });
});
