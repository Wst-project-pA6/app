import { RequestContext } from './request-context';

describe('RequestContext', () => {
  let requestContext: RequestContext;

  beforeEach(() => {
    requestContext = new RequestContext();
  });

  describe('getRequestId', () => {
    it('should return undefined outside of run context', () => {
      expect(requestContext.getRequestId()).toBeUndefined();
    });

    it('should return requestId inside run context', () => {
      const result = requestContext.run({ requestId: 'test-request-id' }, () => {
        return requestContext.getRequestId();
      });
      expect(result).toBe('test-request-id');
    });

    it('should return requestId from get()', () => {
      const result = requestContext.run({ requestId: 'test-request-id-2' }, () => {
        const ctx = requestContext.get();
        return ctx?.requestId;
      });
      expect(result).toBe('test-request-id-2');
    });
  });

  describe('getUserId', () => {
    it('should return undefined when not set', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        return requestContext.getUserId();
      });
      expect(result).toBeUndefined();
    });

    it('should return userId when set in initial data', () => {
      const result = requestContext.run({ requestId: 'test', userId: 'user-123' }, () => {
        return requestContext.getUserId();
      });
      expect(result).toBe('user-123');
    });

    it('should return userId when set via setUserId', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        requestContext.setUserId('user-456');
        return requestContext.getUserId();
      });
      expect(result).toBe('user-456');
    });
  });

  describe('getRoles', () => {
    it('should return undefined when not set', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        return requestContext.getRoles();
      });
      expect(result).toBeUndefined();
    });

    it('should return roles when set in initial data', () => {
      const result = requestContext.run({ requestId: 'test', roles: ['TECHNICIAN', 'QUALITY_CHECKER'] }, () => {
        return requestContext.getRoles();
      });
      expect(result).toEqual(['TECHNICIAN', 'QUALITY_CHECKER']);
    });

    it('should return roles when set via setRoles', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        requestContext.setRoles(['SYSTEM_ADMIN']);
        return requestContext.getRoles();
      });
      expect(result).toEqual(['SYSTEM_ADMIN']);
    });
  });

  describe('getScopes', () => {
    it('should return undefined when not set', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        return requestContext.getScopes();
      });
      expect(result).toBeUndefined();
    });

    it('should return scopes when set in initial data', () => {
      const result = requestContext.run({ requestId: 'test', scopes: ['scope-1', 'scope-2'] }, () => {
        return requestContext.getScopes();
      });
      expect(result).toEqual(['scope-1', 'scope-2']);
    });

    it('should return scopes when set via setScopes', () => {
      const result = requestContext.run({ requestId: 'test' }, () => {
        requestContext.setScopes(['scope-3']);
        return requestContext.getScopes();
      });
      expect(result).toEqual(['scope-3']);
    });
  });

  describe('context isolation', () => {
    it('should isolate context between parallel runs', async () => {
      const results: string[] = [];

      const run1 = requestContext.run({ requestId: 'req-1' }, async () => {
        await new Promise((r) => setTimeout(r, 10));
        results.push(requestContext.getRequestId() ?? 'none');
      });

      const run2 = requestContext.run({ requestId: 'req-2' }, async () => {
        await new Promise((r) => setTimeout(r, 5));
        results.push(requestContext.getRequestId() ?? 'none');
      });

      await Promise.all([run1, run2]);
      expect(results).toContain('req-1');
      expect(results).toContain('req-2');
    });

    it('should not leak context to synchronous code outside run', () => {
      requestContext.run({ requestId: 'inner' }, () => {
        // inside context
      });
      expect(requestContext.getRequestId()).toBeUndefined();
    });
  });

  describe('get() returns full context', () => {
    it('should return all context data', () => {
      const result = requestContext.run(
        {
          requestId: 'req-full',
          userId: 'user-full',
          roles: ['ROLE1'],
          scopes: ['scope-full'],
        },
        () => {
          return requestContext.get();
        },
      );
      expect(result).toEqual({
        requestId: 'req-full',
        userId: 'user-full',
        roles: ['ROLE1'],
        scopes: ['scope-full'],
      });
    });
  });
});