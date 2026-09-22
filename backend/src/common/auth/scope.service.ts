import { HttpStatus, Injectable } from '@nestjs/common';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-codes';
import type { AuthenticatedPrincipal } from '../../modules/auth/authenticated-principal';

@Injectable()
export class ScopeService {
  allowedScopeIds(principal: AuthenticatedPrincipal): string[] {
    return [...new Set(principal.organizationScopeIds)].sort();
  }
  hasScope(principal: AuthenticatedPrincipal, scopeId: string): boolean {
    return this.allowedScopeIds(principal).includes(scopeId);
  }
  assertScope(principal: AuthenticatedPrincipal, scopeId: string): void {
    if (!this.hasScope(principal, scopeId)) throw new AppError(HttpStatus.NOT_FOUND, ErrorCode.NOT_FOUND, 'Resource not found');
  }
}
