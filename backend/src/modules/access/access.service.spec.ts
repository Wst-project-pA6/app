import { AccessService } from './access.service';
import { AccessRepository, AccessUser } from './access.repository';
import { PasswordService } from '../auth/password.service';
import { DatabaseService } from '../../common/database/database.service';
import { ErrorCode } from '../../common/errors/error-codes';
import { RoleCode } from './dto/access.dto';
import type { AuthenticatedPrincipal } from '../auth/authenticated-principal';

const user = (roles: string[] = []): AccessUser => ({
  id: '11111111-1111-4111-8111-111111111111',
  email: 'user@example.test', display_name: 'User', preferred_locale: 'en', status: 'ACTIVE',
  roles, organization_scope_ids: [], must_change_password: false, last_login_at: null,
  created_at: new Date('2026-01-01'), updated_at: new Date('2026-01-01'),
  created_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', updated_by: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', student_id: null,
});
const actor: AuthenticatedPrincipal = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'admin@example.test', displayName: 'Admin',
  preferredLocale: 'en', roles: ['SYSTEM_ADMIN'], permissions: ['users.manage', 'roles.assign', 'scopes.manage'],
  organizationScopeIds: [], mustChangePassword: false,
};

describe('AccessService', () => {
  it('hashes new passwords and creates users without grants', async () => {
    const client = { query: jest.fn() } as never;
    const createUser = jest.fn().mockResolvedValue(user().id);
    const repository = { createUser, findUser: jest.fn().mockResolvedValue(user()) } as unknown as AccessRepository;
    const database = { runInTransaction: jest.fn(async (work) => work(client)) } as unknown as DatabaseService;
    const hash = jest.fn().mockResolvedValue('hash');
    const passwords = { hash } as unknown as PasswordService;
    const service = new AccessService(repository, database, passwords);
    await service.createUser({ email: 'exact@example.test', displayName: 'Exact', preferredLocale: 'en', temporaryPassword: 'twelvecharacters' }, actor);
    expect(hash).toHaveBeenCalledWith('twelvecharacters');
    expect(createUser).toHaveBeenCalledWith(client, expect.objectContaining({ hash: 'hash', actor: actor.id }));
  });

  it('maps duplicate email and preserves unexpected database errors', async () => {
    const duplicate = { code: '23505' };
    const unexpected = new Error('database unavailable');
    const make = (error: unknown) => {
      const repository = { createUser: jest.fn().mockRejectedValue(error) } as unknown as AccessRepository;
      const database = { runInTransaction: jest.fn(async (work) => work({} as never)) } as unknown as DatabaseService;
      const passwords = { hash: jest.fn().mockResolvedValue('hash') } as unknown as PasswordService;
      return new AccessService(repository, database, passwords);
    };
    await expect(make(duplicate).createUser({ email: 'x@example.test', displayName: 'X', preferredLocale: 'en', temporaryPassword: 'twelvecharacters' }, actor))
      .rejects.toMatchObject({ code: ErrorCode.DUPLICATE_RESOURCE, statusCode: 409 });
    await expect(make(unexpected).createUser({ email: 'x@example.test', displayName: 'X', preferredLocale: 'en', temporaryPassword: 'twelvecharacters' }, actor))
      .rejects.toBe(unexpected);
  });

  it('locks administrators before target and records the role actor', async () => {
    const calls: string[] = [];
    const client = { query: jest.fn() } as never;
    const repository = {
      lockActiveSystemAdmins: jest.fn(async () => { calls.push('admins'); return [{ id: 'admin' }, { id: 'other' }]; }),
      findUser: jest.fn(async (_id, _client, lock) => { calls.push(lock ? 'target' : 'read'); return user(['TECHNICIAN']); }),
      replaceRoles: jest.fn(async (_client, _id, _roles, grantedBy) => { calls.push(`grant:${grantedBy}`); }),
    } as unknown as AccessRepository;
    const database = { runInTransaction: jest.fn(async (work) => work(client)) } as unknown as DatabaseService;
    const service = new AccessService(repository, database, {} as PasswordService);
    await service.replaceRoles(user().id, { roles: [RoleCode.TECHNICIAN] }, actor);
    expect(calls.slice(0, 2)).toEqual(['admins', 'target']);
    expect(calls).toContain(`grant:${actor.id}`);
  });

  it('prevents self-disable and disabling the last active administrator', async () => {
    const client = { query: jest.fn() } as never;
    const database = { runInTransaction: jest.fn(async (work) => work(client)) } as unknown as DatabaseService;
    const repository = {
      lockActiveSystemAdmins: jest.fn().mockResolvedValue([{ id: actor.id }]),
      findUser: jest.fn().mockResolvedValue(user(['SYSTEM_ADMIN'])),
    } as unknown as AccessRepository;
    const service = new AccessService(repository, database, {} as PasswordService);
    await expect(service.updateUser(actor.id, { status: 'DISABLED' }, actor)).rejects.toMatchObject({ code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION });
    await expect(service.updateUser(user().id, { status: 'DISABLED' }, actor)).rejects.toMatchObject({ code: ErrorCode.SEPARATION_OF_DUTIES_VIOLATION });
  });

  it('locks active scopes and records the scope actor', async () => {
    const client = { query: jest.fn() } as never;
    const lockActiveScopes = jest.fn().mockResolvedValue([{ id: '22222222-2222-4222-8222-222222222222' }]);
    const replaceScopes = jest.fn().mockResolvedValue(undefined);
    const repository = {
      findUser: jest.fn().mockResolvedValue(user()),
      lockActiveScopes,
      replaceScopes,
    } as unknown as AccessRepository;
    const database = { runInTransaction: jest.fn(async (work) => work(client)) } as unknown as DatabaseService;
    const service = new AccessService(repository, database, {} as PasswordService);
    const scopeId = '22222222-2222-4222-8222-222222222222';
    await service.replaceScopes(user().id, { organizationScopeIds: [scopeId] }, actor);
    expect(lockActiveScopes).toHaveBeenCalledWith(client, [scopeId]);
    expect(replaceScopes).toHaveBeenCalledWith(client, user().id, [scopeId], actor.id);
  });

  it('rejects missing users and unknown sort values', async () => {
    const repository = { findUser: jest.fn().mockResolvedValue(null), listUsers: jest.fn() } as unknown as AccessRepository;
    const service = new AccessService(repository, {} as DatabaseService, {} as PasswordService);
    await expect(service.getUser(user().id)).rejects.toMatchObject({ statusCode: 404 });
    await expect(service.listUsers({ page: 1, pageSize: 20, sort: 'passwordHash' })).rejects.toMatchObject({ statusCode: 400 });
  });
});
