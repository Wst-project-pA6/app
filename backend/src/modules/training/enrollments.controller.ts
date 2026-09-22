import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateEnrollmentDto, EnrollmentListQuery, UpdateEnrollmentDto } from './dto/enrollment.dto';
import { EnrollmentsService } from './enrollments.service';

@Controller()
export class EnrollmentsController {
  constructor(private readonly service: EnrollmentsService) {}

  @Get('training-groups/:groupId/enrollments')
  @Permissions('training.read')
  list(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Query() query: EnrollmentListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(groupId, query, actor);
  }

  @Post('training-groups/:groupId/enrollments')
  @Permissions('training.manage')
  create(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: CreateEnrollmentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.create(groupId, dto, actor);
  }

  @Patch('enrollments/:enrollmentId')
  @Permissions('training.manage')
  withdraw(
    @Param('enrollmentId', new ParseUUIDPipe()) enrollmentId: string,
    @Body() dto: UpdateEnrollmentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.withdraw(enrollmentId, dto, actor);
  }
}
