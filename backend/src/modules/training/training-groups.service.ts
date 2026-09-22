import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateTrainingGroupDto, TrainingGroupListQuery, UpdateTrainingGroupDto } from './dto/training-group.dto';
import { TrainingGroupRow, TrainingGroupsRepository } from './training-groups.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

const SORT_ALLOWED = new Set(['name', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function mapGroup(row: TrainingGroupRow) {
  return {
    id: row.id,
    name: row.name,
    courseId: row.course_id,
    status: row.status,
    enrolledCount: row.enrolled_count,
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
export class TrainingGroupsService {
  constructor(
    private readonly repository: TrainingGroupsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: TrainingGroupListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query, this.scopeService.allowedScopeIds(actor));
    return mapPage(query, result.rows.map(mapGroup), result.totalItems);
  }

  async create(dto: CreateTrainingGroupDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const group = await this.transaction.runInTransaction(async (client) => {
      const course = await this.repository.findAccessibleCourse(client, dto.courseId, scopes);
      if (!course) throw notFound();
      if (course.status === 'ARCHIVED') {
        throw validationFailed('/courseId', 'COURSE_ARCHIVED', 'Cannot create a group for an archived course');
      }
      return this.repository.create(client, { name: dto.name, courseId: dto.courseId, actor: actor.id });
    });
    return mapGroup(group);
  }

  async update(groupId: string, dto: UpdateTrainingGroupDto, actor: AuthenticatedPrincipal) {
    const scopes = this.scopeService.allowedScopeIds(actor);
    const group = await this.transaction.runInTransaction(async (client) => {
      const current = await this.repository.findScoped(groupId, scopes, client, true);
      if (!current) throw notFound();
      const values: Record<string, unknown> = {};
      if (dto.name !== undefined) values.name = dto.name;
      if (dto.status !== undefined) values.status = dto.status;
      const updated = await this.repository.update(client, groupId, values, actor.id);
      if (!updated) throw notFound();
      return updated;
    });
    return mapGroup(group);
  }
}
