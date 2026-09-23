import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { AssessmentCreateDto, AssessmentListQuery, AssessmentUpdateDto, SignOffRequestDto } from './dto/assessment.dto';
import { AssessmentsService } from './assessments.service';

@Controller()
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  @Get('assessments')
  @Permissions('training.read', 'students.self')
  list(@Query() query: AssessmentListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('assessments')
  @Permissions('training.assess')
  create(@Body() dto: AssessmentCreateDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('assessments/:assessmentId')
  @Permissions('training.assess')
  update(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: AssessmentUpdateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(assessmentId, dto, actor);
  }

  @Post('assessments/:assessmentId/sign-off')
  @HttpCode(HttpStatus.OK)
  @Permissions('training.signoff')
  signOff(
    @Param('assessmentId', new ParseUUIDPipe()) assessmentId: string,
    @Body() dto: SignOffRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.signOff(assessmentId, dto, actor);
  }
}
