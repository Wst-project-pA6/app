import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CompetencyListQuery, CreateCompetencyDto, UpdateCompetencyDto } from './dto/competency.dto';
import { CompetenciesRepository, CompetencyRow } from './competencies.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  const dbError = error as { code?: string; constraint?: string };
  if (dbError?.code === '23505' && dbError.constraint === 'uq_competency_code') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

const SORT_ALLOWED = new Set(['code', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function mapCompetency(row: CompetencyRow) {
  return {
    id: row.id,
    code: row.code,
    name: { en: row.name_en, ...(row.name_ar ? { ar: row.name_ar } : {}) },
    ...(row.description ? { description: row.description } : {}),
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
export class CompetenciesService {
  constructor(
    private readonly repository: CompetenciesRepository,
    private readonly transaction: TransactionService,
  ) {}

  async list(query: CompetencyListQuery, _actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query);
    return mapPage(query, result.rows.map(mapCompetency), result.totalItems);
  }

  async create(dto: CreateCompetencyDto, actor: AuthenticatedPrincipal) {
    try {
      const competency = await this.transaction.runInTransaction((client) => this.repository.create(client, {
        code: dto.code,
        nameEn: dto.name.en,
        nameAr: dto.name.ar,
        description: dto.description,
        actor: actor.id,
      }));
      return mapCompetency(competency);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(competencyId: string, dto: UpdateCompetencyDto, actor: AuthenticatedPrincipal) {
    try {
      const competency = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findById(competencyId, client, true);
        if (!current) throw notFound();

        const values: Record<string, unknown> = {};
        if (dto.name?.en !== undefined) values.name_en = dto.name.en;
        if (dto.name?.ar !== undefined) values.name_ar = dto.name.ar;
        if (dto.description !== undefined) values.description = dto.description;
        if (dto.status !== undefined) values.status = dto.status;
        if (Object.keys(values).length === 0) throw badRequest('At least one property is required');

        const updated = await this.repository.update(client, competencyId, values, actor.id);
        if (!updated) throw notFound();
        return updated;
      });
      return mapCompetency(competency);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
