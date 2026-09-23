import { Body, Controller, Get, Put } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionSettingsResponse, PredictionSettingsUpdateDto } from './dto/prediction-settings.dto';
import { PredictionSettingsService } from './prediction-settings.service';

@Controller('config/prediction-settings')
export class PredictionSettingsController {
  constructor(private readonly service: PredictionSettingsService) {}

  @Get()
  @Permissions('config.read')
  get(): Promise<PredictionSettingsResponse> {
    return this.service.get();
  }

  @Put()
  @Permissions('config.manage')
  replace(
    @Body() dto: PredictionSettingsUpdateDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ): Promise<PredictionSettingsResponse> {
    return this.service.replace(dto, actor);
  }
}
