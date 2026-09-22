import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateTrainingTermDto, TrainingTermListQuery, UpdateTrainingTermDto } from './dto/training-term.dto';
import { TrainingTermRow, TrainingTermsRepository } from './training-terms.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const invalidStateTransition = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.INVALID_STATE_TRANSITION, message);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

const SORT_ALLOWED = new Set(['startDate', 'name']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function mapTerm(row: TrainingTermRow) {
  return {
    id: row.id,
    organizationScopeId: row.organization_scope_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
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

@Injectable()
export class TrainingTermsService {
  constructor(
    private readonly repository: TrainingTermsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: TrainingTermListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query, this.scopeService.allowedScopeIds(actor));
    return mapPage(query, result.rows.map(mapTerm), result.totalItems);
  }

  async create(dto: CreateTrainingTermDto, actor: AuthenticatedPrincipal) {
    if (dto.startDate >= dto.endDate) {
      throw validationFailed('/endDate', 'DATE_RANGE_INVALID', 'endDate must be after startDate');
    }
    const scopes = this.scopeService.allowedScopeIds(actor);
    if (!scopes.includes(dto.organizationScopeId)) throw notFound();

    const term = await this.transaction.runInTransaction(async (client) => {
      if (!(await this.repository.findActiveScope(client, dto.organizationScopeId))) throw notFound();
      return this.repository.create(client, {
        organizationScopeId: dto.organizationScopeId,
        name: dto.name,
        startDate: dto.startDate,
        endDate: dto.endDate,
        actor: actor.id,
      });
    });
    return mapTerm(term);
  }

  async update(termId: string, dto: UpdateTrainingTermDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const term = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(termId, scopes, client, true);
      if (!current) throw notFound();
      if (current.status === 'CLOSED') throw invalidStateTransition('Closed training terms are read-only');

      const nextStart = dto.startDate ?? current.start_date;
      const nextEnd = dto.endDate ?? current.end_date;
      if (nextStart >= nextEnd) {
        throw validationFailed('/endDate', 'DATE_RANGE_INVALID', 'endDate must be after startDate');
      }

      const values: Record<string, unknown> = {};
      if (dto.name !== undefined) values.name = dto.name;
      if (dto.startDate !== undefined) values.start_date = dto.startDate;
      if (dto.endDate !== undefined) values.end_date = dto.endDate;
      if (dto.status !== undefined) values.status = dto.status;

      const updated = await this.repository.update(client, termId, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapTerm(term);
  }
}
