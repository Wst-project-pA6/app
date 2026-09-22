import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { TrainingTermRow, TrainingTermsRepository } from './training-terms.repository';
import { TrainingTermsService } from './training-terms.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const termId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read', 'training.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const row: TrainingTermRow = {
  id: termId, organization_scope_id: scopeId, name: 'Fall 2026', start_date: '2026-01-01', end_date: '2026-06-01',
  status: 'PLANNED', created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};

const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

describe('TrainingTermsService', () => {
  it('lists only scoped terms and maps pagination', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const repository = { list } as unknown as TrainingTermsRepository;
    const service = new TrainingTermsService(repository, {} as TransactionService, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: termId, organizationScopeId: scopeId, status: 'PLANNED' }],
      page: { totalItems: 1, totalPages: 1 },
    });
    expect(list.mock.calls).toContainEqual([{ page: 1, pageSize: 20 }, [scopeId]]);
  });

  it('rejects an unallowlisted sort before querying the repository', async () => {
    const list = jest.fn();
    const repository = { list } as unknown as TrainingTermsRepository;
    const service = new TrainingTermsService(repository, {} as TransactionService, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list).not.toHaveBeenCalled();
  });

  it('requires an active in-scope organization and rejects an inverted date range', async () => {
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue(row),
    } as unknown as TrainingTermsRepository;
    const service = new TrainingTermsService(repository, transaction(), new ScopeService());

    await expect(service.create({
      organizationScopeId: scopeId, name: 'Fall 2026', startDate: '2026-01-01', endDate: '2026-06-01',
    }, actor)).resolves.toMatchObject({ id: termId });

    await expect(service.create({
      organizationScopeId: scopeId, name: 'Bad', startDate: '2026-06-01', endDate: '2026-01-01',
    }, actor)).rejects.toMatchObject({ code: ErrorCode.VALIDATION_FAILED, statusCode: 422 });

    await expect(service.create({
      organizationScopeId: '33333333-3333-4333-8333-333333333333', name: 'Out', startDate: '2026-01-01', endDate: '2026-06-01',
    }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('conceals out-of-scope updates and blocks edits on closed terms', async () => {
    const repository = { findScoped: jest.fn().mockResolvedValue(null) } as unknown as TrainingTermsRepository;
    const service = new TrainingTermsService(repository, transaction(), new ScopeService());
    await expect(service.update(termId, { name: 'New' }, actor)).rejects.toMatchObject({ statusCode: 404 });

    const closedRepository = {
      findScoped: jest.fn().mockResolvedValue({ ...row, status: 'CLOSED' }),
    } as unknown as TrainingTermsRepository;
    const closedService = new TrainingTermsService(closedRepository, transaction(), new ScopeService());
    await expect(closedService.update(termId, { name: 'New' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.INVALID_STATE_TRANSITION, statusCode: 409 });
  });

  it('updates status and applies partial changes within a transaction', async () => {
    const update = jest.fn().mockResolvedValue({ ...row, status: 'ACTIVE' });
    const repository = {
      findScoped: jest.fn().mockResolvedValue(row),
      update,
    } as unknown as TrainingTermsRepository;
    const service = new TrainingTermsService(repository, transaction(), new ScopeService());
    await expect(service.update(termId, { status: 'ACTIVE' as never }, actor)).resolves.toMatchObject({ status: 'ACTIVE' });
    expect(update).toHaveBeenCalledWith(expect.anything(), termId, { status: 'ACTIVE' }, actor.id);
  });
});
