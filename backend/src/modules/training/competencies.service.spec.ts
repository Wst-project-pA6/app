import { TransactionService } from '../../common/database/transaction.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { CompetenciesRepository, CompetencyRow } from './competencies.repository';
import { CompetenciesService } from './competencies.service';

const competencyId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'manager@example.test', displayName: 'Manager',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.manage'],
  organizationScopeIds: [], mustChangePassword: false,
};

const competency = (overrides: Partial<CompetencyRow> = {}): CompetencyRow => ({
  id: competencyId, code: 'BRAKES', name_en: 'Brakes', name_ar: null, description: null, status: 'ACTIVE',
  created_at: new Date(), updated_at: new Date(), created_by: actor.id, updated_by: actor.id,
  ...overrides,
});

function transaction(client: unknown = {}) {
  return { runInTransaction: jest.fn(async (work: (value: never) => unknown) => work(client as never)) } as unknown as TransactionService;
}

describe('CompetenciesService.create', () => {
  it('creates an ACTIVE competency', async () => {
    const create = jest.fn().mockResolvedValue(competency());
    const repository = { create } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.create({ code: 'BRAKES', name: { en: 'Brakes' } } as never, actor))
      .resolves.toMatchObject({ code: 'BRAKES', name: { en: 'Brakes' }, status: 'ACTIVE' });
    expect(create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ code: 'BRAKES', nameEn: 'Brakes' }));
  });

  it('maps the duplicate-code constraint to 409 DUPLICATE_RESOURCE and preserves unrelated failures', async () => {
    const repository = { create: jest.fn().mockRejectedValue({ code: '23505', constraint: 'uq_competency_code' }) } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.create({ code: 'BRAKES', name: { en: 'Brakes' } } as never, actor))
      .rejects.toMatchObject({ statusCode: 409, code: ErrorCode.DUPLICATE_RESOURCE });

    const unexpected = new Error('database unavailable');
    const failing = { create: jest.fn().mockRejectedValue(unexpected) } as unknown as CompetenciesRepository;
    await expect(new CompetenciesService(failing, transaction()).create({ code: 'BRAKES', name: { en: 'Brakes' } } as never, actor))
      .rejects.toBe(unexpected);
  });
});

describe('CompetenciesService.update', () => {
  it('conceals a missing competency as not found', async () => {
    const repository = { findById: jest.fn().mockResolvedValue(null) } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.update(competencyId, { status: 'ARCHIVED' } as never, actor)).rejects.toMatchObject({ code: ErrorCode.NOT_FOUND });
  });

  it('archives a competency', async () => {
    const update = jest.fn().mockResolvedValue(competency({ status: 'ARCHIVED' }));
    const repository = { findById: jest.fn().mockResolvedValue(competency()), update } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.update(competencyId, { status: 'ARCHIVED' } as never, actor)).resolves.toMatchObject({ status: 'ARCHIVED' });
    expect(update).toHaveBeenCalledWith(expect.anything(), competencyId, { status: 'ARCHIVED' }, actor.id);
  });

  it('rejects an empty patch before writing anything', async () => {
    const update = jest.fn();
    const repository = { findById: jest.fn().mockResolvedValue(competency()), update } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.update(competencyId, {} as never, actor)).rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(update).not.toHaveBeenCalled();
  });
});

describe('CompetenciesService.list', () => {
  it('rejects an unallowlisted sort before querying', async () => {
    const list = jest.fn();
    const repository = { list } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'name' } as never, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list).not.toHaveBeenCalled();
  });

  it('maps the localized name and omits an absent Arabic name', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [competency(), competency({ id: 'other', name_ar: 'الفرامل' })], totalItems: 2 });
    const repository = { list } as unknown as CompetenciesRepository;
    const service = new CompetenciesService(repository, transaction());
    const result = await service.list({ page: 1, pageSize: 20 } as never, actor);
    expect(result.items[0]).toMatchObject({ name: { en: 'Brakes' } });
    expect(result.items[0].name).not.toHaveProperty('ar');
    expect(result.items[1]).toMatchObject({ name: { en: 'Brakes', ar: 'الفرامل' } });
  });
});
