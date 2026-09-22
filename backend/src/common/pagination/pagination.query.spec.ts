import 'reflect-metadata';
import { PaginationQuery } from './pagination.query';
import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';

describe('PaginationQuery', () => {
  describe('defaults', () => {
    it('should default page to 1', async () => {
      const dto = plainToInstance(PaginationQuery, {});
      await validate(dto);
      expect(dto.page).toBe(1);
    });

    it('should default pageSize to 20', async () => {
      const dto = plainToInstance(PaginationQuery, {});
      await validate(dto);
      expect(dto.pageSize).toBe(20);
    });

    it('should not require sort', async () => {
      const dto = plainToInstance(PaginationQuery, {});
      const errors = await validate(dto);
      const sortErrors = errors.filter((e) => e.property === 'sort');
      expect(sortErrors).toHaveLength(0);
    });
  });

  describe('page validation', () => {
    it('should accept page >= 1', async () => {
      const dto = plainToInstance(PaginationQuery, { page: '5' });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'page')).toHaveLength(0);
    });

    it('should reject page < 1', async () => {
      const dto = plainToInstance(PaginationQuery, { page: '0' });
      const errors = await validate(dto);
      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(1);
    });

    it('should reject non-integer page', async () => {
      const dto = plainToInstance(PaginationQuery, { page: '1.5' });
      const errors = await validate(dto);
      const pageErrors = errors.filter((e) => e.property === 'page');
      expect(pageErrors).toHaveLength(1);
    });
  });

  describe('pageSize validation', () => {
    it('should accept pageSize between 1 and 100', async () => {
      const dto = plainToInstance(PaginationQuery, { pageSize: '50' });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'pageSize')).toHaveLength(0);
    });

    it('should reject pageSize < 1', async () => {
      const dto = plainToInstance(PaginationQuery, { pageSize: '0' });
      const errors = await validate(dto);
      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(1);
    });

    it('should reject pageSize > 100', async () => {
      const dto = plainToInstance(PaginationQuery, { pageSize: '101' });
      const errors = await validate(dto);
      const pageSizeErrors = errors.filter((e) => e.property === 'pageSize');
      expect(pageSizeErrors).toHaveLength(1);
    });
  });

  describe('sort validation', () => {
    it('should accept valid sort field', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: 'createdAt' });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
    });

    it('should accept descending sort with - prefix', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: '-createdAt' });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
    });

    it('should accept multiple comma-separated sort fields', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: '-createdAt,jobNumber' });
      const errors = await validate(dto);
      expect(errors.filter((e) => e.property === 'sort')).toHaveLength(0);
    });

    it('should reject sort with invalid characters', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: 'created@At' });
      const errors = await validate(dto);
      const sortErrors = errors.filter((e) => e.property === 'sort');
      expect(sortErrors).toHaveLength(1);
    });

    it('should reject sort starting with number', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: '1createdAt' });
      const errors = await validate(dto);
      const sortErrors = errors.filter((e) => e.property === 'sort');
      expect(sortErrors).toHaveLength(1);
    });

    it('should reject sort with empty field', async () => {
      const dto = plainToInstance(PaginationQuery, { sort: 'createdAt,' });
      const errors = await validate(dto);
      const sortErrors = errors.filter((e) => e.property === 'sort');
      expect(sortErrors).toHaveLength(1);
    });
  });

  describe('transformation', () => {
    it('should transform string page to number', async () => {
      const dto = plainToInstance(PaginationQuery, { page: '3' });
      await validate(dto);
      expect(typeof dto.page).toBe('number');
      expect(dto.page).toBe(3);
    });

    it('should transform string pageSize to number', async () => {
      const dto = plainToInstance(PaginationQuery, { pageSize: '50' });
      await validate(dto);
      expect(typeof dto.pageSize).toBe('number');
      expect(dto.pageSize).toBe(50);
    });
  });

  describe('unknown properties', () => {
    it('should not strip unknown properties by default (handled by global pipe)', async () => {
      const dto = plainToInstance(PaginationQuery, { page: '1', unknownField: 'test' });
      await validate(dto);
      expect((dto as Record<string, unknown>).unknownField).toBe('test');
    });
  });
});