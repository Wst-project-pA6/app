import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { VehiclesController } from './vehicles.controller';
import { VehiclesService } from './vehicles.service';

describe('VehiclesController contract', () => {
  const service = {
    list: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    update: jest.fn(),
    listHistory: jest.fn(),
    listReminders: jest.fn(),
    createReminder: jest.fn(),
    updateReminder: jest.fn(),
  } as unknown as VehiclesService;
  const controller = new VehiclesController(service);
  const reflector = new Reflector();

  afterEach(() => jest.clearAllMocks());

  it('declares the contract permission on every vehicle operation', () => {
    expect(reflector.get('wst_permissions', controller.list)).toEqual(['vehicles.read']);
    expect(reflector.get('wst_permissions', controller.create)).toEqual(['vehicles.write']);
    expect(reflector.get('wst_permissions', controller.get)).toEqual(['vehicles.read']);
    expect(reflector.get('wst_permissions', controller.update)).toEqual(['vehicles.write']);
    expect(reflector.get('wst_permissions', controller.listHistory)).toEqual(['vehicles.read']);
    expect(reflector.get('wst_permissions', controller.listReminders)).toEqual(['vehicles.read']);
    expect(reflector.get('wst_permissions', controller.createReminder)).toEqual(['vehicles.write']);
    expect(reflector.get('wst_permissions', controller.updateReminder)).toEqual(['vehicles.write']);
  });

  it('delegates operations and preserves service response objects', async () => {
    const actor = { id: 'actor' } as never;
    const query = { page: 1, pageSize: 20 } as never;
    const dto = { plate: 'ABC123' } as never;
    const response = { id: 'vehicle' };
    (service.list as jest.Mock).mockResolvedValue(response);
    (service.create as jest.Mock).mockResolvedValue(response);
    (service.get as jest.Mock).mockResolvedValue(response);
    (service.update as jest.Mock).mockResolvedValue(response);
    (service.listHistory as jest.Mock).mockResolvedValue(response);
    (service.listReminders as jest.Mock).mockResolvedValue(response);
    (service.createReminder as jest.Mock).mockResolvedValue(response);
    (service.updateReminder as jest.Mock).mockResolvedValue(response);

    await expect(controller.list(query, actor)).resolves.toBe(response);
    await expect(controller.create(dto, actor)).resolves.toBe(response);
    await expect(controller.get('11111111-1111-4111-8111-111111111111', actor)).resolves.toBe(response);
    await expect(controller.update('11111111-1111-4111-8111-111111111111', dto, actor)).resolves.toBe(response);
    await expect(controller.listHistory('11111111-1111-4111-8111-111111111111', query, actor)).resolves.toBe(response);
    await expect(controller.listReminders('11111111-1111-4111-8111-111111111111', query, actor)).resolves.toBe(response);
    await expect(controller.createReminder('11111111-1111-4111-8111-111111111111', dto, actor)).resolves.toBe(response);
    await expect(controller.updateReminder('11111111-1111-4111-8111-111111111111', dto, actor)).resolves.toBe(response);

    expect(service.list).toHaveBeenCalledWith(query, actor);
    expect(service.create).toHaveBeenCalledWith(dto, actor);
    expect(service.get).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', actor);
    expect(service.update).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', dto, actor);
    expect(service.listHistory).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', query, actor);
    expect(service.listReminders).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', query, actor);
    expect(service.createReminder).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', dto, actor);
    expect(service.updateReminder).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', dto, actor);
  });

  it('validates UUID path values before service invocation', async () => {
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'vehicleId',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      new ParseUUIDPipe().transform('not-a-uuid', {
        type: 'param',
        metatype: String,
        data: 'reminderId',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
