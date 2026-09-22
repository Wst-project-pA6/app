import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { MentorListQuery } from './dto/mentor.dto';
import { MentorRow, MentorsRepository } from './mentors.repository';

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (field !== 'displayName') throw badRequest('Unknown sort field');
  }
}

function mapMentor(row: MentorRow) {
  return { id: row.id, displayName: row.display_name };
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
export class MentorsService {
  constructor(
    private readonly repository: MentorsRepository,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: MentorListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const result = await this.repository.list(query, this.scopeService.allowedScopeIds(actor));
    return mapPage(query, result.rows.map(mapMentor), result.totalItems);
  }
}
