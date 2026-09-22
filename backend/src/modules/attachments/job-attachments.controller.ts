import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AttachmentsService } from './attachments.service';
import { JobAttachmentListQuery, JobAttachmentLinkRequest } from './dto/attachment.dto';

@Controller('job-cards/:jobId/attachments')
export class JobAttachmentsController {
  constructor(private readonly service: AttachmentsService) {}

  @Get()
  @Permissions('jobs.read', 'jobs.read.assigned')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: JobAttachmentListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.listForJob(jobId, query, actor);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  @Permissions('attachments.upload')
  link(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: JobAttachmentLinkRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.linkToJob(jobId, dto, actor);
  }
}
