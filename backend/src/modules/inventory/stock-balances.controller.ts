import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  StockBalanceListQuery,
  StockLevelsUpdateRequest,
  StockMovementListQuery,
  StockReconciliationQuery,
} from './dto/stock-balance.dto';
import { StockBalancesService } from './stock-balances.service';

@Controller()
export class StockBalancesController {
  constructor(private readonly service: StockBalancesService) {}

  @Get('stock-balances')
  @Permissions('inventory.read')
  list(
    @Query() query: StockBalanceListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listBalances(query, actor);
  }

  @Get('stock-balances/reconciliation')
  @Permissions('inventory.read')
  reconciliation(
    @Query() query: StockReconciliationQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.getReconciliation(query, actor);
  }

  @Put('stock-balances/:storeId/:partId/levels')
  @Permissions('parts.write')
  replaceLevels(
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
    @Param('partId', new ParseUUIDPipe()) partId: string,
    @Body() dto: StockLevelsUpdateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.replaceLevels(storeId, partId, dto, actor);
  }

  @Get('stock-movements')
  @Permissions('inventory.read')
  listMovements(
    @Query() query: StockMovementListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listMovements(query, actor);
  }
}
