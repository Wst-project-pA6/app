import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateTrainingTermDto, TrainingTermListQuery, UpdateTrainingTermDto } from './dto/training-term.dto';
import { TrainingTermsService } from './training-terms.service';

@Controller()
export class TrainingTermsController {
  constructor(private readonly service: TrainingTermsService) {}

  @Get('training-terms')
  @Permissions('training.read')
  list(@Query() query: TrainingTermListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('training-terms')
  @Permissions('training.manage')
  create(@Body() dto: CreateTrainingTermDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('training-terms/:termId')
  @Permissions('training.manage')
  update(
    @Param('termId', new ParseUUIDPipe()) termId: string,
    @Body() dto: UpdateTrainingTermDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(termId, dto, actor);
  }
}
