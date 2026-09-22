import { TransactionService } from '../../common/database/transaction.service';
import { ScopeService } from '../../common/auth/scope.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import {
  ServiceHistoryRow,
  ServiceReminderRow,
  VehicleRow,
  VehiclesRepository,
} from './vehicles.repository';
import { VehiclesService } from './vehicles.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const vehicleId = '11111111-1111-4111-8111-111111111111';
const reminderId = '44444444-4444-4444-8444-444444444444';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  email: 'advisor@example.test',
  displayName: 'Advisor',
  preferredLocale: 'en',
  roles: ['SERVICE_ADVISOR'],
  permissions: ['vehicles.read', 'vehicles.write'],
  organizationScopeIds: [scopeId],
  mustChangePassword: false,
};

const vehicle = (status: 'ACTIVE' | 'ARCHIVED' = 'ACTIVE', mileage = 100): VehicleRow => ({
  id: vehicleId,
  customer_id: customerId,
  plate: 'ABC123',
  vin: '1HGCM82633A004352',
  make: 'Honda',
  model: 'Accord',
  year: 2020,
  mileage,
  mileage_unit: 'KM',
  status,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
});

const history: ServiceHistoryRow = {
  job_id: '55555555-5555-4555-8555-555555555555',
  job_number: 'JC-2026-000001',
  service_type: 'REPAIR',
  complaint: 'Brake noise',
  mileage_at_intake: 90,
  delivered_at: new Date('2026-02-01T10:00:00.000Z'),
};

const reminder = (status: 'OPEN' | 'DONE' | 'CANCELLED' = 'OPEN'): ServiceReminderRow => ({
  id: reminderId,
  vehicle_id: vehicleId,
  title: 'Oil service',
  due_date: '2026-10-01',
  due_mileage: 10000,
  status,
  completed_at: status === 'OPEN' ? null : new Date('2026-03-01T10:00:00.000Z'),
  notes: null,
  created_at: new Date('2026-01-01T00:00:00.000Z'),
  updated_at: new Date('2026-01-01T00:00:00.000Z'),
  created_by: actor.id,
  updated_by: actor.id,
});

const transaction = (client: unknown = {}): TransactionService => ({
  runInTransaction: jest.fn(async (work) => work(client as never)),
} as unknown as TransactionService);

describe('VehiclesService', () => {
  it('lists scoped vehicles and validates a customer filter before querying', async () => {
    const repository = {
      findAccessibleCustomer: jest.fn().mockResolvedValue(true),
      list: jest.fn().mockResolvedValue({ rows: [vehicle()], totalItems: 1 }),
    } as unknown as VehiclesRepository;
    const service = new VehiclesService(repository, {} as TransactionService, new ScopeService());

    await expect(service.list({
      page: 1,
      pageSize: 20,
      customerId,
    }, actor)).resolves.toMatchObject({
      items: [{ id: vehicleId, customerId, mileageUnit: 'KM' }],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(repository.findAccessibleCustomer).toHaveBeenCalledWith(undefined, customerId, [scopeId]);
    expect(repository.list).toHaveBeenCalledWith({ page: 1, pageSize: 20, customerId }, [scopeId]);
  });

  it('conceals an inaccessible customer filter and rejects unknown sorting', async () => {
    const repository = {
      findAccessibleCustomer: jest.fn().mockResolvedValue(false),
      list: jest.fn(),
    } as unknown as VehiclesRepository;
    const service = new VehiclesService(repository, {} as TransactionService, new ScopeService());

    await expect(service.list({ page: 1, pageSize: 20, customerId }, actor)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
    await expect(service.list({ page: 1, pageSize: 20, sort: 'vin' }, actor)).rejects.toMatchObject({
      statusCode: 400,
      code: ErrorCode.BAD_REQUEST,
    });
  });

  it('requires the referenced customer to be in scope and uses a transaction for create', async () => {
    const repository = {
      findAccessibleCustomer: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockResolvedValue(vehicle()),
    } as unknown as VehiclesRepository;
    const tx = transaction({});
    const service = new VehiclesService(repository, tx, new ScopeService());
    const dto = {
      customerId,
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      mileage: 100,
      mileageUnit: 'KM' as const,
    };

    await expect(service.create(dto, actor)).resolves.toMatchObject({ id: vehicleId, status: 'ACTIVE' });
    expect(tx.runInTransaction).toHaveBeenCalledTimes(1);
    expect(repository.findAccessibleCustomer).toHaveBeenCalledWith(expect.anything(), customerId, [scopeId], true);

    (repository.findAccessibleCustomer as jest.Mock).mockResolvedValue(false);
    await expect(service.create(dto, actor)).rejects.toMatchObject({
      statusCode: 404,
      code: ErrorCode.NOT_FOUND,
    });
  });

  it('returns detail history and next-service reminder information', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(vehicle()),
      findLastCompletedJob: jest.fn().mockResolvedValue(history),
      findNextService: jest.fn().mockResolvedValue({
        reminder_id: reminderId,
        due_date: '2026-10-01',
        due_mileage: 10000,
      }),
    } as unknown as VehiclesRepository;
    const service = new VehiclesService(repository, {} as TransactionService, new ScopeService());

    await expect(service.get(vehicleId, actor)).resolves.toMatchObject({
      id: vehicleId,
      lastCompletedJob: { jobNumber: 'JC-2026-000001', serviceType: 'REPAIR' },
      nextService: { reminderId, dueDate: '2026-10-01', dueMileage: 10000 },
    });
  });

  it('enforces increasing mileage and archive resource protection in a transaction', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(vehicle()),
      countNonDeliveredJobs: jest.fn().mockResolvedValue(0),
      update: jest.fn().mockResolvedValue(vehicle('ARCHIVED', 100)),
    } as unknown as VehiclesRepository;
    const tx = transaction({});
    const service = new VehiclesService(repository, tx, new ScopeService());

    await expect(service.update(vehicleId, { status: 'ARCHIVED' }, actor)).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(repository.countNonDeliveredJobs).toHaveBeenCalledWith(expect.anything(), vehicleId);
    expect(repository.update).toHaveBeenCalledWith(expect.anything(), vehicleId, { status: 'ARCHIVED' }, actor.id);

    await expect(service.update(vehicleId, { mileage: 99 }, actor)).rejects.toMatchObject({
      statusCode: 422,
      code: ErrorCode.VALIDATION_FAILED,
    });

    (repository.countNonDeliveredJobs as jest.Mock).mockResolvedValue(1);
    await expect(service.update(vehicleId, { status: 'ARCHIVED' }, actor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.RESOURCE_IN_USE,
    });
  });

  it('lists delivered history and reminders with mapped page envelopes', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(vehicle()),
      listHistory: jest.fn().mockResolvedValue({ rows: [history], totalItems: 1 }),
      listReminders: jest.fn().mockResolvedValue({ rows: [reminder()], totalItems: 1 }),
    } as unknown as VehiclesRepository;
    const service = new VehiclesService(repository, {} as TransactionService, new ScopeService());

    await expect(service.listHistory(vehicleId, { page: 1, pageSize: 20 }, actor)).resolves.toMatchObject({
      items: [{ jobId: history.job_id, deliveredAt: history.delivered_at }],
      page: { totalItems: 1, totalPages: 1 },
    });
    await expect(service.listReminders(vehicleId, { page: 1, pageSize: 20, status: 'OPEN' }, actor)).resolves.toMatchObject({
      items: [{ id: reminderId, dueDate: '2026-10-01', status: 'OPEN' }],
      page: { totalItems: 1, totalPages: 1 },
    });
  });

  it('creates reminders and rejects status changes after terminal states', async () => {
    const repository = {
      findScoped: jest.fn().mockResolvedValue(vehicle()),
      createReminder: jest.fn().mockResolvedValue(reminder()),
      findScopedReminder: jest.fn().mockResolvedValue(reminder('DONE')),
      updateReminder: jest.fn(),
    } as unknown as VehiclesRepository;
    const service = new VehiclesService(repository, transaction({}), new ScopeService());

    await expect(service.createReminder(vehicleId, {
      title: 'Oil service',
      dueDate: '2026-10-01',
    }, actor)).resolves.toMatchObject({ id: reminderId, status: 'OPEN' });
    await expect(service.updateReminder(reminderId, { status: 'CANCELLED' }, actor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.INVALID_STATE_TRANSITION,
    });
  });

  it('maps known duplicate constraints and preserves unexpected database errors', async () => {
    const dto = {
      customerId,
      plate: 'ABC123',
      vin: '1HGCM82633A004352',
      make: 'Honda',
      model: 'Accord',
      year: 2020,
      mileage: 100,
      mileageUnit: 'KM' as const,
    };
    const make = (error: unknown) => new VehiclesService({
      findAccessibleCustomer: jest.fn().mockResolvedValue(true),
      create: jest.fn().mockRejectedValue(error),
    } as unknown as VehiclesRepository, transaction({}), new ScopeService());

    await expect(make({ code: '23505' }).create(dto, actor)).rejects.toMatchObject({
      statusCode: 409,
      code: ErrorCode.DUPLICATE_RESOURCE,
    });
    const unexpected = new Error('database unavailable');
    await expect(make(unexpected).create(dto, actor)).rejects.toBe(unexpected);
  });
});
