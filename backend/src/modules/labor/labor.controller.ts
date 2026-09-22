import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  LaborEntryCreateRequest,
  LaborEntryListQuery,
  LaborEntryUpdateRequest,
  VoidLaborEntryRequest,
} from './dto/labor.dto';
import { LaborService } from './labor.service';

@Controller('job-cards/:jobId/labor-entries')
export class LaborController {
  constructor(private readonly service: LaborService) {}

  @Get()
  @Permissions('labor.read')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: LaborEntryListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(jobId, query, actor);
  }

  @Post()
  @Permissions('labor.write')
  create(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: LaborEntryCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(jobId, dto, actor);
  }

  @Patch(':laborEntryId')
  @Permissions('labor.write')
  update(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('laborEntryId', new ParseUUIDPipe()) laborEntryId: string,
    @Body() dto: LaborEntryUpdateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(jobId, laborEntryId, dto, actor);
  }

  @Post(':laborEntryId/void')
  @HttpCode(HttpStatus.OK)
  @Permissions('labor.write')
  void(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('laborEntryId', new ParseUUIDPipe()) laborEntryId: string,
    @Body() dto: VoidLaborEntryRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.void(jobId, laborEntryId, dto, actor);
  }
}
