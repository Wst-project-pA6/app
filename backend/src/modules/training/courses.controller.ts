import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CourseListQuery, CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CoursesService } from './courses.service';

@Controller()
export class CoursesController {
  constructor(private readonly service: CoursesService) {}

  @Get('courses')
  @Permissions('training.read', 'students.self')
  list(@Query() query: CourseListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('courses')
  @Permissions('training.manage')
  create(@Body() dto: CreateCourseDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('courses/:courseId')
  @Permissions('training.manage')
  update(
    @Param('courseId', new ParseUUIDPipe()) courseId: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(courseId, dto, actor);
  }
}
