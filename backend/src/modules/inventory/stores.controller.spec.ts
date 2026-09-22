import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { StoresController } from './stores.controller';
import { CreateStoreDto, StoreListQuery, UpdateStoreDto } from './dto/store.dto';
import { StoresService } from './stores.service';

describe('StoresController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const storeResponse = { id: 'store-1', code: 'MAIN' };

  it('delegates operations to StoresService and verifies permissions', async () => {
    const listMock = jest.fn().mockResolvedValue(storeResponse);
    const createMock = jest.fn().mockResolvedValue(storeResponse);
    const updateMock = jest.fn().mockResolvedValue(storeResponse);
    const service = {
      list: listMock,
      create: createMock,
      update: updateMock,
    } as unknown as StoresService;

    const controller = new StoresController(service);

    const query: StoreListQuery = { page: 1, pageSize: 20 };
    const createDto: CreateStoreDto = {
      organizationScopeId: '22222222-2222-4222-8222-222222222222',
      code: 'MAIN',
      name: 'Main Store',
    };
    const updateDto: UpdateStoreDto = { name: 'Renamed Store' };
    const storeId = '11111111-1111-4111-8111-111111111111';

    await expect(controller.list(query, actor)).resolves.toBe(storeResponse);
    await expect(controller.create(createDto, actor)).resolves.toBe(storeResponse);
    await expect(controller.update(storeId, updateDto, actor)).resolves.toBe(storeResponse);

    expect(listMock.mock.calls).toEqual([[query, actor]]);
    expect(createMock.mock.calls).toEqual([[createDto, actor]]);
    expect(updateMock.mock.calls).toEqual([[storeId, updateDto, actor]]);

    const reflector = new Reflector();
    const handler = (name: string): Function => Reflect.get(StoresController.prototype, name) as Function;
    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['inventory.read', 'stores.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['stores.manage']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['stores.manage']);
  });

  it('validates storeId UUID path parameter', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'storeId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
