import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreateCustomerDto,
  CustomerType,
  UpdateCustomerDto,
} from './customer.dto';

const validCreate = {
  organizationScopeId: '11111111-1111-4111-8111-111111111111',
  displayName: 'A customer',
  type: CustomerType.INDIVIDUAL,
  phone: '+201001234567',
  contactPreferences: { preferredChannel: 'SMS', preferredLocale: 'ar' },
};

describe('customer DTO validation', () => {
  it('accepts contract-valid create data and validates nested preferences', async () => {
    const dto = plainToInstance(CreateCustomerDto, validCreate);
    await expect(validate(dto, { whitelist: true, forbidNonWhitelisted: true })).resolves.toEqual([]);
  });

  it('rejects invalid UUID, phone, email, enum, and nested preference values', async () => {
    const dto = plainToInstance(CreateCustomerDto, {
      ...validCreate,
      organizationScopeId: 'not-a-uuid',
      phone: '01001234567',
      email: 'not-an-email',
      type: 'PERSON',
      contactPreferences: { preferredChannel: 'WHATSAPP' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('isUuid');
    expect(JSON.stringify(errors)).toContain('isEmail');
  });

  it('rejects empty PATCH bodies, null optional values, and unknown properties', async () => {
    const empty = plainToInstance(UpdateCustomerDto, {});
    const emptyErrors = await validate(empty, { whitelist: true, forbidNonWhitelisted: true });
    expect(emptyErrors.length).toBeGreaterThan(0);

    const invalid = plainToInstance(UpdateCustomerDto, {
      displayName: null,
      unexpected: 'field',
    });
    const errors = await validate(invalid, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('whitelistValidation');
  });
});
