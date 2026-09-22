import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { TrainingGroupRow, TrainingGroupsRepository } from './training-groups.repository';
import { TrainingGroupsService } from './training-groups.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const groupId = '11111111-1111-4111-8111-111111111111';
const courseId = '33333333-3333-4333-8333-333333333333';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const row: TrainingGroupRow = {
  id: groupId, name: 'Cohort A', course_id: courseId, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id, enrolled_count: 0,
};

const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

describe('TrainingGroupsService', () => {
  it('lists scoped groups and maps enrolledCount', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [{ ...row, enrolled_count: 3 }], totalItems: 1 });
    const repository = { list } as unknown as TrainingGroupsRepository;
    const service = new TrainingGroupsService(repository, transaction(), new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: groupId, enrolledCount: 3 }],
    });
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId]);
  });

  it('rejects an unallowlisted sort', async () => {
    const repository = { list: jest.fn() } as unknown as TrainingGroupsRepository;
    const service = new TrainingGroupsService(repository, transaction(), new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
  });

  it('creates a group for an accessible, non-archived course', async () => {
    const create = jest.fn().mockResolvedValue(row);
    const repository = {
      findAccessibleCourse: jest.fn().mockResolvedValue({ organization_scope_id: scopeId, status: 'ACTIVE' }),
      create,
    } as unknown as TrainingGroupsRepository;
    const service = new TrainingGroupsService(repository, transaction(), new ScopeService());
    await expect(service.create({ name: 'Cohort A', courseId }, actor)).resolves.toMatchObject({ id: groupId });
    expect(create).toHaveBeenCalledWith(expect.anything(), { name: 'Cohort A', courseId, actor: actor.id });
  });

  it('conceals an inaccessible course as not found and blocks archived courses', async () => {
    const notAccessible = { findAccessibleCourse: jest.fn().mockResolvedValue(null) } as unknown as TrainingGroupsRepository;
    await expect(new TrainingGroupsService(notAccessible, transaction(), new ScopeService()).create({ name: 'X', courseId }, actor))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    const archived = {
      findAccessibleCourse: jest.fn().mockResolvedValue({ organization_scope_id: scopeId, status: 'ARCHIVED' }),
    } as unknown as TrainingGroupsRepository;
    await expect(new TrainingGroupsService(archived, transaction(), new ScopeService()).create({ name: 'X', courseId }, actor))
      .rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });
  });

  it('conceals out-of-scope updates as not found', async () => {
    const repository = { findScoped: jest.fn().mockResolvedValue(null) } as unknown as TrainingGroupsRepository;
    const service = new TrainingGroupsService(repository, transaction(), new ScopeService());
    await expect(service.update(groupId, { status: 'CLOSED' as never }, actor)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('closes a group', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ ...row, status: 'CLOSED' }),
    } as unknown as TrainingGroupsRepository;
    const service = new TrainingGroupsService(repository, transaction(), new ScopeService());
    await expect(service.update(groupId, { status: 'CLOSED' as never }, actor)).resolves.toMatchObject({ status: 'CLOSED' });
  });
});
