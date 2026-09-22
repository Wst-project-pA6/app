import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { Permissions } from '../../common/auth/permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CurrentUser } from '../auth/current-user.decorator';
import {
  StockAdjustmentCreateRequest,
  StockAdjustmentDecisionRequest,
  StockAdjustmentListQuery,
} from './dto/stock-adjustment.dto';
import { StockAdjustmentsService } from './stock-adjustments.service';

function validateIdempotencyKey(idempotencyKey?: string): void {
  if (
    idempotencyKey !== undefined &&
    (idempotencyKey.length < 8 || idempotencyKey.length > 128)
  ) {
    throw new AppError(
      HttpStatus.BAD_REQUEST,
      ErrorCode.BAD_REQUEST,
      'Invalid Idempotency-Key header length',
    );
  }
}

@Controller()
export class StockAdjustmentsController {
  constructor(private readonly service: StockAdjustmentsService) {}

  @Get('stock-adjustments')
  @Permissions('inventory.adjust', 'inventory.adjust.approve', 'inventory.read')
  list(
    @Query() query: StockAdjustmentListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(query, actor);
  }

  @Post('stock-adjustments')
  @HttpCode(HttpStatus.CREATED)
  @Permissions('inventory.adjust')
  create(
    @Body() dto: StockAdjustmentCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    validateIdempotencyKey(idempotencyKey);
    return this.service.create(dto, actor, idempotencyKey);
  }

  @Post('stock-adjustments/:adjustmentId/decision')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory.adjust.approve')
  decide(
    @Param('adjustmentId', new ParseUUIDPipe()) adjustmentId: string,
    @Body() dto: StockAdjustmentDecisionRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.decide(adjustmentId, dto, actor);
  }
}
