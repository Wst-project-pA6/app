import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateTrainingSessionDto, TrainingSessionListQuery, UpdateTrainingSessionDto } from './dto/training-session.dto';
import { TrainingSessionsService } from './training-sessions.service';

@Controller()
export class TrainingSessionsController {
  constructor(private readonly service: TrainingSessionsService) {}

  @Get('training-sessions')
  @Permissions('training.read', 'students.self')
  list(@Query() query: TrainingSessionListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('training-sessions')
  @Permissions('training.manage')
  create(@Body() dto: CreateTrainingSessionDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Get('training-sessions/:sessionId')
  @Permissions('training.read', 'students.self')
  get(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.get(sessionId, actor);
  }

  @Patch('training-sessions/:sessionId')
  @Permissions('training.manage')
  update(
    @Param('sessionId', new ParseUUIDPipe()) sessionId: string,
    @Body() dto: UpdateTrainingSessionDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(sessionId, dto, actor);
  }
}
