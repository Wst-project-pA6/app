import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

describe('CustomersController contract', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    getStatement: jest.fn(),
  } as unknown as CustomersService;
  const controller = new CustomersController(service);
  const reflector = new Reflector();

  afterEach(() => jest.clearAllMocks());

  it('declares the contract permission on every customer endpoint', () => {
    expect(reflector.get('wst_permissions', controller.list)).toEqual(['customers.read']);
    expect(reflector.get('wst_permissions', controller.create)).toEqual(['customers.write']);
    expect(reflector.get('wst_permissions', controller.get)).toEqual(['customers.read']);
    expect(reflector.get('wst_permissions', controller.update)).toEqual(['customers.write']);
    expect(
      reflector.get('wst_permissions', Reflect.get(CustomersController.prototype, 'getStatement')),
    ).toEqual(['invoices.read']);
  });

  it('delegates each operation and preserves service responses', async () => {
    const actor = { id: 'actor' } as never;
    const query = { page: 1, pageSize: 20 } as never;
    const dto = { displayName: 'Updated' } as never;
    const statementQuery = { from: '2026-01-01T00:00:00Z' } as never;
    const listResult = { items: [], page: {} };
    const customer = { id: 'customer' };
    const statement = { customerId: 'customer', lines: [] };
    (service.list as jest.Mock).mockResolvedValue(listResult);
    (service.create as jest.Mock).mockResolvedValue(customer);
    (service.get as jest.Mock).mockResolvedValue(customer);
    (service.update as jest.Mock).mockResolvedValue(customer);
    (service.getStatement as jest.Mock).mockResolvedValue(statement);

    await expect(controller.list(query, actor)).resolves.toBe(listResult);
    await expect(controller.create(dto, actor)).resolves.toBe(customer);
    await expect(controller.get('11111111-1111-4111-8111-111111111111', actor)).resolves.toBe(customer);
    await expect(controller.update('11111111-1111-4111-8111-111111111111', dto, actor)).resolves.toBe(customer);
    await expect(controller.getStatement('11111111-1111-4111-8111-111111111111', statementQuery, actor)).resolves.toBe(statement);

    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(service.get).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', actor);
    expect(service.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', dto, actor);
    expect((service.getStatement as jest.Mock).mock.calls[0]).toEqual([
      '11111111-1111-4111-8111-111111111111',
      statementQuery,
      actor,
    ]);
  });

  it('validates UUID path parameters before controller invocation', async () => {
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'customerId',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
