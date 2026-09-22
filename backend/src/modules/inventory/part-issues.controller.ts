import {
  Body,
  Controller,
  Get,
  Headers,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CurrentUser } from '../auth/current-user.decorator';
import { PartIssueCreateRequest, PartIssueListQuery, PartIssueReversalRequest } from './dto/part-issue.dto';
import { PartIssuesService } from './part-issues.service';

function validateIdempotencyKey(idempotencyKey?: string): void {
  if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
    throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, 'Invalid Idempotency-Key header length');
  }
}

@Controller()
export class PartIssuesController {
  constructor(private readonly service: PartIssuesService) {}

  @Get('job-cards/:jobId/part-issues')
  @Permissions('inventory.read', 'inventory.issue', 'inventory.reverse')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: PartIssueListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(jobId, query, actor);
  }

  @Post('job-cards/:jobId/part-issues')
  @Permissions('inventory.issue')
  issue(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: PartIssueCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    validateIdempotencyKey(idempotencyKey);
    return this.service.issue(jobId, dto, actor, idempotencyKey);
  }

  @Post('job-cards/:jobId/part-issues/:partIssueId/reversals')
  @Permissions('inventory.reverse')
  reverse(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('partIssueId', new ParseUUIDPipe()) partIssueId: string,
    @Body() dto: PartIssueReversalRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    validateIdempotencyKey(idempotencyKey);
    return this.service.reverse(jobId, partIssueId, dto, actor, idempotencyKey);
  }
}
