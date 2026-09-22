import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { AppError } from '../errors/app-error';

describe('PermissionsGuard', () => {
  const context = (metadata: string[]|undefined, permissions: string[]) => ({
    getHandler: () => function handler(){}, getClass: () => class Test {},
    switchToHttp: () => ({ getRequest: () => ({ user: { permissions } }) }),
    reflectorMetadata: metadata,
  });
  function guard(metadata: string[]|undefined, permissions: string[]) {
    const reflector = new Reflector();
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(metadata);
    return { guard: new PermissionsGuard(reflector), context: context(metadata, permissions) };
  }
  it('allows any one required permission', () => expect(guard(['users.read','users.manage'],['users.manage']).guard.canActivate(guard(['users.read','users.manage'],['users.manage']).context as never)).toBe(true));
  it('denies a missing permission with the contract error', () => { const x=guard(['users.read'],[]); expect(()=>x.guard.canActivate(x.context as never)).toThrow(AppError); try{x.guard.canActivate(x.context as never);}catch(e){expect((e as AppError).statusCode).toBe(403);expect((e as AppError).message).toBe('Forbidden');} });
  it('allows authentication-only and public routes without metadata', () => { const x=guard(undefined,[]); expect(x.guard.canActivate(x.context as never)).toBe(true); });
});
