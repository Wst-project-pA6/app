import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PartIssueCreateRequest,
  PartIssueListQuery,
  PartIssueReversalRequest,
} from './part-issue.dto';

describe('PartIssueDto', () => {
  describe('PartIssueCreateRequest', () => {
    it('accepts a valid part issue payload without optional fields', async () => {
      const dto = plainToInstance(PartIssueCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 2,
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('accepts optional workItemId and reservationId', async () => {
      const dto = plainToInstance(PartIssueCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 2,
        workItemId: '33333333-3333-4333-8333-333333333333',
        reservationId: '44444444-4444-4444-8444-444444444444',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid UUIDs, zero, and excessive quantities', async () => {
      const invalidUuidDto = plainToInstance(PartIssueCreateRequest, {
        partId: 'not-a-uuid',
        storeId: 'not-a-uuid',
        quantity: 0,
      });
      const errors = await validate(invalidUuidDto);
      expect(errors.length).toBeGreaterThanOrEqual(3);

      const excessiveDto = plainToInstance(PartIssueCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 100001,
      });
      const excessErrors = await validate(excessiveDto);
      expect(excessErrors).toHaveLength(1);
    });

    it('rejects extra non-whitelisted fields', async () => {
      const dto = plainToInstance(PartIssueCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 2,
        extraProperty: 'not-allowed',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('extraProperty');
    });
  });

  describe('PartIssueListQuery', () => {
    it('accepts pagination and sort params', async () => {
      const dto = plainToInstance(PartIssueListQuery, {
        page: 2,
        pageSize: 50,
        sort: '-createdAt',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.pageSize).toBe(50);
    });
  });

  describe('PartIssueReversalRequest', () => {
    it('accepts a valid reversal payload', async () => {
      const dto = plainToInstance(PartIssueReversalRequest, {
        quantity: 1,
        reason: 'Wrong part installed',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects quantity below 1', async () => {
      const dto = plainToInstance(PartIssueReversalRequest, {
        quantity: 0,
        reason: 'Wrong part installed',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('quantity');
    });

    it('rejects reason shorter than 3 characters', async () => {
      const dto = plainToInstance(PartIssueReversalRequest, {
        quantity: 1,
        reason: 'ab',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('reason');
    });

    it('rejects reason longer than 500 characters', async () => {
      const dto = plainToInstance(PartIssueReversalRequest, {
        quantity: 1,
        reason: 'a'.repeat(501),
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('reason');
    });

    it('rejects extra non-whitelisted fields', async () => {
      const dto = plainToInstance(PartIssueReversalRequest, {
        quantity: 1,
        reason: 'Wrong part installed',
        extraProperty: 'not-allowed',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('extraProperty');
    });
  });
});
