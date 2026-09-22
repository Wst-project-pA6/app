import { BadRequestException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ParseUUIDPipe } from '@nestjs/common';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

describe('AccessController contract', () => {
  const service = {} as AccessService;
  const controller = new AccessController(service);
  const reflector = new Reflector();
  const metadata = (method: keyof AccessController) =>
    reflector.get<string[]>('wst_permissions', controller[method]);

  it('declares the required permission on every endpoint', () => {
    expect(metadata('listUsers')).toEqual(['users.read']);
    expect(metadata('createUser')).toEqual(['users.manage']);
    expect(metadata('getUser')).toEqual(['users.read']);
    expect(metadata('updateUser')).toEqual(['users.manage']);
    expect(metadata('replaceRoles')).toEqual(['roles.assign']);
    expect(metadata('replaceScopes')).toEqual(['scopes.manage']);
    expect(metadata('roles')).toEqual(['users.read']);
    expect(metadata('listScopes')).toEqual(['scopes.manage', 'users.read']);
    expect(metadata('createScope')).toEqual(['scopes.manage']);
    expect(metadata('updateScope')).toEqual(['scopes.manage']);
  });

  it('rejects invalid UUID path values before service invocation', async () => {
    const pipe = new ParseUUIDPipe();
    await expect(pipe.transform('not-a-uuid', { type: 'param', metatype: String, data: 'userId' }))
      .rejects.toBeInstanceOf(BadRequestException);
  });
});
