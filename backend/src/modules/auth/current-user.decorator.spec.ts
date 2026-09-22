import { AuthController } from './auth.controller';
import type { AuthenticatedPrincipal } from './authenticated-principal';

describe('AuthController current user', () => {
  it('returns the exact principal shape without querying again', () => {
    const principal: AuthenticatedPrincipal = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'user@example.test',
      displayName: 'User',
      preferredLocale: 'en',
      roles: ['A', 'B'],
      permissions: ['p1', 'p2'],
      organizationScopeIds: ['scope-1'],
      studentId: '223e4567-e89b-12d3-a456-426614174000',
      mustChangePassword: true,
    };
    const controller = new AuthController({} as never, {} as never);
    expect(controller.getCurrentUser(principal)).toEqual(principal);
    expect(Object.keys(controller.getCurrentUser(principal))).toEqual([
      'id', 'email', 'displayName', 'preferredLocale', 'roles', 'permissions',
      'organizationScopeIds', 'studentId', 'mustChangePassword',
    ]);
  });
});
