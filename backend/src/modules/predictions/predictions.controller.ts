import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionDecisionRequestDto, PredictionListQuery } from './dto/prediction.dto';
import { PredictionsService } from './predictions.service';

@Controller('predictions')
export class PredictionsController {
  constructor(private readonly service: PredictionsService) {}

  @Get()
  @Permissions('predictions.reorder.read', 'predictions.risk.read')
  list(@Query() query: PredictionListQuery, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.list(query, actor);
  }

  @Get(':predictionId')
  @Permissions('predictions.reorder.read', 'predictions.risk.read')
  get(@Param('predictionId', new ParseUUIDPipe()) predictionId: string, @CurrentUser() actor: AuthenticatedPrincipal) {
    return this.service.get(predictionId, actor);
  }

  @Post(':predictionId/decisions')
  @Permissions('predictions.reorder.decide', 'predictions.risk.decide')
  @HttpCode(HttpStatus.OK)
  decide(
    @Param('predictionId', new ParseUUIDPipe()) predictionId: string,
    @Body() dto: PredictionDecisionRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.decide(predictionId, dto, actor);
  }
}
