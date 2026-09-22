import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { VendorsController } from './vendors.controller';
import { VendorsService } from './vendors.service';

describe('VendorsController', () => {
  let controller: VendorsController;
  let createMock: jest.Mock;
  let listMock: jest.Mock;
  let updateMock: jest.Mock;

  const mockActor: AuthenticatedPrincipal = {
    id: 'user-1',
    roles: ['PARTS_SPECIALIST'],
    permissions: ['vendors.read', 'vendors.write'],
    email: 'specialist@test.com',
    authTime: new Date(),
    organizationScopeIds: [],
    displayName: 'Specialist',
    preferredLocale: 'en',
    mustChangePassword: false,
  };

  beforeEach(async () => {
    createMock = jest.fn();
    listMock = jest.fn();
    updateMock = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VendorsController],
      providers: [
        {
          provide: VendorsService,
          useValue: {
            create: createMock,
            list: listMock,
            update: updateMock,
          },
        },
      ],
    }).compile();

    controller = module.get<VendorsController>(VendorsController);
  });

  it('declares exact permissions for vendor endpoints', () => {
    const reflector = new Reflector();
    const handler = (name: string): ((...args: unknown[]) => unknown) =>
      Reflect.get(VendorsController.prototype, name) as (...args: unknown[]) => unknown;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['vendors.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('create'))).toEqual(['vendors.write']);
    expect(reflector.get(PERMISSIONS_KEY, handler('update'))).toEqual(['vendors.write']);
  });

  it('delegates create with actor', async () => {
    const dto = { code: 'V-01', name: 'Vendor 1' };
    createMock.mockResolvedValue({ id: 'v-1', ...dto, status: 'ACTIVE' });

    const res = await controller.create(dto, mockActor);
    expect(res.id).toBe('v-1');
    expect(createMock).toHaveBeenCalledWith(dto, mockActor);
  });
});
