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
  PartReservationCreateRequest,
  PartReservationListQuery,
} from './dto/part-reservation.dto';
import { PartReservationsService } from './part-reservations.service';

@Controller()
export class PartReservationsController {
  constructor(private readonly service: PartReservationsService) {}

  @Get('job-cards/:jobId/part-reservations')
  @Permissions('inventory.read', 'inventory.issue')
  list(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Query() query: PartReservationListQuery,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.list(jobId, query, actor);
  }

  @Post('job-cards/:jobId/part-reservations')
  @Permissions('inventory.issue')
  reserve(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Body() dto: PartReservationCreateRequest,
    @CurrentUser() actor: AuthenticatedPrincipal,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    // Validate optional client idempotency header format (8-128 chars).
    // Note: Session 21 replay/caching system is cross-cutting; the current database schema
    // has no idempotency_key column on part_reservations, so persistence is not invented here.
    if (idempotencyKey !== undefined && (idempotencyKey.length < 8 || idempotencyKey.length > 128)) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, 'Invalid Idempotency-Key header length');
    }
    return this.service.reserve(jobId, dto, actor);
  }

  @Post('job-cards/:jobId/part-reservations/:reservationId/release')
  @HttpCode(HttpStatus.OK)
  @Permissions('inventory.issue')
  release(
    @Param('jobId', new ParseUUIDPipe()) jobId: string,
    @Param('reservationId', new ParseUUIDPipe()) reservationId: string,
    @CurrentUser() actor: AuthenticatedPrincipal,
  ) {
    return this.service.release(jobId, reservationId, actor);
  }
}
