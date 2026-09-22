import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  CreateJobCardDto,
  CreateWorkItemDto,
  JobAssignmentDto,
  JobListQuery,
  JobStageHistoryQuery,
  JobTransitionRequest,
  TechnicianListQuery,
  UpdateJobCardDto,
  UpdateWorkItemDto,
  WorkItemListQuery,
} from './dto/job.dto';
import { JobsService } from './jobs.service';

@Controller()
export class JobsController {
  constructor(private readonly service: JobsService) {}

  @Get('technicians')
  @Permissions('jobs.assign')
  listTechnicians(
    @Query() query: TechnicianListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listTechnicians(query, actor);
  }

  @Get('job-cards')
  @Permissions('jobs.read', 'jobs.read.assigned')
  list(@Query() query: JobListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('job-cards')
  @Permissions('jobs.create')
  create(@Body() dto: CreateJobCardDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Get('job-cards/:jobId')
  @Permissions('jobs.read', 'jobs.read.assigned')
  get(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(jobId, actor);
  }

  @Patch('job-cards/:jobId')
  @Permissions('jobs.update')
  update(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: UpdateJobCardDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(jobId, dto, actor);
  }

  @Put('job-cards/:jobId/assignment')
  @Permissions('jobs.assign')
  assign(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: JobAssignmentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.assign(jobId, dto, actor);
  }

  @Get('job-cards/:jobId/work-items')
  @Permissions('jobs.read', 'jobs.read.assigned')
  listWorkItems(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: WorkItemListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listWorkItems(jobId, query, actor);
  }

  @Post('job-cards/:jobId/work-items')
  @Permissions('jobs.update')
  createWorkItem(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: CreateWorkItemDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.createWorkItem(jobId, dto, actor);
  }

  @Patch('job-cards/:jobId/work-items/:workItemId')
  @Permissions('labor.write', 'jobs.update')
  updateWorkItem(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('workItemId', new ParseUUIDPipe()) workItemId: string,
    @Body() dto: UpdateWorkItemDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.updateWorkItem(jobId, workItemId, dto, actor);
  }

  @Post('job-cards/:jobId/transitions')
  @HttpCode(HttpStatus.OK)
  @Permissions('jobs.transition.start', 'jobs.transition.submit-qc', 'quality.perform', 'jobs.transition.ready', 'jobs.transition.deliver')
  transition(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: JobTransitionRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.transition(jobId, dto, actor);
  }

  @Get('job-cards/:jobId/stage-history')
  @Permissions('jobs.read', 'jobs.read.assigned')
  listStageHistory(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: JobStageHistoryQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listStageHistory(jobId, query, actor);
  }
}
