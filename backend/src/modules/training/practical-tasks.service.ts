import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreatePracticalTaskDto, PracticalTaskListQuery, UpdatePracticalTaskDto } from './dto/practical-task.dto';
import { PracticalTaskRow, PracticalTasksRepository } from './practical-tasks.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && dbError.constraint === 'uq_task_code') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

const SORT_ALLOWED = new Set(['code', 'title', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function mapTask(row: PracticalTaskRow) {
  return {
    id: row.id,
    code: row.code,
    title: { en: row.title_en, ...(row.title_ar ? { ar: row.title_ar } : {}) },
    ...(row.description ? { description: row.description } : {}),
    competencyId: row.competency_id,
    expectedMinutes: row.expected_minutes,
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
export class PracticalTasksService {
  constructor(
    private readonly repository: PracticalTasksRepository,
    private readonly transaction: TransactionService,
  ) {}

  async list(query: PracticalTaskListQuery, _actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query);
    return mapPage(query, result.rows.map(mapTask), result.totalItems);
  }

  async create(dto: CreatePracticalTaskDto, actor: AuthenticatedPrincipal) {
    try {
      const task = await this.transaction.runInTransaction(async (client) => {
        const competency = await this.repository.findCompetency(client, dto.competencyId);
        if (!competency) throw notFound();
        return this.repository.create(client, {
          code: dto.code,
          titleEn: dto.title.en,
          titleAr: dto.title.ar,
          description: dto.description,
          competencyId: dto.competencyId,
          expectedMinutes: dto.expectedMinutes,
          actor: actor.id,
        });
      });
      return mapTask(task);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(taskId: string, dto: UpdatePracticalTaskDto, actor: AuthenticatedPrincipal) {
    try {
      const task = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findById(taskId, client, true);
        if (!current) throw notFound();
        if (dto.competencyId !== undefined) {
          const competency = await this.repository.findCompetency(client, dto.competencyId);
          if (!competency) throw notFound();
        }

        const values: Record<string, unknown> = {};
        if (dto.title?.en !== undefined) values.title_en = dto.title.en;
        if (dto.title?.ar !== undefined) values.title_ar = dto.title.ar;
        if (dto.description !== undefined) values.description = dto.description;
        if (dto.competencyId !== undefined) values.competency_id = dto.competencyId;
        if (dto.expectedMinutes !== undefined) values.expected_minutes = dto.expectedMinutes;
        if (dto.status !== undefined) values.status = dto.status;
        if (Object.keys(values).length === 0) throw badRequest('At least one property is required');

        const updated = await this.repository.update(client, taskId, values, actor.id);
        if (!updated) throw notFound();
        return updated;
      });
      return mapTask(task);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
