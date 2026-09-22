import { CanActivate, ExecutionContext, Injectable, HttpStatus } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import { PERMISSIONS_KEY } from './permissions.decorator';
import type { AuthenticatedPrincipal } from '../../modules/auth/authenticated-principal';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const user = context.switchToHttp().getRequest<{ user?: AuthenticatedPrincipal }>().user;
    if (!user || !required.some((permission) => user.permissions.includes(permission))) {
      throw new AppError(HttpStatus.FORBIDDEN, ErrorCode.FORBIDDEN, 'Forbidden');
    }
    return true;
  }
}
