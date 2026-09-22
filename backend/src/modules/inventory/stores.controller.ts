import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateStoreDto, StoreListQuery, UpdateStoreDto } from './dto/store.dto';
import { StoresService } from './stores.service';

@Controller()
export class StoresController {
  constructor(private readonly service: StoresService) {}

  @Get('stores')
  @Permissions('inventory.read', 'stores.manage')
  list(@Query() query: StoreListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('stores')
  @Permissions('stores.manage')
  create(@Body() dto: CreateStoreDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('stores/:storeId')
  @Permissions('stores.manage')
  update(
    @Param('storeId', new ParseUUIDPipe()) storeId: string,
    @Body() dto: UpdateStoreDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(storeId, dto, actor);
  }
}
