import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateTrainingGroupDto, TrainingGroupListQuery, UpdateTrainingGroupDto } from './dto/training-group.dto';
import { TrainingGroupsService } from './training-groups.service';

@Controller()
export class TrainingGroupsController {
  constructor(private readonly service: TrainingGroupsService) {}

  @Get('training-groups')
  @Permissions('training.read')
  list(@Query() query: TrainingGroupListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('training-groups')
  @Permissions('training.manage')
  create(@Body() dto: CreateTrainingGroupDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('training-groups/:groupId')
  @Permissions('training.manage')
  update(
    @Param('groupId', new ParseUUIDPipe()) groupId: string,
    @Body() dto: UpdateTrainingGroupDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(groupId, dto, actor);
  }
}
