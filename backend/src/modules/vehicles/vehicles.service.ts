import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError, ErrorDetail } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  CreateServiceReminderDto,
  CreateVehicleDto,
  ServiceHistoryQuery,
  ServiceReminderListQuery,
  ServiceReminderStatus,
  UpdateServiceReminderDto,
  UpdateVehicleDto,
  VehicleListQuery,
  VehicleStatus,
} from './dto/vehicle.dto';
import {
  NextServiceRow,
  ServiceHistoryRow,
  ServiceReminderRow,
  VehicleRow,
  VehiclesRepository,
} from './vehicles.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const resourceInUse = (): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESOURCE_IN_USE, 'Resource in use');

const invalidStateTransition = (): AppError =>
  new AppError(
    HttpStatus.CONFLICT,
    ErrorCode.INVALID_STATE_TRANSITION,
    'Invalid state transition',
  );

const validationFailed = (field: string, code: string, message: string): AppError => {
  const detail: ErrorDetail = { field, code, message };
  return new AppError(
    HttpStatus.UNPROCESSABLE_ENTITY,
    ErrorCode.VALIDATION_FAILED,
    'Validation failed',
    [detail],
  );
};

function mapConstraintError(error: unknown): never {
  if ((error as { code?: string })?.code === '23505') {
    throw new AppError(
      HttpStatus.CONFLICT,
      ErrorCode.DUPLICATE_RESOURCE,
      'Duplicate resource',
    );
  }
  throw error;
}

function dateOnly(value: string | null): string | undefined {
  return value ?? undefined;
}

function mapVehicle(row: VehicleRow) {
  return {
    id: row.id,
    customerId: row.customer_id,
    plate: row.plate,
    vin: row.vin,
    make: row.make,
    model: row.model,
    year: row.year,
    mileage: row.mileage,
    mileageUnit: row.mileage_unit,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapHistory(row: ServiceHistoryRow) {
  return {
    jobId: row.job_id,
    jobNumber: row.job_number,
    serviceType: row.service_type,
    complaint: row.complaint,
    mileageAtIntake: row.mileage_at_intake,
    deliveredAt: row.delivered_at,
  };
}

function mapNextService(row: NextServiceRow) {
  return {
    ...(row.due_date !== null ? { dueDate: dateOnly(row.due_date) } : {}),
    ...(row.due_mileage !== null ? { dueMileage: row.due_mileage } : {}),
    reminderId: row.reminder_id,
  };
}

function mapReminder(row: ServiceReminderRow) {
  return {
    id: row.id,
    vehicleId: row.vehicle_id,
    title: row.title,
    ...(row.due_date !== null ? { dueDate: dateOnly(row.due_date) } : {}),
    ...(row.due_mileage !== null ? { dueMileage: row.due_mileage } : {}),
    status: row.status,
    ...(row.completed_at ? { completedAt: row.completed_at } : {}),
    ...(row.notes !== null ? { notes: row.notes } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function validateSort(sort: string | undefined, fields: string[]): void {
  if (!sort) return;
  const allowed = new Set(fields);
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!allowed.has(field)) {
      throw new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, 'Unknown sort field');
    }
  }
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly repository: VehiclesRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: VehicleListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort, ['plate', 'make', 'createdAt']);
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    if (query.customerId && !(await this.repository.findAccessibleCustomer(
      undefined,
      query.customerId,
      scopeIds,
    ))) {
      throw notFound();
    }
    const result = await this.repository.list(query, scopeIds);
    return {
      items: result.rows.map(mapVehicle),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async create(dto: CreateVehicleDto, actor: AuthenticatedPrincipal) {
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    try {
      const vehicle = await this.transaction.runInTransaction(async (client) => {
        if (!(await this.repository.findAccessibleCustomer(client, dto.customerId, scopeIds, true))) {
          throw notFound();
        }
        return this.repository.create(client, {
          customerId: dto.customerId,
          plate: dto.plate,
          vin: dto.vin,
          make: dto.make,
          model: dto.model,
          year: dto.year,
          mileage: dto.mileage,
          mileageUnit: dto.mileageUnit,
          actor: actor.id,
        });
      });
      return mapVehicle(vehicle);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async get(vehicleId: string, actor: AuthenticatedPrincipal) {
    const vehicle = await this.repository.findScoped(
      vehicleId,
      this.scopeService.allowedScopeIds(actor),
    );
    if (!vehicle) throw notFound();

    const [lastCompletedJob, nextService] = await Promise.all([
      this.repository.findLastCompletedJob(vehicle.id),
      this.repository.findNextService(vehicle.id),
    ]);
    return {
      ...mapVehicle(vehicle),
      ...(lastCompletedJob ? { lastCompletedJob: mapHistory(lastCompletedJob) } : {}),
      ...(nextService ? { nextService: mapNextService(nextService) } : {}),
    };
  }

  async update(
    vehicleId: string,
    dto: UpdateVehicleDto,
    actor: AuthenticatedPrincipal,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw validationFailed('/', 'REQUIRED', 'At least one property is required');
    }

    const scopeIds = this.scopeService.allowedScopeIds(actor);
    try {
      const vehicle = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(vehicleId, scopeIds, client, true);
        if (!current) throw notFound();

        if (dto.mileage !== undefined && dto.mileage < current.mileage) {
          throw validationFailed(
            '/mileage',
            'MILEAGE_LOWER_THAN_RECORDED',
            'Mileage may only increase',
          );
        }
        if (dto.status === VehicleStatus.ARCHIVED && current.status !== VehicleStatus.ARCHIVED) {
          if ((await this.repository.countNonDeliveredJobs(client, vehicleId)) > 0) {
            throw resourceInUse();
          }
        }

        const values: Record<string, unknown> = {};
        if (dto.plate !== undefined) values.plate = dto.plate;
        if (dto.mileage !== undefined) values.mileage = dto.mileage;
        if (dto.status !== undefined) values.status = dto.status;
        const updated = await this.repository.update(client, vehicleId, values, actor.id);
        if (!updated) throw notFound();
        return updated;
      });
      return mapVehicle(vehicle);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async listHistory(
    vehicleId: string,
    query: ServiceHistoryQuery,
    actor: AuthenticatedPrincipal,
  ) {
    validateSort(query.sort, ['deliveredAt']);
    const vehicle = await this.repository.findScoped(
      vehicleId,
      this.scopeService.allowedScopeIds(actor),
    );
    if (!vehicle) throw notFound();
    const result = await this.repository.listHistory(vehicleId, query);
    return {
      items: result.rows.map(mapHistory),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async listReminders(
    vehicleId: string,
    query: ServiceReminderListQuery,
    actor: AuthenticatedPrincipal,
  ) {
    validateSort(query.sort, ['dueDate', 'createdAt']);
    const vehicle = await this.repository.findScoped(
      vehicleId,
      this.scopeService.allowedScopeIds(actor),
    );
    if (!vehicle) throw notFound();
    const result = await this.repository.listReminders(vehicleId, query);
    return {
      items: result.rows.map(mapReminder),
      page: {
        page: query.page,
        pageSize: query.pageSize,
        totalItems: result.totalItems,
        totalPages: Math.ceil(result.totalItems / query.pageSize),
      },
    };
  }

  async createReminder(
    vehicleId: string,
    dto: CreateServiceReminderDto,
    actor: AuthenticatedPrincipal,
  ) {
    const scopeIds = this.scopeService.allowedScopeIds(actor);
    try {
      const reminder = await this.transaction.runInTransaction(async (client) => {
        const vehicle = await this.repository.findScoped(vehicleId, scopeIds, client, true);
        if (!vehicle) throw notFound();
        if (dto.dueDate === undefined && dto.dueMileage === undefined) {
          throw validationFailed(
            '/',
            'REMINDER_TRIGGER_REQUIRED',
            'At least one of dueDate or dueMileage is required',
          );
        }
        return this.repository.createReminder(client, {
          vehicleId,
          title: dto.title,
          dueDate: dto.dueDate ?? null,
          dueMileage: dto.dueMileage ?? null,
          notes: dto.notes ?? null,
          actor: actor.id,
        });
      });
      return mapReminder(reminder);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async updateReminder(
    reminderId: string,
    dto: UpdateServiceReminderDto,
    actor: AuthenticatedPrincipal,
  ) {
    if (!Object.values(dto).some((value) => value !== undefined)) {
      throw validationFailed('/', 'REQUIRED', 'At least one property is required');
    }

    const scopeIds = this.scopeService.allowedScopeIds(actor);
    const reminder = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScopedReminder(reminderId, scopeIds, client, true);
      if (!current) throw notFound();
      if (
        dto.status !== undefined &&
        current.status !== ServiceReminderStatus.OPEN &&
        dto.status !== current.status
      ) {
        throw invalidStateTransition();
      }

      const values: Record<string, unknown> = {};
      if (dto.title !== undefined) values.title = dto.title;
      if (dto.dueDate !== undefined) values.due_date = dto.dueDate;
      if (dto.dueMileage !== undefined) values.due_mileage = dto.dueMileage;
      if (dto.notes !== undefined) values.notes = dto.notes;
      if (dto.status !== undefined) {
        values.status = dto.status;
        values.completed_at = new Date();
      }
      const updated = await this.repository.updateReminder(client, reminderId, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapReminder(reminder);
  }
}
