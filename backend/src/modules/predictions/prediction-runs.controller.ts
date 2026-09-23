import { Body, Controller, HttpCode, HttpStatus, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { Permissions } from '../../common/auth/permissions.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PredictionRunRequestDto } from './dto/prediction.dto';
import { PredictionRunRateLimiter } from './prediction-run-rate-limiter';
import { PredictionRunsService } from './prediction-runs.service';

@Controller('prediction-runs')
export class PredictionRunsController {
  constructor(
    private readonly service: PredictionRunsService,
    private readonly rateLimiter: PredictionRunRateLimiter,
  ) {}

  @Post()
  @Permissions('predictions.reorder.decide', 'predictions.risk.decide')
  @HttpCode(HttpStatus.CREATED)
  run(
    @Body() dto: PredictionRunRequestDto,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Res({ passthrough: true }) response: Response,
  ) {
    const result = this.rateLimiter.consumeRun(actor.id);
    if (!result.allowed) {
      response.setHeader('Retry-After', String(result.retryAfterSeconds));
      throw new AppError(HttpStatus.TOO_MANY_REQUESTS, ErrorCode.RATE_LIMITED, 'Too many prediction run requests');
    }
    return this.service.run(dto, actor);
  }
}
