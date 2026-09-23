import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CompetencyListQuery, CreateCompetencyDto, UpdateCompetencyDto } from './dto/competency.dto';
import { CompetenciesService } from './competencies.service';

@Controller()
export class CompetenciesController {
  constructor(private readonly service: CompetenciesService) {}

  @Get('competencies')
  @Permissions('training.read')
  list(@Query() query: CompetencyListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Post('competencies')
  @Permissions('training.manage')
  create(@Body() dto: CreateCompetencyDto, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.create(dto, actor);
  }

  @Patch('competencies/:competencyId')
  @Permissions('training.manage')
  update(
    @Param('competencyId', new ParseUUIDPipe()) competencyId: string,
    @Body() dto: UpdateCompetencyDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.update(competencyId, dto, actor);
  }
}
