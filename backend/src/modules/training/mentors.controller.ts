import { Controller, Get, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { MentorListQuery } from './dto/mentor.dto';
import { MentorsService } from './mentors.service';

@Controller()
export class MentorsController {
  constructor(private readonly service: MentorsService) {}

  @Get('mentors')
  @Permissions('training.read')
  list(@Query() query: MentorListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }
}
