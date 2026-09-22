import { HttpStatus, Injectable } from '@nestjs/common';
import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { EnrollmentsRepository } from './enrollments.repository';
import { CourseListQuery, CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CourseRow, CoursesRepository } from './courses.repository';

const notFound = (): AppError =>
  new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');

const badRequest = (message: string): AppError =>
  new AppError(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST, message);

const resourceInUse = (message: string): AppError =>
  new AppError(HttpStatus.CONFLICT, ErrorCode.RESOURCE_IN_USE, message);

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

const SORT_ALLOWED = new Set(['code', 'createdAt']);

function validateSort(sort: string | undefined): void {
  if (!sort) return;
  for (const part of sort.split(',')) {
    const field = part.startsWith('-') ? part.slice(1) : part;
    if (!SORT_ALLOWED.has(field)) throw badRequest('Unknown sort field');
  }
}

function validateTasks(tasks: { taskId: string }[]): void {
  const seen = new Set<string>();
  for (const task of tasks) {
    if (seen.has(task.taskId)) {
      throw validationFailed('/tasks', 'DUPLICATE_TASK', 'Duplicate taskId in tasks');
    }
    seen.add(task.taskId);
  }
}

function mapCourse(row: CourseRow) {
  return {
    id: row.id,
    organizationScopeId: row.organization_scope_id,
    code: row.code,
    name: { en: row.name_en, ...(row.name_ar ? { ar: row.name_ar } : {}) },
    termId: row.term_id,
    ...(row.description ? { description: row.description } : {}),
    tasks: row.tasks,
    minimumAttendancePercent: row.minimum_attendance_percent,
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
export class CoursesService {
  constructor(
    private readonly repository: CoursesRepository,
    private readonly enrollmentsRepository: EnrollmentsRepository,
    private readonly transaction: TransactionService,
    private readonly scopeService: ScopeService,
  ) {}

  async list(query: CourseListQuery, actor: AuthenticatedPrincipal) {
    validateSort(query.sort);
    const scopes = this.scopeService.allowedScopeIds(actor);
    const studentOnly = !actor.permissions.includes('training.read');
    if (studentOnly && !actor.studentId) return mapPage(query, [], 0);
    const enrolledCourseIds = studentOnly
      ? await this.enrollmentsRepository.findEnrolledCourseIds(actor.studentId!)
      : undefined;
    const result = await this.repository.list(query, scopes, enrolledCourseIds);
    return mapPage(query, result.rows.map(mapCourse), result.totalItems);
  }

  async create(dto: CreateCourseDto, actor: AuthenticatedPrincipal) {
    validateTasks(dto.tasks);
    const scopes = this.scopeService.allowedScopeIds(actor);
    if (!scopes.includes(dto.organizationScopeId)) throw notFound();

    try {
      const course = await this.transaction.runInTransaction(async (client) => {
        if (!(await this.repository.findActiveScope(client, dto.organizationScopeId))) throw notFound();
        const term = await this.repository.findTerm(client, dto.termId);
        if (!term || term.organization_scope_id !== dto.organizationScopeId) throw notFound();
        if (dto.tasks.length > 0) {
          const existing = await this.repository.findExistingActiveTaskIds(
            client,
            dto.tasks.map((t) => t.taskId),
          );
          const missing = dto.tasks.map((t) => t.taskId).filter((id) => !existing.includes(id));
          if (missing.length > 0) throw notFound();
        }
        const created = await this.repository.create(client, {
          organizationScopeId: dto.organizationScopeId,
          code: dto.code,
          nameEn: dto.name.en,
          nameAr: dto.name.ar,
          termId: dto.termId,
          description: dto.description,
          minimumAttendancePercent: dto.minimumAttendancePercent,
          actor: actor.id,
        });
        await this.repository.replaceTasks(client, created.id, dto.tasks);
        return this.repository.findScoped(created.id, scopes, client);
      });
      return mapCourse(course!);
    } catch (error) {
      return mapConstraintError(error);
    }
  }

  async update(courseId: string, dto: UpdateCourseDto, actor: AuthenticatedPrincipal) {
    if (dto.tasks) validateTasks(dto.tasks);
    const scopes = this.scopeService.allowedScopeIds(actor);

    try {
      const course = await this.transaction.runInTransaction(async (client) => {
        const current = await this.repository.findScoped(courseId, scopes, client, true);
        if (!current) throw notFound();

        const changesCompletionRules = dto.tasks !== undefined || dto.minimumAttendancePercent !== undefined;
        if (changesCompletionRules && current.status === 'ACTIVE') {
          if (await this.repository.hasEnrollments(client, courseId)) {
            throw resourceInUse(
              'Cannot change required tasks or completion rules of an active course with enrollments',
            );
          }
        }

        if (dto.tasks && dto.tasks.length > 0) {
          const existing = await this.repository.findExistingActiveTaskIds(
            client,
            dto.tasks.map((t) => t.taskId),
          );
          const missing = dto.tasks.map((t) => t.taskId).filter((id) => !existing.includes(id));
          if (missing.length > 0) throw notFound();
        }
        if (dto.tasks) await this.repository.replaceTasks(client, courseId, dto.tasks);

        const values: Record<string, unknown> = {};
        if (dto.name?.en !== undefined) values.name_en = dto.name.en;
        if (dto.name?.ar !== undefined) values.name_ar = dto.name.ar;
        if (dto.description !== undefined) values.description = dto.description;
        if (dto.minimumAttendancePercent !== undefined) values.minimum_attendance_percent = dto.minimumAttendancePercent;
        if (dto.status !== undefined) values.status = dto.status;

        const updated = await this.repository.update(client, courseId, values, actor.id);
        if (!updated) throw notFound();
        return updated;
      });
      return mapCourse(course);
    } catch (error) {
      return mapConstraintError(error);
    }
  }
}
