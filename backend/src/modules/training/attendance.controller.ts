import { Body, Controller, Get, Param, ParseUUIDPipe, Put, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AttendanceBulkRequestDto, AttendanceListQuery } from './dto/attendance.dto';
import { AttendanceService } from './attendance.service';

@Controller()
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Put('training-sessions/:sessionId/attendance')
  @Permissions('training.attendance.record')
  record(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: AttendanceBulkRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.record(sessionId, dto, actor);
  }

  @Get('attendance-records')
  @Permissions('training.read', 'students.self')
  list(@Query() query: AttendanceListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }
}
