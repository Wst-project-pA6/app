import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateStoreDto, StoreListQuery, StoreStatus, UpdateStoreDto } from './store.dto';

describe('StoreDto', () => {
  it('validates a correct CreateStoreDto', async () => {
    const dto = plainToInstance(CreateStoreDto, {
      organizationScopeId: '22222222-2222-4222-8222-222222222222',
      code: 'MAIN',
      name: 'Main Warehouse',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid UUID, empty strings, and extra fields in CreateStoreDto', async () => {
    const dto = plainToInstance(CreateStoreDto, {
      organizationScopeId: 'not-a-uuid',
      code: '',
      name: '',
      extra: 'not-allowed',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThanOrEqual(3);
  });

  it('rejects code exceeding 20 characters and name exceeding 120 characters in CreateStoreDto', async () => {
    const dto = plainToInstance(CreateStoreDto, {
      organizationScopeId: '22222222-2222-4222-8222-222222222222',
      code: 'A'.repeat(21),
      name: 'B'.repeat(121),
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThanOrEqual(2);
  });

  it('validates a correct UpdateStoreDto with name or status', async () => {
    const dto1 = plainToInstance(UpdateStoreDto, { name: 'Secondary Store' });
    const errors1 = await validate(dto1, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors1).toHaveLength(0);

    const dto2 = plainToInstance(UpdateStoreDto, { status: StoreStatus.INACTIVE });
    const errors2 = await validate(dto2, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors2).toHaveLength(0);
  });

  it('rejects empty bodies and extra fields in UpdateStoreDto', async () => {
    const emptyDto = plainToInstance(UpdateStoreDto, {});
    const emptyErrors = await validate(emptyDto, { whitelist: true, forbidNonWhitelisted: true });
    expect(emptyErrors.length).toBeGreaterThan(0);

    const extraDto = plainToInstance(UpdateStoreDto, {
      name: 'Valid Name',
      extraProperty: 'forbidden',
    });
    const extraErrors = await validate(extraDto, { whitelist: true, forbidNonWhitelisted: true });
    expect(extraErrors.length).toBeGreaterThan(0);
  });

  it('rejects invalid enum values in UpdateStoreDto and StoreListQuery', async () => {
    const invalidStatusDto = plainToInstance(UpdateStoreDto, { status: 'INVALID_STATUS' });
    const errors = await validate(invalidStatusDto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);

    const invalidQuery = plainToInstance(StoreListQuery, { status: 'UNKNOWN' });
    const queryErrors = await validate(invalidQuery, { whitelist: true, forbidNonWhitelisted: true });
    expect(queryErrors.length).toBeGreaterThan(0);
  });
});
