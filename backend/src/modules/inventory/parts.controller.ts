import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreatePartDto, PartListQuery, UpdatePartDto } from './dto/part.dto';
import { PartsService } from './parts.service';

@Controller()
export class PartsController {
  constructor(private readonly service: PartsService) {}

  @Get('parts')
  @Permissions('parts.read')
  list(@Query() query: PartListQuery) {
    return this.service.list(query);
  }

  @Post('parts')
  @Permissions('parts.write')
  create(@Body() dto: CreatePartDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Get('parts/:partId')
  @Permissions('parts.read')
  get(@Param('partId', new ParseUUIDPipe()) partId: string) {
    return this.service.get(partId);
  }

  @Patch('parts/:partId')
  @Permissions('parts.write')
  update(
    @Param('partId', new ParseUUIDPipe()) partId: string,
    @Body() dto: UpdatePartDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(partId, dto, actor);
  }
}
