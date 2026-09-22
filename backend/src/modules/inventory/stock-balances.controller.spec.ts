import 'reflect-metadata';
import { BadRequestException, ParseUUIDPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../common/auth/permissions.decorator';
import {
  StockBalanceListQuery,
  StockLevelsUpdateRequest,
  StockMovementListQuery,
  StockReconciliationQuery,
} from './dto/stock-balance.dto';
import { StockBalancesController } from './stock-balances.controller';
import { StockBalancesService } from './stock-balances.service';

describe('StockBalancesController', () => {
  const actor = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } as never;
  const balanceResponse = { items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };
  const reconciliationResponse = {
    generatedAt: new Date(),
    checkedBalances: 0,
    mismatchCount: 0,
    reconciled: true,
    mismatches: [],
  };
  const updatedBalanceResponse = { storeId: 'store-1', partId: 'part-1' };
  const movementResponse = { items: [], page: { page: 1, pageSize: 20, totalItems: 0, totalPages: 0 } };

  it('delegates operations to StockBalancesService and enforces exact permissions', async () => {
    const listBalancesMock = jest.fn().mockResolvedValue(balanceResponse);
    const getReconciliationMock = jest.fn().mockResolvedValue(reconciliationResponse);
    const replaceLevelsMock = jest.fn().mockResolvedValue(updatedBalanceResponse);
    const listMovementsMock = jest.fn().mockResolvedValue(movementResponse);

    const service = {
      listBalances: listBalancesMock,
      getReconciliation: getReconciliationMock,
      replaceLevels: replaceLevelsMock,
      listMovements: listMovementsMock,
    } as unknown as StockBalancesService;

    const controller = new StockBalancesController(service);

    const balanceQuery: StockBalanceListQuery = { page: 1, pageSize: 20 };
    const reconcQuery: StockReconciliationQuery = {};
    const levelsDto: StockLevelsUpdateRequest = { minLevel: 5, maxLevel: 20 };
    const movementQuery: StockMovementListQuery = { page: 1, pageSize: 20 };
    const storeId = '11111111-1111-4111-8111-111111111111';
    const partId = '22222222-2222-4222-8222-222222222222';

    await expect(controller.list(balanceQuery, actor)).resolves.toBe(balanceResponse);
    await expect(controller.reconciliation(reconcQuery, actor)).resolves.toBe(reconciliationResponse);
    await expect(controller.replaceLevels(storeId, partId, levelsDto, actor)).resolves.toBe(
      updatedBalanceResponse,
    );
    await expect(controller.listMovements(movementQuery, actor)).resolves.toBe(movementResponse);

    expect(listBalancesMock.mock.calls).toEqual([[balanceQuery, actor]]);
    expect(getReconciliationMock.mock.calls).toEqual([[reconcQuery, actor]]);
    expect(replaceLevelsMock.mock.calls).toEqual([[storeId, partId, levelsDto, actor]]);
    expect(listMovementsMock.mock.calls).toEqual([[movementQuery, actor]]);

    const reflector = new Reflector();
    const handler = (name: string): Function =>
      Reflect.get(StockBalancesController.prototype, name) as Function;

    expect(reflector.get(PERMISSIONS_KEY, handler('list'))).toEqual(['inventory.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('reconciliation'))).toEqual(['inventory.read']);
    expect(reflector.get(PERMISSIONS_KEY, handler('replaceLevels'))).toEqual(['parts.write']);
    expect(reflector.get(PERMISSIONS_KEY, handler('listMovements'))).toEqual(['inventory.read']);
  });

  it('validates storeId and partId UUID path parameters', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'storeId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      pipe.transform('invalid-uuid', { type: 'param', data: 'partId', metatype: String }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
