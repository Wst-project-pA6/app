import { HttpStatus, Injectable } from '@nestjs/common';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CreateStudentDto, StudentListQuery, UpdateStudentDto } from './dto/student.dto';
import { StudentRow, StudentsRepository } from './students.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const validationFailed = (field: string, code: string, message: string): AppError =>
  new AppError(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.VALIDATION_FAILED, 'Validation failed', [
    { field, code, message },
  ]);

function mapConstraintError(error: unknown): never {
  if (error instanceof AppError) throw error;
  if ((error as { code?: string })?.code === '23505') {
    throw new AppError(HttpStatus.CONFLICT, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource');
  }
  throw error;
}

const SORT_ALLOWED = new Set(['studentNumber', 'displayName']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function mapStudent(row: StudentRow) {
  return {
    id: row.id,
    userId: row.user_id,
    studentNumber: row.student_number,
    displayName: row.display_name,
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
export class StudentsService {
  constructor(
    private readonly repository: StudentsRepository,
    private readonly transaction: TransactionService,
  ) {}

  async list(query: StudentListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const mentorOnly = actor.roles.includes('MENTOR');
    const result = await this.repository.list(query, mentorOnly ? { mentorUserId: actor.id } : {});
    return mapPage(query, result.rows.map(mapStudent), result.totalItems);
  }

  async get(studentId: string, actor: AuthenticatedPrincipal) {
    if (!actor.permissions.includes('training.read') && actor.studentId !== studentId) throw notFound();
    const student = await this.repository.findById(studentId);
    if (!student) throw notFound();
    return mapStudent(student);
  }

  async create(dto: CreateStudentDto, actor: AuthenticatedPrincipal) {
    try {
      const student = await this.transaction.runInTransaction(async (client) => {
        const eligible = await this.repository.findEligibleUser(client, dto.userId);
        if (!eligible) {
          throw validationFailed('/userId', 'USER_NOT_ELIGIBLE', 'User must hold the STUDENT role');
        }
        return this.repository.create(client, {
          userId: dto.userId,
          studentNumber: dto.studentNumber,
          actor: actor.id,
        });
      });
      return mapStudent(student);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(studentId: string, dto: UpdateStudentDto, actor: AuthenticatedPrincipal) {
    try {
      const student = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findById(studentId, client, true);
        if (!current) throw notFound();
        const values: Record<string, unknown> = {};
        if (dto.studentNumber !== undefined) values.student_number = dto.studentNumber;
        if (dto.status !== undefined) values.status = dto.status;
        return this.repository.update(client, studentId, values, actor.id);
      });
      if (!student) throw notFound();
      return mapStudent(student);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
