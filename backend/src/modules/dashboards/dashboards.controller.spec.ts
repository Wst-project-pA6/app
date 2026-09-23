import 'reflect-metadata';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import { DashboardsController } from './dashboards.controller';

describe('DashboardsController', () => {
  const actor = { id: 'user-1' } as never;
  const reflector = new Reflector();
  const handler = (name: string): Function => Reflect.get(DashboardsController.prototype, name) as Function;

  it.each([
    ['getWorkshop', 'dashboards.workshop'],
    ['getInventoryFinance', 'dashboards.inventory-finance'],
    ['getTraining', 'dashboards.training'],
    ['getAiData', 'dashboards.ai-data'],
  ])('requires %s permission %s', (method, permission) => {
    expect(reflector.get(PERMISSIONS_KEY, handler(method))).toEqual([permission]);
  });

  it('delegates each endpoint to the matching DashboardsService method with the query filters and actor', async () => {
    const service = {
      getWorkshopDashboard: jest.fn().mockResolvedValue({ dashboard: 'WORKSHOP' }),
      getInventoryFinanceDashboard: jest.fn().mockResolvedValue({ dashboard: 'INVENTORY_FINANCE' }),
      getTrainingDashboard: jest.fn().mockResolvedValue({ dashboard: 'TRAINING' }),
      getAiDataDashboard: jest.fn().mockResolvedValue({ dashboard: 'AI_DATA' }),
    };
    const controller = new DashboardsController(service as never);
    const filters = { storeId: 'store-1' } as never;

    await expect(controller.getWorkshop(filters, actor)).resolves.toEqual({ dashboard: 'WORKSHOP' });
    expect(service.getWorkshopDashboard).toHaveBeenCalledWith(filters, actor);

    await expect(controller.getInventoryFinance(filters, actor)).resolves.toEqual({ dashboard: 'INVENTORY_FINANCE' });
    expect(service.getInventoryFinanceDashboard).toHaveBeenCalledWith(filters, actor);

    await expect(controller.getTraining(filters, actor)).resolves.toEqual({ dashboard: 'TRAINING' });
    expect(service.getTrainingDashboard).toHaveBeenCalledWith(filters, actor);

    await expect(controller.getAiData(filters, actor)).resolves.toEqual({ dashboard: 'AI_DATA' });
    expect(service.getAiDataDashboard).toHaveBeenCalledWith(filters, actor);
  });
});
