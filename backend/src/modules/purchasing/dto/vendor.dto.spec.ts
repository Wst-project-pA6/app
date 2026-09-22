import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { VendorCreateDto, VendorUpdateDto } from './vendor.dto';

describe('VendorDto', () => {
  it('validates a valid create payload', async () => {
    const dto = plainToInstance(VendorCreateDto, {
      code: 'VEND-001',
      name: 'Acme Supplies',
      contactName: 'John Doe',
      phone: '+1234567890',
      email: 'john@acme.com',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });

  it('rejects invalid phone', async () => {
    const dto = plainToInstance(VendorCreateDto, {
      code: 'VEND-001',
      name: 'Acme',
      phone: 'invalid-phone',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('rejects invalid email', async () => {
    const dto = plainToInstance(VendorCreateDto, {
      code: 'VEND-001',
      name: 'Acme',
      email: 'not-an-email',
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates update payload with valid status', async () => {
    const dto = plainToInstance(VendorUpdateDto, {
      status: 'INACTIVE',
    });
    const errors = await validate(dto);
    expect(errors.length).toBe(0);
  });
});
