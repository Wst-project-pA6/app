import { ScopeService } from './scope.service';
import { AppError } from '../errors/app-error';
import type { AuthenticatedPrincipal } from '../../modules/auth/authenticated-principal';

describe('ScopeService', () => {
  const principal={id:'u',email:'e',displayName:'n',preferredLocale:'en',roles:['SYSTEM_ADMIN'],permissions:[],organizationScopeIds:['b','a','a'],mustChangePassword:false} as AuthenticatedPrincipal;
  it('uses only explicit, deterministic grants',()=>{const s=new ScopeService();expect(s.allowedScopeIds(principal)).toEqual(['a','b']);expect(s.hasScope(principal,'a')).toBe(true);expect(s.hasScope({...principal,organizationScopeIds:[]},'x')).toBe(false);});
  it('conceals inaccessible rows as not found',()=>{expect(()=>new ScopeService().assertScope(principal,'x')).toThrow(AppError);try{new ScopeService().assertScope(principal,'x');}catch(e){expect((e as AppError).statusCode).toBe(404);expect((e as AppError).message).toBe('Resource not found');}});
});
