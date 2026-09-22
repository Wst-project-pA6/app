import { ScopeService } from '../../common/auth/scope.service';
import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { BayRow, BaysRepository } from './bays.repository';
import { BaysService } from './bays.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const bayId = '11111111-1111-4111-8111-111111111111';
const jobId = '99999999-9999-4999-8999-999999999999';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'manager@example.test', displayName: 'Manager',
  preferredLocale: 'en', roles: ['WORKSHOP_MANAGER'], permissions: ['bays.read', 'bays.manage'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const row: BayRow = {
  id: bayId, organization_scope_id: scopeId, code: 'B1', name: 'Bay 1', capacity: 4, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
};

const transaction = (client: unknown = {}) => ({
  runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)),
}) as unknown as TransactionService;

describe('BaysService', () => {
  it('lists only repository rows within caller scope and maps pagination', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const repository = { list } as unknown as BaysRepository;
    const service = new BaysService(repository, {} as TransactionService, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: bayId, organizationScopeId: scopeId }], page: { totalItems: 1, totalPages: 1 },
    });
    expect(list.mock.calls).toContainEqual([{ page: 1, pageSize: 20 }, [scopeId]]);
  });

  it('rejects an unallowlisted bay sort before querying the repository', async () => {
    const list = jest.fn();
    const repository = { list } as unknown as BaysRepository;
    const service = new BaysService(repository, {} as TransactionService, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'status' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list.mock.calls).toHaveLength(0);
  });

  it('requires an active scoped organization for create and uses a transaction', async () => {
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(true), create: jest.fn().mockResolvedValue(row),
    } as unknown as BaysRepository;
    const runInTransaction = jest.fn(async (work: (value: never) => unknown) => work({} as never));
    const service = new BaysService(repository, { runInTransaction } as unknown as TransactionService, new ScopeService());
    await expect(service.create({ organizationScopeId: scopeId, code: 'B1', name: 'Bay 1', capacity: 4 }, actor)).resolves.toMatchObject({ id: bayId });
    expect(runInTransaction.mock.calls).toHaveLength(1);
    (repository.findActiveScope as jest.Mock).mockResolvedValue(false);
    await expect(service.create({ organizationScopeId: '33333333-3333-4333-8333-333333333333', code: 'B2', name: 'Bay 2', capacity: 2 }, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('conceals out-of-scope updates and rejects calendar windows over 31 days', async () => {
    const repository = { findScoped: jest.fn().mockResolvedValue(null) } as unknown as BaysRepository;
    const service = new BaysService(repository, transaction(), new ScopeService());
    await expect(service.update(bayId, { status: 'INACTIVE' }, actor)).rejects.toMatchObject({ statusCode: 404 });
    (repository.findScoped as jest.Mock).mockResolvedValue(row);
    await expect(service.calendar(bayId, { from: '2026-01-01T00:00:00Z', to: '2026-02-02T00:00:00Z' }, actor)).rejects.toMatchObject({ code: ErrorCode.BAD_REQUEST });
  });

  it('updates availability status and maps the scoped shared calendar without private job data', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(row),
      update: jest.fn().mockResolvedValue({ ...row, status: 'MAINTENANCE' }),
      calendar: jest.fn().mockResolvedValue([{
        kind: 'JOB', reference_id: jobId, reference_label: 'JC-2026-000001',
        starts_at: new Date('2026-01-01T09:00:00Z'), ends_at: new Date('2026-01-01T10:00:00Z'),
      }]),
    } as unknown as BaysRepository;
    const service = new BaysService(repository, transaction(), new ScopeService());
    await expect(service.update(bayId, { status: 'MAINTENANCE' }, actor)).resolves.toMatchObject({ status: 'MAINTENANCE' });
    await expect(service.calendar(bayId, { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' }, actor))
      .resolves.toMatchObject({ entries: [{ kind: 'JOB', referenceId: jobId, referenceLabel: 'JC-2026-000001' }] });
  });

  it('maps the known bay-code constraint but preserves other database errors', async () => {
    const duplicate = { findActiveScope: jest.fn().mockResolvedValue(true), create: jest.fn().mockRejectedValue({ code: '23505', constraint: 'uq_bay_code' }) } as unknown as BaysRepository;
    const service = new BaysService(duplicate, transaction(), new ScopeService());
    await expect(service.create({ organizationScopeId: scopeId, code: 'B1', name: 'Bay 1', capacity: 4 }, actor)).rejects.toMatchObject({ code: ErrorCode.DUPLICATE_RESOURCE });
    const unexpected = new Error('database unavailable');
    const failing = { findActiveScope: jest.fn().mockResolvedValue(true), create: jest.fn().mockRejectedValue(unexpected) } as unknown as BaysRepository;
    await expect(new BaysService(failing, transaction(), new ScopeService()).create({ organizationScopeId: scopeId, code: 'B1', name: 'Bay 1', capacity: 4 }, actor)).rejects.toBe(unexpected);
  });
});
