import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-codes';
import { AuthService } from './auth.service';
import { hashRefreshToken } from './token.service';

const user = {
  id: 'u1', email: 'User@Example.test', password_hash: 'stored-hash', status: 'ACTIVE' as const,
  must_change_password: true,
};
const transactionClient = { name: 'transaction-client' };
const issued = {
  accessToken: 'access', refreshToken: 'refresh', familyId: 'family', refreshTokenHash: 'hash',
  refreshExpiresAt: new Date('2026-01-08T00:00:00Z'), accessTokenTtlSeconds: 600,
};

const registeredRow = {
  id: 'u2', email: 'new@example.test', display_name: 'New User', preferred_locale: 'en',
  status: 'ACTIVE' as const, must_change_password: false as const,
  created_at: new Date('2026-01-08T00:00:00Z'), updated_at: new Date('2026-01-08T00:00:00Z'),
};

function setup() {
  const repository = {
    findByEmail: jest.fn().mockResolvedValue(user), lockUser: jest.fn().mockResolvedValue({ ...user, must_change_password: false }),
    insertRefreshToken: jest.fn().mockResolvedValue(undefined), updateLastLogin: jest.fn().mockResolvedValue(undefined),
    findRefreshTokenUserId: jest.fn().mockResolvedValue({ user_id: user.id }),
    lockRefreshToken: jest.fn(), markRefreshTokenRotated: jest.fn().mockResolvedValue(undefined),
    revokeRefreshFamily: jest.fn().mockResolvedValue(undefined), updatePassword: jest.fn().mockResolvedValue(undefined),
    revokeAllRefreshTokens: jest.fn().mockResolvedValue(undefined),
    registerUser: jest.fn().mockResolvedValue(registeredRow),
  };
  const password = { verify: jest.fn().mockResolvedValue(true), hash: jest.fn().mockResolvedValue('new-password-hash') };
  const token = { issue: jest.fn().mockResolvedValue(issued), issueSuccessor: jest.fn().mockResolvedValue(issued) };
  const database = { runInTransaction: jest.fn(async (work: (client: unknown) => Promise<unknown>) => work(transactionClient)) };
  return { service: new AuthService(repository as never, password as never, token as never, database as never), repository, password, token, database };
}

describe('AuthService', () => {
  it('returns exactly the access/refresh token pair for an active user', async () => {
    const setupResult = setup();
    const { service } = setupResult;
    await expect(service.login({ email: user.email, password: 'secret' })).resolves.toEqual({
      accessToken: 'access', refreshToken: 'refresh', tokenType: 'Bearer', expiresIn: 600, mustChangePassword: false,
    });
    expect(setupResult.database.runInTransaction).toHaveBeenCalledTimes(1);
    expect(setupResult.repository.lockUser).toHaveBeenCalledWith(transactionClient, user.id);
    expect(setupResult.token.issue).toHaveBeenCalledWith(user.id);
    expect(setupResult.repository.insertRefreshToken).toHaveBeenCalledWith(
      transactionClient, user.id, issued.familyId, issued.refreshTokenHash, issued.refreshExpiresAt,
    );
    expect(setupResult.repository.updateLastLogin).toHaveBeenCalledWith(transactionClient, user.id);
  });

  it.each([
    ['wrong password', true, 'ACTIVE'], ['disabled user', true, 'DISABLED'], ['unknown user', false, 'ACTIVE'],
  ])('returns identical INVALID_CREDENTIALS and does no token/persistence work for %s', async (_label, found, status) => {
    const setupResult = setup();
    setupResult.repository.findByEmail.mockResolvedValue(found ? { ...user, status } : null);
    if (_label === 'wrong password') setupResult.password.verify.mockResolvedValue(false);
    const failure = await setupResult.service.login({ email: user.email, password: 'secret' }).catch((error: unknown) => error);
    expect(failure).toEqual(new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials'));
    expect(setupResult.password.verify).toHaveBeenCalledTimes(1);
    expect(setupResult.token.issue).not.toHaveBeenCalled();
    expect(setupResult.database.runInTransaction).not.toHaveBeenCalled();
  });

  it('verifies the dummy hash for an unknown user', async () => {
    const { service, password, repository } = setup();
    repository.findByEmail.mockResolvedValue(null);
    await expect(service.login({ email: 'missing@example.test', password: 'secret' })).rejects.toThrow('Invalid credentials');
    expect(password.verify).toHaveBeenCalledWith('secret', undefined);
  });

  it.each([
    ['missing locked user', null],
    ['disabled after lookup', { ...user, status: 'DISABLED' as const, password_hash: user.password_hash, must_change_password: false }],
    ['password changed after lookup', { ...user, status: 'ACTIVE' as const, password_hash: 'new-hash', must_change_password: false }],
  ])('rechecks the locked user before issuing tokens (%s)', async (_label, locked) => {
    const setupResult = setup();
    setupResult.repository.lockUser.mockResolvedValue(locked);
    await expect(setupResult.service.login({ email: user.email, password: 'secret' })).rejects.toThrow('Invalid credentials');
    expect(setupResult.token.issue).not.toHaveBeenCalled();
    expect(setupResult.repository.insertRefreshToken).not.toHaveBeenCalled();
    expect(setupResult.repository.updateLastLogin).not.toHaveBeenCalled();
  });

  it('hashes the password, creates an ACTIVE user with no roles/scopes, and never returns the hash', async () => {
    const setupResult = setup();
    const { service } = setupResult;
    const result = await service.register({
      email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', password: 'twelvecharacters',
    });
    expect(setupResult.password.hash).toHaveBeenCalledWith('twelvecharacters');
    expect(setupResult.database.runInTransaction).toHaveBeenCalledTimes(1);
    expect(setupResult.repository.registerUser).toHaveBeenCalledWith(transactionClient, {
      email: 'new@example.test', displayName: 'New User', preferredLocale: 'en', passwordHash: 'new-password-hash',
    });
    expect(result).toEqual({
      id: 'u2', email: 'new@example.test', displayName: 'New User', preferredLocale: 'en',
      status: 'ACTIVE', roles: [], organizationScopeIds: [], mustChangePassword: false,
      createdAt: registeredRow.created_at, updatedAt: registeredRow.updated_at,
    });
    expect(JSON.stringify(result)).not.toContain('new-password-hash');
    expect(Object.keys(result)).not.toContain('password');
    expect(Object.keys(result)).not.toContain('passwordHash');
  });

  it('maps a duplicate email to 409 DUPLICATE_RESOURCE and preserves unrelated database errors', async () => {
    const duplicate = { code: '23505' };
    const unexpected = new Error('database unavailable');

    const duplicateSetup = setup();
    duplicateSetup.repository.registerUser.mockRejectedValue(duplicate);
    await expect(duplicateSetup.service.register({
      email: 'dup@example.test', displayName: 'Dup', preferredLocale: 'en', password: 'twelvecharacters',
    })).rejects.toEqual(new AppError(409, ErrorCode.DUPLICATE_RESOURCE, 'Duplicate resource'));

    const unexpectedSetup = setup();
    unexpectedSetup.repository.registerUser.mockRejectedValue(unexpected);
    await expect(unexpectedSetup.service.register({
      email: 'dup@example.test', displayName: 'Dup', preferredLocale: 'en', password: 'twelvecharacters',
    })).rejects.toBe(unexpected);
  });

  it('rotates a refresh token in one family without extending its absolute expiry', async () => {
    const setupResult = setup();
    const expiresAt = new Date(Date.now() + 60_000);
    setupResult.repository.lockRefreshToken.mockResolvedValue({
      id: 'token-1', user_id: user.id, family_id: 'family-1', expires_at: expiresAt,
      rotated_at: null, revoked_at: null,
    });
    await expect(setupResult.service.refresh({ refreshToken: 'x'.repeat(32) })).resolves.toMatchObject({
      tokenType: 'Bearer', mustChangePassword: false,
    });
    expect(setupResult.repository.findRefreshTokenUserId).toHaveBeenCalledWith(hashRefreshToken('x'.repeat(32)));
    expect(setupResult.repository.lockUser.mock.invocationCallOrder[0])
      .toBeLessThan(setupResult.repository.lockRefreshToken.mock.invocationCallOrder[0]);
    expect(setupResult.repository.markRefreshTokenRotated).toHaveBeenCalledWith(transactionClient, 'token-1');
    expect(setupResult.token.issueSuccessor).toHaveBeenCalledWith(user.id, 'family-1', expiresAt);
    expect(setupResult.repository.insertRefreshToken).toHaveBeenCalledWith(
      transactionClient, user.id, 'family', 'hash', issued.refreshExpiresAt,
    );
  });

  it('revokes a replayed family and returns denial after the transaction result', async () => {
    const setupResult = setup();
    setupResult.repository.lockRefreshToken.mockResolvedValue({
      id: 'token-1', user_id: user.id, family_id: 'family-1', expires_at: new Date(Date.now() + 60_000),
      rotated_at: new Date(), revoked_at: null,
    });
    const failure = await setupResult.service.refresh({ refreshToken: 'x'.repeat(32) }).catch((error: unknown) => error);
    expect(failure).toEqual(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Unauthenticated'));
    expect(setupResult.repository.revokeRefreshFamily).toHaveBeenCalledWith(transactionClient, user.id, 'family-1');
    expect(setupResult.token.issueSuccessor).not.toHaveBeenCalled();
  });

  it.each([
    ['revoked', { rotated_at: null, revoked_at: new Date() }],
    ['expired', { rotated_at: null, revoked_at: null, expires_at: new Date(Date.now() - 1) }],
    ['disabled user', { rotated_at: null, revoked_at: null }],
  ])('denies %s refresh tokens safely', async (_label, state) => {
    const setupResult = setup();
    setupResult.repository.lockRefreshToken.mockResolvedValue({
      id: 'token-1', user_id: user.id, family_id: 'family-1', expires_at: new Date(Date.now() + 60_000),
      rotated_at: null, revoked_at: null, ...state,
    });
    if (_label === 'disabled user') setupResult.repository.lockUser.mockResolvedValue({ ...user, status: 'DISABLED' });
    await expect(setupResult.service.refresh({ refreshToken: 'x'.repeat(32) }))
      .rejects.toEqual(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Unauthenticated'));
    expect(setupResult.token.issueSuccessor).not.toHaveBeenCalled();
  });

  it('denies an unknown refresh token without opening a transaction', async () => {
    const setupResult = setup();
    setupResult.repository.findRefreshTokenUserId.mockResolvedValue(null);
    await expect(setupResult.service.refresh({ refreshToken: 'x'.repeat(32) }))
      .rejects.toEqual(new AppError(401, ErrorCode.UNAUTHENTICATED, 'Unauthenticated'));
    expect(setupResult.database.runInTransaction).not.toHaveBeenCalled();
  });

  it('commits replay revocation before throwing the denial', async () => {
    const setupResult = setup();
    setupResult.repository.lockRefreshToken.mockResolvedValue({
      id: 'token-1', user_id: user.id, family_id: 'family-1', expires_at: new Date(Date.now() + 60_000),
      rotated_at: new Date(), revoked_at: null,
    });
    let committed = false;
    setupResult.database.runInTransaction.mockImplementation(async (work: (client: unknown) => Promise<unknown>) => {
      const result = await work(transactionClient);
      committed = true;
      return result;
    });
    await expect(setupResult.service.refresh({ refreshToken: 'x'.repeat(32) })).rejects.toThrow('Unauthenticated');
    expect(committed).toBe(true);
    expect(setupResult.repository.revokeRefreshFamily).toHaveBeenCalled();
  });

  it('changes the password and atomically revokes all refresh tokens', async () => {
    const setupResult = setup();
    await expect(setupResult.service.changePassword(user.id, {
      currentPassword: ' current ', newPassword: 'new password exactly',
    })).resolves.toBeUndefined();
    expect(setupResult.password.verify).toHaveBeenCalledWith(' current ', user.password_hash);
    expect(setupResult.password.hash).toHaveBeenCalledWith('new password exactly');
    expect(setupResult.repository.updatePassword).toHaveBeenCalledWith(transactionClient, user.id, expect.any(String));
    expect(setupResult.repository.revokeAllRefreshTokens).toHaveBeenCalledWith(transactionClient, user.id);
  });

  it('does not update or revoke when the current password is wrong', async () => {
    const setupResult = setup();
    setupResult.password.verify.mockResolvedValue(false);
    await expect(setupResult.service.changePassword(user.id, {
      currentPassword: 'wrong', newPassword: 'new password exactly',
    })).rejects.toEqual(new AppError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid credentials'));
    expect(setupResult.password.hash).not.toHaveBeenCalled();
    expect(setupResult.repository.updatePassword).not.toHaveBeenCalled();
    expect(setupResult.repository.revokeAllRefreshTokens).not.toHaveBeenCalled();
  });

  it('logs out an owned token after locking the user first and revokes only its family', async () => {
    const setupResult = setup();
    setupResult.repository.lockRefreshToken.mockResolvedValue({
      id: 'token-1', user_id: user.id, family_id: 'family-1', expires_at: new Date(Date.now() + 60_000),
      rotated_at: null, revoked_at: null,
    });
    await expect(setupResult.service.logout(user.id, { refreshToken: 'x'.repeat(32) })).resolves.toBeUndefined();
    expect(setupResult.repository.findRefreshTokenUserId).toHaveBeenCalledWith(hashRefreshToken('x'.repeat(32)));
    expect(setupResult.repository.lockUser.mock.invocationCallOrder[0])
      .toBeLessThan(setupResult.repository.lockRefreshToken.mock.invocationCallOrder[0]);
    expect(setupResult.repository.revokeRefreshFamily).toHaveBeenCalledWith(transactionClient, user.id, 'family-1');
  });

  it.each([
    ['unknown', null],
    ['foreign', { user_id: 'other-user' }],
  ])('does not open a transaction or lock a token for %s logout', async (_label, discovered) => {
    const setupResult = setup();
    setupResult.repository.findRefreshTokenUserId.mockResolvedValue(discovered);
    await expect(setupResult.service.logout(user.id, { refreshToken: 'x'.repeat(32) })).resolves.toBeUndefined();
    expect(setupResult.database.runInTransaction).not.toHaveBeenCalled();
    expect(setupResult.repository.lockRefreshToken).not.toHaveBeenCalled();
    expect(setupResult.repository.revokeRefreshFamily).not.toHaveBeenCalled();
  });
});
