import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CourseIdQuery } from './dto/student-progress.dto';
import { EligibilityService } from './eligibility.service';

@Controller()
export class StudentProgressController {
  constructor(private readonly service: EligibilityService) {}

  @Get('students/:studentId/competency-coverage')
  @Permissions('training.read', 'students.self')
  getCoverage(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: CourseIdQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.getCoverage(studentId, query.courseId, actor);
  }

  @Get('students/:studentId/completion-eligibility')
  @Permissions('training.read', 'students.self')
  getEligibility(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Query() query: CourseIdQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.getEligibility(studentId, query.courseId, actor);
  }
}
