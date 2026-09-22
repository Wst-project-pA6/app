import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AuditEventsService } from './audit-events.service';
import { AuditEventListQuery } from './dto/audit-event.dto';

@Controller('audit-events')
@Permissions('audit.read')
export class AuditEventsController {
  constructor(private readonly service: AuditEventsService) {}

  @Get()
  list(@Query() query: AuditEventListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Get(':auditEventId')
  get(
    @Param('auditEventId', new ParseUUIDPipe()) auditEventId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(auditEventId, actor);
  }
}
