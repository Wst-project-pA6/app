import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  BayCalendarQuery,
  BayListQuery,
  CreateBayDto,
  UpdateBayDto,
} from './dto/bay.dto';
import { BayRow, BaysRepository } from './bays.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (field !== 'code' && field !== 'name') throw badRequest('Unknown sort field');
  }
}

function mapBay(row: BayRow) {
  return {
    id: row.id,
    organizationScopeId: row.organization_scope_id,
    code: row.code,
    name: row.name,
    capacity: row.capacity,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.created_by ? { createdBy: row.created_by } : {}),
    ...(row.updated_by ? { updatedBy: row.updated_by } : {}),
  };
}

function mapPage<T>(query: { page: number; pageSize: number }, rows: T[], totalItems: number) {
  return {
    items: rows,
    page: {
      page: query.page,
      pageSize: query.pageSize,
      totalItems,
      totalPages: Math.ceil(totalItems / query.pageSize),
    },
  };
}

function mapConstraintError(error: unknown): never {
  const databaseError = error as { code?: string; constraint?: string };
  if (databaseError?.code === '23505' && databaseError.constraint === 'uq_bay_code') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

@Injectable()
export class BaysService {
  constructor(
    private readonly repository: BaysRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: BayListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query, this.scopeService.allowedScopeIds(actor));
    return mapPage(query, result.rows.map(mapBay), result.totalItems);
  }

  async create(dto: CreateBayDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    if (!scopes.includes(dto.organizationScopeId)) throw notFound();
    try {
      const bay = await this.transaction.runInTransaction(async (client) => {
        if (!(await this.repository.findActiveScope(client, dto.organizationScopeId))) throw notFound();
        return this.repository.create(client, {
          organizationScopeId: dto.organizationScopeId,
          code: dto.code,
          name: dto.name,
          capacity: dto.capacity,
          actor: actor.id,
        });
      });
      return mapBay(bay);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(bayId: string, dto: UpdateBayDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const bay = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(bayId, scopes, client, true);
      if (!current) throw notFound();
      const values: Record<string, unknown> = {};
      if (dto.name !== undefined) values.name = dto.name;
      if (dto.capacity !== undefined) values.capacity = dto.capacity;
      if (dto.status !== undefined) values.status = dto.status;
      if (Object.keys(values).length === 0) throw badRequest('At least one property is required');
      const updated = await this.repository.update(client, bayId, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapBay(bay);
  }

  async calendar(bayId: string, query: BayCalendarQuery, actor: AuthenticatedPrincipal) {
    const from = Date.parse(query.from);
    const to = Date.parse(query.to);
    if (!Number.isFinite(from) || !Number.isFinite(to) || from >= to) {
      throw badRequest('Calendar from must be before to');
    }
    if (to - from > 31 * 24 * 60 * 60 * 1000) {
      throw badRequest('Calendar window cannot exceed 31 days');
    }
    const bay = await this.repository.findScoped(
      bayId,
      this.scopeService.allowedScopeIds(actor),
    );
    if (!bay) throw notFound();
    const entries = await this.repository.calendar(bayId, query);
    return {
      bayId,
      from: query.from,
      to: query.to,
      entries: entries.map((entry) => ({
        kind: entry.kind,
        referenceId: entry.reference_id,
        referenceLabel: entry.reference_label,
        startsAt: entry.starts_at,
        endsAt: entry.ends_at,
      })),
    };
  }
}
