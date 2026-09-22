import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  StockBalanceListQuery,
  StockLevelsUpdateRequest,
  StockMovementListQuery,
  StockMovementType,
  StockReconciliationQuery,
} from './stock-balance.dto';

describe('StockBalanceDto', () => {
  describe('StockLevelsUpdateRequest', () => {
    it('validates a correct level replacement payload', async () => {
      const dto = plainToInstance(StockLevelsUpdateRequest, {
        minLevel: 5,
        maxLevel: 20,
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('accepts minLevel equal to maxLevel', async () => {
      const dto = plainToInstance(StockLevelsUpdateRequest, {
        minLevel: 10,
        maxLevel: 10,
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects maxLevel less than minLevel', async () => {
      const dto = plainToInstance(StockLevelsUpdateRequest, {
        minLevel: 20,
        maxLevel: 10,
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.property === 'maxLevel')).toBe(true);
    });

    it('rejects negative levels and extra properties', async () => {
      const dto = plainToInstance(StockLevelsUpdateRequest, {
        minLevel: -1,
        maxLevel: 5,
        extraProperty: 123,
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('StockBalanceListQuery', () => {
    it('validates query filters with boolean transformations', async () => {
      const dto = plainToInstance(StockBalanceListQuery, {
        page: 1,
        pageSize: 50,
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        category: 'Filters',
        belowMinimum: 'true',
        stockedOut: 'false',
        sort: 'available',
        q: 'oil',
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
      expect(dto.belowMinimum).toBe(true);
      expect(dto.stockedOut).toBe(false);
    });

    it('rejects invalid UUIDs for storeId and partId', async () => {
      const dto = plainToInstance(StockBalanceListQuery, {
        storeId: 'invalid-uuid',
        partId: 'not-a-uuid',
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('StockReconciliationQuery', () => {
    it('validates optional storeId UUID', async () => {
      const validDto = plainToInstance(StockReconciliationQuery, {
        storeId: '11111111-1111-4111-8111-111111111111',
      });
      const validErrors = await validate(validDto, { whitelist: true, forbidNonWhitelisted: true });
      expect(validErrors).toHaveLength(0);

      const emptyDto = plainToInstance(StockReconciliationQuery, {});
      const emptyErrors = await validate(emptyDto, { whitelist: true, forbidNonWhitelisted: true });
      expect(emptyErrors).toHaveLength(0);

      const invalidDto = plainToInstance(StockReconciliationQuery, {
        storeId: 'not-a-uuid',
      });
      const invalidErrors = await validate(invalidDto, { whitelist: true, forbidNonWhitelisted: true });
      expect(invalidErrors.length).toBeGreaterThan(0);
    });
  });

  describe('StockMovementListQuery', () => {
    it('validates stock movement query parameters', async () => {
      const dto = plainToInstance(StockMovementListQuery, {
        page: 1,
        pageSize: 20,
        sort: '-occurredAt',
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
        type: StockMovementType.RECEIPT,
        storeId: '11111111-1111-4111-8111-111111111111',
        partId: '22222222-2222-4222-8222-222222222222',
        jobId: '33333333-3333-4333-8333-333333333333',
        purchaseOrderId: '44444444-4444-4444-8444-444444444444',
        goodsReceiptId: '55555555-5555-4555-8555-555555555555',
        stockAdjustmentId: '66666666-6666-4666-8666-666666666666',
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid movement type and malformed dates', async () => {
      const dto = plainToInstance(StockMovementListQuery, {
        type: 'INVALID_MOVEMENT_TYPE',
        from: 'not-a-date',
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.length).toBeGreaterThanOrEqual(2);
    });
  });
});
