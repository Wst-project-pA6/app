import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { QualityCheckCreateRequest, QualityCheckListQuery } from './dto/quality-check.dto';
import { QualityService } from './quality.service';

@Controller('job-cards/:jobId/quality-checks')
export class QualityController {
  constructor(private readonly service: QualityService) {}

  @Get()
  @Permissions('jobs.read', 'jobs.read.assigned', 'quality.perform')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: QualityCheckListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(jobId, query, actor);
  }

  @Post()
  @Permissions('quality.perform')
  create(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: QualityCheckCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(jobId, dto, actor);
  }
}
