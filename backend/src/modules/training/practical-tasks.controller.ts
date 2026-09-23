import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreatePracticalTaskDto, PracticalTaskListQuery, UpdatePracticalTaskDto } from './dto/practical-task.dto';
import { PracticalTasksService } from './practical-tasks.service';

@Controller()
export class PracticalTasksController {
  constructor(private readonly service: PracticalTasksService) {}

  @Get('practical-tasks')
  @Permissions('training.read')
  list(@Query() query: PracticalTaskListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('practical-tasks')
  @Permissions('training.manage')
  create(@Body() dto: CreatePracticalTaskDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('practical-tasks/:taskId')
  @Permissions('training.manage')
  update(
    @Param('taskId', new ParseUUIDPipe()) taskId: string,
    @Body() dto: UpdatePracticalTaskDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(taskId, dto, actor);
  }
}
