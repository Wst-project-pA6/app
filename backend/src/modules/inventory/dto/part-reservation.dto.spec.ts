import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  PartReservationCreateRequest,
  PartReservationListQuery,
  PartReservationStatus,
} from './part-reservation.dto';

describe('PartReservationDto', () => {
  describe('PartReservationCreateRequest', () => {
    it('accepts valid part reservation payload', async () => {
      const dto = plainToInstance(PartReservationCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 5,
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(0);
    });

    it('rejects invalid UUIDs, zero, negative, and excessive quantities', async () => {
      const invalidUuidDto = plainToInstance(PartReservationCreateRequest, {
        partId: 'not-a-uuid',
        storeId: 'not-a-uuid',
        quantity: 0,
      });
      const errors = await validate(invalidUuidDto);
      expect(errors.length).toBeGreaterThanOrEqual(3);

      const negativeDto = plainToInstance(PartReservationCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: -1,
      });
      const negErrors = await validate(negativeDto);
      expect(negErrors).toHaveLength(1);

      const excessiveDto = plainToInstance(PartReservationCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 100001,
      });
      const excessErrors = await validate(excessiveDto);
      expect(excessErrors).toHaveLength(1);
    });

    it('rejects extra non-whitelisted fields', async () => {
      const dto = plainToInstance(PartReservationCreateRequest, {
        partId: '11111111-1111-4111-8111-111111111111',
        storeId: '22222222-2222-4222-8222-222222222222',
        quantity: 10,
        extraProperty: 'not-allowed',
      });

      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('extraProperty');
    });
  });

  describe('PartReservationListQuery', () => {
    it('accepts valid status filter and pagination params', async () => {
      const dto = plainToInstance(PartReservationListQuery, {
        page: 2,
        pageSize: 50,
        sort: '-createdAt',
        status: PartReservationStatus.ACTIVE,
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(0);
      expect(dto.page).toBe(2);
      expect(dto.pageSize).toBe(50);
      expect(dto.status).toBe(PartReservationStatus.ACTIVE);
    });

    it('rejects invalid status', async () => {
      const dto = plainToInstance(PartReservationListQuery, {
        status: 'UNKNOWN_STATUS',
      });

      const errors = await validate(dto);
      expect(errors).toHaveLength(1);
      expect(errors[0].property).toBe('status');
    });
  });
});
