import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  StockAdjustmentCreateRequest,
  StockAdjustmentDecision,
  StockAdjustmentDecisionRequest,
  StockAdjustmentListQuery,
  StockAdjustmentReasonCode,
  StockAdjustmentStatus,
} from './stock-adjustment.dto';

describe('StockAdjustmentDto', () => {
  describe('StockAdjustmentCreateRequest', () => {
    it('accepts a valid positive stock adjustment payload', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: 5,
        reasonCode: StockAdjustmentReasonCode.FOUND,
        note: 'Found extra inventory during count',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('accepts a valid negative stock adjustment payload without note', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: -3,
        reasonCode: StockAdjustmentReasonCode.DAMAGE,
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects quantityDelta equal to 0', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: 0,
        reasonCode: StockAdjustmentReasonCode.COUNT_CORRECTION,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('quantityDelta');
    });

    it('rejects non-integer quantityDelta', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: 2.5,
        reasonCode: StockAdjustmentReasonCode.LOSS,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('quantityDelta');
    });

    it('rejects invalid UUIDs and invalid reasonCode', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: 'not-a-uuid',
        partId: 'not-a-uuid',
        quantityDelta: 1,
        reasonCode: 'INVALID_REASON',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });

    it('rejects note exceeding 500 characters', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: 1,
        reasonCode: StockAdjustmentReasonCode.OTHER,
        note: 'a'.repeat(501),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('note');
    });

    it('rejects extra non-whitelisted fields', async () => {
      const dto = plainToInstance(StockAdjustmentCreateRequest, {
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        quantityDelta: 1,
        reasonCode: StockAdjustmentReasonCode.OTHER,
        extraProperty: 'not-allowed',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('extraProperty');
    });
  });

  describe('StockAdjustmentDecisionRequest', () => {
    it('accepts APPROVED decision with optional reason', async () => {
      const dto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: StockAdjustmentDecision.APPROVED,
        reason: 'Verified and approved count adjustment',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('accepts REJECTED decision without reason', async () => {
      const dto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: StockAdjustmentDecision.REJECTED,
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects reason shorter than 3 characters or longer than 500', async () => {
      const shortDto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: StockAdjustmentDecision.APPROVED,
        reason: 'no',
      });
      const shortErrors = await validate(shortDto);
      expect(shortErrors).toHaveLength(1);
      expect(shortErrors[0].property).toBe('reason');

      const longDto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: StockAdjustmentDecision.APPROVED,
        reason: 'a'.repeat(501),
      });
      const longErrors = await validate(longDto);
      expect(longErrors).toHaveLength(1);
      expect(longErrors[0].property).toBe('reason');
    });

    it('rejects invalid decision value', async () => {
      const dto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: 'MAYBE',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('decision');
    });

    it('rejects extra non-whitelisted fields', async () => {
      const dto = plainToInstance(StockAdjustmentDecisionRequest, {
        decision: StockAdjustmentDecision.APPROVED,
        unknownField: 'bad',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('unknownField');
    });
  });

  describe('StockAdjustmentListQuery', () => {
    it('accepts valid query filters and pagination', async () => {
      const dto = plainToInstance(StockAdjustmentListQuery, {
        page: 2,
        pageSize: 50,
        sort: '-createdAt',
        status: StockAdjustmentStatus.PENDING_APPROVAL,
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.pageSize).toBe(50);
      expect(dto.status).toBe(StockAdjustmentStatus.PENDING_APPROVAL);
    });

    it('rejects invalid status filter and non-UUID filters', async () => {
      const dto = plainToInstance(StockAdjustmentListQuery, {
        status: 'INVALID_STATUS',
        storeId: 'bad-uuid',
        partId: 'bad-uuid',
      });

      const errors = await validate(dto);
      expect(errors.length).toBeGreaterThanOrEqual(3);
    });
  });
});
