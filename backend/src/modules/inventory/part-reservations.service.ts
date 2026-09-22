import { HttpStatus, Injectable } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { JobsRepository } from '../jobs/jobs.repository';
import { PartStatus } from './dto/part.dto';
import {
  PartReservationCreateRequest,
  PartReservationListQuery,
  PartReservationStatus,
} from './dto/part-reservation.dto';
import { StockMovementType } from './dto/stock-balance.dto';
import { StoreStatus } from './dto/store.dto';
import { PartsRepository } from './parts.repository';
import {
  PartReservationRow,
  PartReservationsRepository,
} from './part-reservations.repository';
import { StoresRepository } from './stores.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const jobStageNotAllowed = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.JOB_STAGE_NOT_ALLOWED, message);

const insufficientStock = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INSUFFICIENT_STOCK, message);

const reservationInvalid = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESERVATION_INVALID, message);

function validateSort(sort: string | undefined, allowedFields: Set<string>): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowedFields.has(field)) {
      throw badRequest('Unknown sort field');
    }
  }
}

function mapReservation(row: PartReservationRow) {
  return {
    id: row.id,
    jobId: row.job_id,
    partId: row.part_id,
    storeId: row.store_id,
    quantity: Number(row.quantity),
    consumedQuantity: Number(row.consumed_quantity),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapPage<T>(query: { page: number; pageSize: number }, items: T[], totalItems: number) {
  return {
    items,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) {
    throw error;
  }
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23514' && dbError.constraint === 'chk_reserved_lte_on_hand') {
    throw insufficientStock('Insufficient stock available');
  }
  if (dbError?.code === '23514' && dbError.constraint === 'chk_consumed_lte_quantity') {
    throw reservationInvalid('Consumed quantity exceeds reservation quantity');
  }
  throw error;
}

const RESERVATION_SORT_ALLOWED = new Set(['createdAt']);

@Injectable()
export class PartReservationsService {
  constructor(
    private readonly repository: PartReservationsRepository,
    private readonly jobsRepository: JobsRepository,
    private readonly storesRepository: StoresRepository,
    private readonly partsRepository: PartsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
    private readonly audit: AuditService,
  ) {}

  async list(
    jobId: string,
    query: PartReservationListQuery,
    actor: AuthenticatedPrincipal,
  ) {
    validateSort(query.sort, RESERVATION_SORT_ALLOWED);
    const scopes = this.scopeService.allowedScopeIds(actor);

    const job = await this.jobsRepository.findScoped(jobId, scopes);
    if (!job) {
      throw notFound();
    }

    const result = await this.repository.listByJobId(jobId, query);
    return mapPage(query, result.rows.map(mapReservation), result.totalItems);
  }

  async reserve(
    jobId: string,
    dto: PartReservationCreateRequest,
    actor: AuthenticatedPrincipal,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    try {
      const reservation = await this.transaction.runInTransaction(async (client) => {
        // 1. Lock and validate the job first
        const job = await this.jobsRepository.findScoped(jobId, scopes, client, true);
        if (!job) {
          throw notFound();
        }

        // 2. Job must be RECEIVED or IN_PROGRESS
        if (job.stage !== 'RECEIVED' && job.stage !== 'IN_PROGRESS') {
          throw jobStageNotAllowed('Job stage does not allow reservations');
        }

        // 3. No customer approval is required because reservation is not billable

        // 4. Validate active store in caller's active scope
        const store = await this.storesRepository.findScoped(dto.storeId, scopes, client, true);
        if (!store || store.status !== StoreStatus.ACTIVE) {
          throw notFound();
        }

        // 5. Validate active part
        const part = await this.partsRepository.findById(client, dto.partId, true);
        if (!part || part.status !== PartStatus.ACTIVE) {
          throw notFound();
        }

        // 6. Lock the stock balance FOR UPDATE
        const balance = await this.repository.lockBalance(client, dto.storeId, dto.partId);
        if (!balance) {
          throw insufficientStock('Insufficient stock available');
        }

        // 7. Calculate available exactly as on_hand - reserved
        const available = Number(balance.on_hand) - Number(balance.reserved);

        // 8. Reject quantity above available with 409 INSUFFICIENT_STOCK
        if (dto.quantity > available) {
          throw insufficientStock('Insufficient stock available');
        }

        // 9. Insert ACTIVE part_reservations row
        const createdReservation = await this.repository.createReservation(client, {
          jobId,
          partId: dto.partId,
          storeId: dto.storeId,
          quantity: dto.quantity,
          actorId: actor.id,
        });

        // 10. Increase stock_balances.reserved only; never alter on_hand
        const updatedBalance = await this.repository.updateBalanceReserved(
          client,
          dto.storeId,
          dto.partId,
          dto.quantity,
        );

        // 11. Append immutable RESERVATION stock movement
        await this.repository.createMovement(client, {
          storeId: dto.storeId,
          partId: dto.partId,
          type: StockMovementType.RESERVATION,
          onHandDelta: 0,
          reservedDelta: dto.quantity,
          onHandAfter: Number(updatedBalance.on_hand),
          reservedAfter: Number(updatedBalance.reserved),
          jobId,
          actorId: actor.id,
          reason: `Reserved for job ${job.job_number}`,
        });

        // 12. Write audit event
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART_RESERVATION.CREATE',
          entityType: 'PART_RESERVATION',
          entityId: createdReservation.id,
          outcome: 'SUCCESS',
          summary: `Reserved ${dto.quantity} of part ${dto.partId} for job ${job.job_number}`,
        });

        // 13. Commit everything atomically
        return createdReservation;
      });

      return mapReservation(reservation);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async release(
    jobId: string,
    reservationId: string,
    actor: AuthenticatedPrincipal,
  ) {
    const scopes = this.scopeService.allowedScopeIds(actor);

    try {
      const reservation = await this.transaction.runInTransaction(async (client) => {
        // 1. Lock job first
        const job = await this.jobsRepository.findScoped(jobId, scopes, client, true);
        if (!job) {
          throw notFound();
        }

        // 2. Lock matching reservation belonging to URL job
        const currentReservation = await this.repository.lockReservation(client, reservationId);
        if (!currentReservation || currentReservation.job_id !== jobId) {
          throw notFound();
        }

        // 3. Lock related balance
        const balance = await this.repository.lockBalance(
          client,
          currentReservation.store_id,
          currentReservation.part_id,
        );
        if (!balance) {
          throw notFound();
        }

        // 4 & 5. Only ACTIVE reservations may be released; FULFILLED or RELEASED returns 409 RESERVATION_INVALID
        if (currentReservation.status !== PartReservationStatus.ACTIVE) {
          throw reservationInvalid('Only active reservations can be released');
        }

        // 6. Remaining quantity = quantity - consumed_quantity
        const remainingQuantity =
          Number(currentReservation.quantity) - Number(currentReservation.consumed_quantity);
        if (remainingQuantity <= 0) {
          throw reservationInvalid('No remaining quantity to release');
        }

        // 7 & 8. Decrease reserved by exactly remaining quantity, never below zero
        const delta = -remainingQuantity;
        const updatedBalance = await this.repository.updateBalanceReserved(
          client,
          currentReservation.store_id,
          currentReservation.part_id,
          delta,
        );

        // 9. Append immutable RESERVATION_RELEASE movement
        await this.repository.createMovement(client, {
          storeId: currentReservation.store_id,
          partId: currentReservation.part_id,
          type: StockMovementType.RESERVATION_RELEASE,
          onHandDelta: 0,
          reservedDelta: delta,
          onHandAfter: Number(updatedBalance.on_hand),
          reservedAfter: Number(updatedBalance.reserved),
          jobId,
          actorId: actor.id,
          reason: `Released reservation for job ${job.job_number}`,
        });

        // 10 & 11. Mark reservation RELEASED, preserving consumed_quantity
        const updatedReservation = await this.repository.updateReservationStatus(
          client,
          reservationId,
          PartReservationStatus.RELEASED,
          actor.id,
        );

        // 12. Write audit and commit atomically
        await this.audit.record(client, {
          actorUserId: actor.id,
          actorRoles: actor.roles,
          action: 'PART_RESERVATION.RELEASE',
          entityType: 'PART_RESERVATION',
          entityId: reservationId,
          outcome: 'SUCCESS',
          summary: `Released reservation ${reservationId} for job ${job.job_number}`,
        });

        return updatedReservation;
      });

      return mapReservation(reservation);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
