export interface AuthenticatedPrincipal {
  id: string;
  email: string;
  displayName: string;
  preferredLocale: string;
  roles: string[];
  permissions: string[];
  organizationScopeIds: string[];
  studentId?: string;
  mustChangePassword: boolean;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedPrincipal;
  }
}
