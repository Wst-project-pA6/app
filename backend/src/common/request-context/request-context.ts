import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContextData {
  requestId: string;
  userId?: string;
  roles?: string[];
  scopes?: string[];
}

@Injectable()
export class RequestContext {
  private readonly store = new AsyncLocalStorage<RequestContextData>();

  run<T>(data: RequestContextData, callback: () => T): T {
    return this.store.run(data, callback);
  }

  get(): RequestContextData | undefined {
    return this.store.getStore();
  }

  getRequestId(): string | undefined {
    return this.store.getStore()?.requestId;
  }

  getUserId(): string | undefined {
    return this.store.getStore()?.userId;
  }

  getRoles(): string[] | undefined {
    return this.store.getStore()?.roles;
  }

  getScopes(): string[] | undefined {
    return this.store.getStore()?.scopes;
  }

  setUserId(userId: string): void {
    const store = this.store.getStore();
    if (store) {
      store.userId = userId;
    }
  }

  setRoles(roles: string[]): void {
    const store = this.store.getStore();
    if (store) {
      store.roles = roles;
    }
  }

  setScopes(scopes: string[]): void {
    const store = this.store.getStore();
    if (store) {
      store.scopes = scopes;
    }
  }
}