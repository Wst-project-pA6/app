import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  CreatePartDto,
  PartListQuery,
  PartStatus,
  UpdatePartDto,
  VehicleCompatibilityDto,
} from './part.dto';

describe('PartDto', () => {
  it('validates a complete and correct CreatePartDto', async () => {
    const dto = plainToInstance(CreatePartDto, {
      sku: 'FLTR-OIL-001',
      barcode: '1234567890',
      name: { en: 'Oil Filter', ar: 'فلتر زيت' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: '25.5000', currency: 'USD' },
      compatibility: [
        { make: 'Toyota', model: 'Corolla', yearFrom: 2018, yearTo: 2022 },
      ],
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects invalid SKU formats according to schema pattern', async () => {
    const invalidSkus = [
      'lower-case',
      '-starts-with-dash',
      '_starts-with-underscore',
      'A', // too short (<2 chars)
      'A'.repeat(65), // too long (>64 chars)
      'HAS SPACES',
      'HAS$PECIAL!',
    ];

    for (const sku of invalidSkus) {
      const dto = plainToInstance(CreatePartDto, {
        sku,
        name: { en: 'Filter' },
        category: 'Filters',
        unitOfMeasure: 'EA',
        sellingPrice: { amount: '10.0000', currency: 'USD' },
      });
      const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
      expect(errors.some((e) => e.property === 'sku')).toBe(true);
    }
  });

  it('rejects invalid barcode format', async () => {
    const dto = plainToInstance(CreatePartDto, {
      sku: 'VALID-SKU-1',
      barcode: 'abc', // too short (<4 chars)
      name: { en: 'Filter' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: '10.0000', currency: 'USD' },
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.some((e) => e.property === 'barcode')).toBe(true);
  });

  it('rejects invalid money amount or currency format', async () => {
    const dto1 = plainToInstance(CreatePartDto, {
      sku: 'VALID-SKU-1',
      name: { en: 'Filter' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: 'not-a-decimal', currency: 'USD' },
    });
    const errors1 = await validate(dto1, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors1.some((e) => e.property === 'sellingPrice')).toBe(true);

    const dto2 = plainToInstance(CreatePartDto, {
      sku: 'VALID-SKU-1',
      name: { en: 'Filter' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: '10.50', currency: 'us' }, // lowercase currency
    });
    const errors2 = await validate(dto2, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors2.some((e) => e.property === 'sellingPrice')).toBe(true);
  });

  it('rejects vehicle compatibility with yearFrom > yearTo or years out of 1950-2100 range', async () => {
    const compat1 = plainToInstance(VehicleCompatibilityDto, {
      make: 'Honda',
      yearFrom: 2025,
      yearTo: 2020,
    });
    const errors1 = await validate(compat1);
    expect(errors1.length).toBeGreaterThan(0);

    const compat2 = plainToInstance(VehicleCompatibilityDto, {
      make: 'Honda',
      yearFrom: 1940,
    });
    const errors2 = await validate(compat2);
    expect(errors2.length).toBeGreaterThan(0);
  });

  it('validates a valid UpdatePartDto', async () => {
    const dto = plainToInstance(UpdatePartDto, {
      version: 1,
      category: 'Air Filters',
      status: PartStatus.ARCHIVED,
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });

  it('rejects empty UpdatePartDto and UpdatePartDto with only version', async () => {
    const emptyDto = plainToInstance(UpdatePartDto, {});
    const emptyErrors = await validate(emptyDto, { whitelist: true, forbidNonWhitelisted: true });
    expect(emptyErrors.length).toBeGreaterThan(0);

    const onlyVersionDto = plainToInstance(UpdatePartDto, { version: 1 });
    const onlyVersionErrors = await validate(onlyVersionDto, { whitelist: true, forbidNonWhitelisted: true });
    expect(onlyVersionErrors.length).toBeGreaterThan(0);
  });

  it('rejects immutable SKU or extra properties on UpdatePartDto', async () => {
    const dto = plainToInstance(UpdatePartDto, {
      version: 1,
      category: 'Filters',
      sku: 'NEW-SKU-ATTEMPT',
    });
    const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors.length).toBeGreaterThan(0);
  });

  it('validates PartListQuery', async () => {
    const query = plainToInstance(PartListQuery, {
      page: 1,
      pageSize: 25,
      sort: '-sku,category',
      q: 'oil',
      status: PartStatus.ACTIVE,
      compatibleMake: 'Toyota',
    });
    const errors = await validate(query, { whitelist: true, forbidNonWhitelisted: true });
    expect(errors).toHaveLength(0);
  });
});
