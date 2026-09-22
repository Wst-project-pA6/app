import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { PartsController } from './parts.controller';
import { CreatePartDto, PartListQuery, UpdatePartDto } from './dto/part.dto';
import { PartsService } from './parts.service';

describe('PartsController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const partResponse = { id: 'part-1', sku: 'FLTR-001' };

  it('delegates operations to PartsService and exposes exact permissions', async () => {
    const listMock = jest.fn().mockResolvedValue(partResponse);
    const createMock = jest.fn().mockResolvedValue(partResponse);
    const getMock = jest.fn().mockResolvedValue(partResponse);
    const updateMock = jest.fn().mockResolvedValue(partResponse);
    const service = {
      list: listMock,
      create: createMock,
      get: getMock,
      update: updateMock,
    } as unknown as PartsService;

    const controller = new PartsController(service);

    const query: PartListQuery = { page: 1, pageSize: 20 };
    const createDto: CreatePartDto = {
      sku: 'FLTR-001',
      name: { en: 'Oil Filter' },
      category: 'Filters',
      unitOfMeasure: 'EA',
      sellingPrice: { amount: '15.0000', currency: 'USD' },
    };
    const updateDto: UpdatePartDto = { version: 1, category: 'Updated Filters' };
    const partId = '11111111-1111-4111-8111-111111111111';

    await expect(controller.list(query)).resolves.toBe(partResponse);
    await expect(controller.create(createDto, actor)).resolves.toBe(partResponse);
    await expect(controller.get(partId)).resolves.toBe(partResponse);
    await expect(controller.update(partId, updateDto, actor)).resolves.toBe(partResponse);

    expect(listMock.mock.calls).toEqual([[query]]);
    expect(createMock.mock.calls).toEqual([[createDto, actor]]);
    expect(getMock.mock.calls).toEqual([[partId]]);
    expect(updateMock.mock.calls).toEqual([[partId, updateDto, actor]]);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(PartsController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['parts.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['parts.write']);
    expect(reflector.get(PERMISSIONS_KEY, handler('get'))).toEqual(['parts.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['parts.write']);
  });

  it('validates partId UUID path parameter', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'partId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
