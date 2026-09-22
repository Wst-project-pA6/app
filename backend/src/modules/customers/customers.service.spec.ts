import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { TransactionService } from '../../common/database/transaction.service';
import { ScopeService } from '../../common/auth/scope.service';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CustomersRepository, CustomerRow } from './customers.repository';
import { CustomersService } from './customers.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const customerId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'advisor@example.test',
  displayName: 'Advisor',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['customers.read', 'customers.write'],
  organizationScopeIds: [scopeId],
  mustChangePassword: false,
};

const row = (status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE'): CustomerRow => ({
  id: customerId,
  organization_scope_id: scopeId,
  display_name: 'Alice',
  type: 'INDIVIDUAL',
  phone: '+201001234567',
  email: 'alice@example.test',
  preferred_channel: 'SMS',
  preferred_locale: 'en',
  status,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
});

const transaction = (client: unknown = {}): TransactionService => ({
  runInTransaction: jest.fn(async (work) => work(client as never)),
} as unknown as TransactionService);

describe('CustomersService', () => {
  it('lists only the actor scopes and returns the frozen page envelope', async () => {
    const repository = {
      list: jest.fn().mockResolvedValue({ rows: [row()], totalItems: 1 }),
    } as unknown as CustomersRepository;
    const service = new CustomersService(repository, {} as TransactionService, new ScopeService());

    await expect(service.list({ page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ id: customerId, organizationScopeId: scopeId, contactPreferences: { preferredChannel: 'SMS' } }],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId]);
  });

  it('rejects unknown sorting before querying and conceals inaccessible reads as 404', async () => {
    const repository = {
      list: jest.fn(),
      findScoped: jest.fn().mockResolvedValue(null),
    } as unknown as CustomersRepository;
    const service = new CustomersService(repository, {} as TransactionService, new ScopeService());

    await expect(service.list({ page: 1, pageSize: 20, sort: 'email' }, actor)).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCode.BAD_REQUEST,
    });
    await expect(service.get(customerId, actor)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
    expect(repository.findScoped).toHaveBeenCalledWith(customerId, [scopeId]);
  });

  it('requires an assigned active organization scope for create and uses a transaction', async () => {
    const repository = {
      findActiveScope: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue(row()),
    } as unknown as CustomersRepository;
    const tx = transaction({});
    const service = new CustomersService(repository, tx, new ScopeService());

    await expect(service.create({
      organizationScopeId: scopeId,
      displayName: 'Alice',
      type: 'INDIVIDUAL',
      phone: '+201001234567',
    }, actor)).resolves.toMatchObject({ id: customerId, status: 'ACTIVE' });
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ actor: actor.id }));

    const outsideActor = { ...actor, organizationScopeIds: [] };
    await expect(service.create({
      organizationScopeId: scopeId,
      displayName: 'Alice',
      type: 'INDIVIDUAL',
      phone: '+201001234567',
    }, outsideActor)).rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('archives only when no non-delivered jobs remain and conceals out-of-scope updates', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(row()),
      countNonDeliveredJobs: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(row('ARCHIVED')),
    } as unknown as CustomersRepository;
    const tx = transaction({});
    const service = new CustomersService(repository, tx, new ScopeService());

    await expect(service.update(customerId, { status: 'ARCHIVED' }, actor)).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(repository.findScoped).toHaveBeenCalledWith(customerId, [scopeId], expect.anything(), true);
    expect(repository.countNonDeliveredJobs).toHaveBeenCalledWith(expect.anything(), customerId);
    expect(repository.update).toHaveBeenCalledWith(expect.anything(), customerId, { status: 'ARCHIVED' }, actor.id);

    (repository.countNonDeliveredJobs as jest.Mock).mockResolvedValue(1);
    await expect(service.update(customerId, { status: 'ARCHIVED' }, actor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.RESOURCE_IN_USE,
    });

    (repository.findScoped as jest.Mock).mockResolvedValue(null);
    await expect(service.update(customerId, { displayName: 'Hidden' }, actor)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('maps known duplicate constraints and preserves unexpected database errors', async () => {
    const duplicate = { code: '23505' };
    const unexpected = new Error('database unavailable');
    const make = (error: unknown) => {
      const repository = {
        findActiveScope: jest.fn().mockResolvedValue(true),
        create: jest.fn().mockRejectedValue(error),
      } as unknown as CustomersRepository;
      return new CustomersService(repository, transaction({}), new ScopeService());
    };
    const dto = {
      organizationScopeId: scopeId,
      displayName: 'Alice',
      type: 'INDIVIDUAL' as const,
      phone: '+201001234567',
    };

    await expect(make(duplicate).create(dto, actor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    await expect(make(unexpected).create(dto, actor)).rejects.toBe(unexpected);
  });

  it('preserves transaction errors and rejects empty updates', async () => {
    const unexpected = new Error('transaction failed');
    const service = new CustomersService(
      {} as CustomersRepository,
      { runInTransaction: jest.fn().mockRejectedValue(unexpected) } as unknown as TransactionService,
      new ScopeService(),
    );
    await expect(service.update(customerId, { displayName: 'x' }, actor)).rejects.toBe(unexpected);
    await expect(service.update(customerId, {}, actor)).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it('delegates customer statement to InvoicesService', async () => {
    const mockInvoicesService = {
      getCustomerStatement: jest.fn().mockResolvedValue({ customerId, lines: [] }),
    };
    const service = new CustomersService(
      {} as CustomersRepository,
      {} as TransactionService,
      new ScopeService(),
      mockInvoicesService as never,
    );
    const query = { from: '2026-01-01T00:00:00Z' };
    await expect(service.getStatement(customerId, query, actor)).resolves.toEqual({ customerId, lines: [] });
    expect(mockInvoicesService.getCustomerStatement).toHaveBeenCalledWith(customerId, query, actor);
  });
});

describe('customer error shape', () => {
  it('uses AppError for concealed rows', () => {
    const error = new AppError(404, ErrorCode.NOT_FOUND, 'Resource not found');
    expect(error).toBeInstanceOf(AppError);
  });
});
