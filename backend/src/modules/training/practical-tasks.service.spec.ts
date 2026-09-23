import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { PracticalTaskRow, PracticalTasksRepository } from './practical-tasks.repository';
import { PracticalTasksService } from './practical-tasks.service';

const taskId = '11111111-1111-4111-8111-111111111111';
const competencyId = '22222222-2222-4222-8222-222222222222';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'manager@example.test', displayName: 'Manager',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.manage'],
  organizationScopeIds: [], mustChangePassword: false,
};

const task = (overrides: Partial<PracticalTaskRow> = {}): PracticalTaskRow => ({
  id: taskId, code: 'TASK-1', title_en: 'Change oil', title_ar: null, description: null,
  competency_id: competencyId, expected_minutes: 30, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
  ...overrides,
});

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

describe('PracticalTasksService.create', () => {
  it('rejects a competency that does not exist as not found', async () => {
    const repository = { findCompetency: jest.fn().mockResolvedValue(null) } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.create({ code: 'TASK-1', title: { en: 'Change oil' }, competencyId, expectedMinutes: 30 } as never, actor))
      .rejects.toMatchObject({ statusCode: 404, code: ErrorCode.NOT_FOUND });
  });

  it('creates an ACTIVE task once the competency is verified', async () => {
    const create = jest.fn().mockResolvedValue(task());
    const repository = {
      findCompetency: jest.fn().mockResolvedValue({ id: competencyId }),
      create,
    } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.create({ code: 'TASK-1', title: { en: 'Change oil' }, competencyId, expectedMinutes: 30 } as never, actor))
      .resolves.toMatchObject({ code: 'TASK-1', title: { en: 'Change oil' }, status: 'ACTIVE' });
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ competencyId, titleEn: 'Change oil' }));
  });

  it('maps the duplicate-code constraint to 409 DUPLICATE_RESOURCE and preserves unrelated failures', async () => {
    const repository = {
      findCompetency: jest.fn().mockResolvedValue({ id: competencyId }),
      create: jest.fn().mockRejectedValue({ code: '23505', constraint: 'uq_task_code' }),
    } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.create({ code: 'TASK-1', title: { en: 'Change oil' }, competencyId, expectedMinutes: 30 } as never, actor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.DUPLICATE_RESOURCE });

    const unexpected = new Error('database unavailable');
    const failing = {
      findCompetency: jest.fn().mockResolvedValue({ id: competencyId }),
      create: jest.fn().mockRejectedValue(unexpected),
    } as unknown as PracticalTasksRepository;
    await expect(new PracticalTasksService(failing, transaction()).create({ code: 'TASK-1', title: { en: 'Change oil' }, competencyId, expectedMinutes: 30 } as never, actor))
      .rejects.toBe(unexpected);
  });
});

describe('PracticalTasksService.update', () => {
  it('conceals a missing task as not found and validates a replacement competency', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(null) } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.update(taskId, { status: 'ARCHIVED' } as never, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });

    const missingCompetency = {
      findById: jest.fn().mockResolvedValue(task()),
      findCompetency: jest.fn().mockResolvedValue(null),
    } as unknown as PracticalTasksRepository;
    await expect(new PracticalTasksService(missingCompetency, transaction()).update(taskId, { competencyId: '99999999-9999-4999-8999-999999999999' } as never, actor))
      .rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('archives a task without touching expected minutes when only status changes', async () => {
    const update = jest.fn().mockResolvedValue(task({ status: 'ARCHIVED' }));
    const repository = { findById: jest.fn().mockResolvedValue(task()), update } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.update(taskId, { status: 'ARCHIVED' } as never, actor)).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(update).toHaveBeenCalledWith(expect.anything(), taskId, { status: 'ARCHIVED' }, actor.id);
  });

  it('rejects an empty patch before writing anything', async () => {
    const update = jest.fn();
    const repository = { findById: jest.fn().mockResolvedValue(task()), update } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.update(taskId, {} as never, actor)).rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('PracticalTasksService.list', () => {
  it('rejects an unallowlisted sort before querying', async () => {
    const list = jest.fn();
    const repository = { list } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'expectedMinutes' } as never, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list).not.toHaveBeenCalled();
  });

  it('maps the localized title and omits an absent Arabic name', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [task(), task({ id: 'other', title_ar: 'تغيير الزيت' })], totalItems: 2 });
    const repository = { list } as unknown as PracticalTasksRepository;
    const service = new PracticalTasksService(repository, transaction());
    const result = await service.list({ page: 1, pageSize: 20 } as never, actor);
    expect(result.items[0]).toMatchObject({ title: { en: 'Change oil' } });
    expect(result.items[0].title).not.toHaveProperty('ar');
    expect(result.items[1]).toMatchObject({ title: { en: 'Change oil', ar: 'تغيير الزيت' } });
  });
});
