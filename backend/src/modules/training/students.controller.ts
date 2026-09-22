import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateStudentDto, StudentListQuery, UpdateStudentDto } from './dto/student.dto';
import { StudentsService } from './students.service';

@Controller()
export class StudentsController {
  constructor(private readonly service: StudentsService) {}

  @Get('students')
  @Permissions('training.read')
  list(@Query() query: StudentListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('students')
  @Permissions('training.manage')
  create(@Body() dto: CreateStudentDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Get('students/:studentId')
  @Permissions('training.read', 'students.self')
  get(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(studentId, actor);
  }

  @Patch('students/:studentId')
  @Permissions('training.manage')
  update(
    @Param('studentId', new ParseUUIDPipe()) studentId: string,
    @Body() dto: UpdateStudentDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(studentId, dto, actor);
  }
}
