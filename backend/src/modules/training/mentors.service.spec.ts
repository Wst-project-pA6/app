import { ScopeService } from '../../common/auth/scope.service';
import { ErrorCode } from '../../common/errors/error-codes';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';
import { MentorRow, MentorsRepository } from './mentors.repository';
import { MentorsService } from './mentors.service';

const scopeId = '22222222-2222-4222-8222-222222222222';
const mentorId = '11111111-1111-4111-8111-111111111111';
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'supervisor@example.test', displayName: 'Supervisor',
  preferredLocale: 'en', roles: ['TRAINING_SUPERVISOR'], permissions: ['training.read'],
  organizationScopeIds: [scopeId], mustChangePassword: false,
};
const row: MentorRow = { id: mentorId, display_name: 'Mentor One' };

describe('MentorsService', () => {
  it('lists mentors within caller scope and maps to UserRef shape', async () => {
    const list = jest.fn().mockResolvedValue({ rows: [row], totalItems: 1 });
    const repository = { list } as unknown as MentorsRepository;
    const service = new MentorsService(repository, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20 }, actor)).resolves.toEqual({
      items: [{ id: mentorId, displayName: 'Mentor One' }],
      page: { page: 1, pageSize: 20, totalItems: 1, totalPages: 1 },
    });
    expect(list).toHaveBeenCalledWith({ page: 1, pageSize: 20 }, [scopeId]);
  });

  it('rejects an unallowlisted sort before querying the repository', async () => {
    const list = jest.fn();
    const repository = { list } as unknown as MentorsRepository;
    const service = new MentorsService(repository, new ScopeService());
    await expect(service.list({ page: 1, pageSize: 20, sort: 'id' }, actor))
      .rejects.toMatchObject({ statusCode: 400, code: ErrorCode.BAD_REQUEST });
    expect(list).not.toHaveBeenCalled();
  });
});
