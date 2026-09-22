import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { ApprovalsService } from './approvals.service';
import { JobApprovalCreateRequest, JobApprovalDecisionRequest, JobApprovalListQuery } from './dto/approval.dto';

@Controller('job-cards/:jobId/approvals')
export class ApprovalsController {
  constructor(private readonly service: ApprovalsService) {}

  @Get()
  @Permissions('approvals.read')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: JobApprovalListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(jobId, query, actor);
  }

  @Post()
  @Permissions('approvals.record')
  create(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: JobApprovalCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(jobId, dto, actor);
  }

  @Post(':approvalId/decision')
  @HttpCode(HttpStatus.OK)
  @Permissions('approvals.record')
  decide(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('approvalId', new ParseUUIDPipe()) approvalId: string,
    @Body() dto: JobApprovalDecisionRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.decide(jobId, approvalId, dto, actor);
  }
}
