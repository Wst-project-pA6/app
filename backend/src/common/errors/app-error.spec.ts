import { AppError, ErrorDetail } from './app-error';
import { ErrorCode } from './error-codes';

describe('AppError', () => {
  describe('constructor', () => {
    it('should create an AppError with required properties', () => {
      const error = new AppError(400, ErrorCode.BAD_REQUEST, 'Bad request');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.name).toBe('AppError');
      expect(error.message).toBe('Bad request');
      expect(error.statusCode).toBe(400);
      expect(error.code).toBe(ErrorCode.BAD_REQUEST);
      expect(error.details).toBeUndefined();
    });

    it('should create an AppError with details', () => {
      const details: ErrorDetail[] = [
        { code: 'REQUIRED', message: 'Field is required', field: '/email' },
        { code: 'TOO_LONG', message: 'Field too long', field: '/name', params: { max: '120' } },
      ];
      const error = new AppError(422, ErrorCode.VALIDATION_FAILED, 'Validation failed', details);

      expect(error.details).toEqual(details);
      expect(error.details).toHaveLength(2);
      expect(error.details?.[0].code).toBe('REQUIRED');
      expect(error.details?.[1].params).toEqual({ max: '120' });
    });

    it('should preserve prototype chain for instanceof checks', () => {
      const error = new AppError(404, ErrorCode.NOT_FOUND, 'Not found');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof AppError).toBe(true);
    });

    it('should have correct Error prototype properties', () => {
      const error = new AppError(500, ErrorCode.INTERNAL_ERROR, 'Internal error');

      expect(error.name).toBe('AppError');
      expect(Object.getPrototypeOf(error)).toBe(AppError.prototype);
    });
  });

  describe('ErrorCode enum completeness', () => {
    it('should contain all standard error codes', () => {
      expect(ErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
      expect(ErrorCode.UNAUTHENTICATED).toBe('UNAUTHENTICATED');
      expect(ErrorCode.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(ErrorCode.TOKEN_EXPIRED).toBe('TOKEN_EXPIRED');
      expect(ErrorCode.FORBIDDEN).toBe('FORBIDDEN');
      expect(ErrorCode.NOT_FOUND).toBe('NOT_FOUND');
      expect(ErrorCode.VALIDATION_FAILED).toBe('VALIDATION_FAILED');
      expect(ErrorCode.RATE_LIMITED).toBe('RATE_LIMITED');
      expect(ErrorCode.INTERNAL_ERROR).toBe('INTERNAL_ERROR');
      expect(ErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    });

    it('should contain all 409 conflict error codes', () => {
      expect(ErrorCode.INVALID_STATE_TRANSITION).toBe('INVALID_STATE_TRANSITION');
      expect(ErrorCode.VERSION_CONFLICT).toBe('VERSION_CONFLICT');
      expect(ErrorCode.DUPLICATE_RESOURCE).toBe('DUPLICATE_RESOURCE');
      expect(ErrorCode.IDEMPOTENCY_CONFLICT).toBe('IDEMPOTENCY_CONFLICT');
      expect(ErrorCode.RESOURCE_IN_USE).toBe('RESOURCE_IN_USE');
      expect(ErrorCode.CUSTOMER_APPROVAL_REQUIRED).toBe('CUSTOMER_APPROVAL_REQUIRED');
      expect(ErrorCode.JOB_STAGE_NOT_ALLOWED).toBe('JOB_STAGE_NOT_ALLOWED');
      expect(ErrorCode.JOB_ASSIGNMENT_REQUIRED).toBe('JOB_ASSIGNMENT_REQUIRED');
      expect(ErrorCode.CHECKLIST_INCOMPLETE).toBe('CHECKLIST_INCOMPLETE');
      expect(ErrorCode.QUALITY_CHECK_REQUIRED).toBe('QUALITY_CHECK_REQUIRED');
      expect(ErrorCode.INVOICE_REQUIRED).toBe('INVOICE_REQUIRED');
      expect(ErrorCode.INSUFFICIENT_STOCK).toBe('INSUFFICIENT_STOCK');
      expect(ErrorCode.REVERSAL_EXCEEDS_ISSUED).toBe('REVERSAL_EXCEEDS_ISSUED');
      expect(ErrorCode.RESERVATION_INVALID).toBe('RESERVATION_INVALID');
      expect(ErrorCode.SCHEDULE_CONFLICT).toBe('SCHEDULE_CONFLICT');
      expect(ErrorCode.CONFLICT_NOT_OVERRIDABLE).toBe('CONFLICT_NOT_OVERRIDABLE');
      expect(ErrorCode.SEPARATION_OF_DUTIES_VIOLATION).toBe('SEPARATION_OF_DUTIES_VIOLATION');
      expect(ErrorCode.DUPLICATE_APPROVAL).toBe('DUPLICATE_APPROVAL');
      expect(ErrorCode.RECEIPT_EXCEEDS_ORDERED).toBe('RECEIPT_EXCEEDS_ORDERED');
      expect(ErrorCode.PAYMENT_AMOUNT_MISMATCH).toBe('PAYMENT_AMOUNT_MISMATCH');
      expect(ErrorCode.ASSESSMENT_LOCKED).toBe('ASSESSMENT_LOCKED');
      expect(ErrorCode.CERTIFICATE_NOT_ELIGIBLE).toBe('CERTIFICATE_NOT_ELIGIBLE');
      expect(ErrorCode.ATTACHMENT_INVALID).toBe('ATTACHMENT_INVALID');
      expect(ErrorCode.ATTACHMENT_NOT_LINKABLE).toBe('ATTACHMENT_NOT_LINKABLE');
      expect(ErrorCode.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE');
      expect(ErrorCode.UNSUPPORTED_MEDIA_TYPE).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(ErrorCode.EXPORT_NOT_READY).toBe('EXPORT_NOT_READY');
      expect(ErrorCode.EXPORT_EXPIRED).toBe('EXPORT_EXPIRED');
    });
  });

  describe('ErrorDetail structure', () => {
    it('should match OpenAPI ErrorDetail schema', () => {
      const detail: ErrorDetail = {
        field: '/email',
        code: 'INVALID_FORMAT',
        message: 'Invalid email format',
        params: { pattern: '^\\S+@\\S+\\.\\S+$' },
      };

      expect(detail.field).toBe('/email');
      expect(detail.code).toBe('INVALID_FORMAT');
      expect(detail.message).toBe('Invalid email format');
      expect(detail.params).toEqual({ pattern: '^\\S+@\\S+\\.\\S+$' });
    });

    it('should allow optional field and params', () => {
      const detail: ErrorDetail = {
        code: 'REQUIRED',
        message: 'Field is required',
      };

      expect(detail.field).toBeUndefined();
      expect(detail.params).toBeUndefined();
    });
  });
});