import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BayCalendarQuery, BayListQuery, CreateBayDto, UpdateBayDto } from './dto/bay.dto';
import { BaysService } from './bays.service';

@Controller()
export class BaysController {
  constructor(private readonly service: BaysService) {}

  @Get('bays')
  @Permissions('bays.read')
  list(@Query() query: BayListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('bays')
  @Permissions('bays.manage')
  create(@Body() dto: CreateBayDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('bays/:bayId')
  @Permissions('bays.manage')
  update(
    @Param('bayId', new ParseUUIDPipe()) bayId: string,
    @Body() dto: UpdateBayDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(bayId, dto, actor);
  }

  @Get('bays/:bayId/calendar')
  @Permissions('bays.read')
  calendar(
    @Param('bayId', new ParseUUIDPipe()) bayId: string,
    @Query() query: BayCalendarQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.calendar(bayId, query, actor);
  }
}
