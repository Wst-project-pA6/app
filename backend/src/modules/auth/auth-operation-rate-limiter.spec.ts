import { createHash } from 'node:crypto';
import { AuthOperationRateLimiter } from './auth-operation-rate-limiter';

interface Counter {
  startedAt: number;
  count: number;
}

interface LimiterState {
  refreshIpCounters: ReadonlyMap<string, Counter>;
  passwordUserCounters: ReadonlyMap<string, Counter>;
}

describe('AuthOperationRateLimiter', () => {
  let now: number;
  let limiter: AuthOperationRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new AuthOperationRateLimiter(() => now);
  });

  it('allows 30 refresh attempts and blocks the 31st with Retry-After', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(limiter.consumeRefresh('10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consumeRefresh('10.0.0.1')).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('allows 10 registration attempts per IP and blocks the 11th with Retry-After', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(limiter.consumeRegister('10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consumeRegister('10.0.0.1')).toEqual({ allowed: false, retryAfterSeconds: 3600 });
  });

  it('tracks registration attempts independently per IP', () => {
    for (let attempt = 0; attempt < 10; attempt++) {
      expect(limiter.consumeRegister('10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consumeRegister('10.0.0.2').allowed).toBe(true);
  });

  it('allows five password attempts per user and blocks the sixth', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(limiter.consumeChangePassword('user-1', '10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consumeChangePassword('user-1', '10.0.0.1')).toEqual({
      allowed: false, retryAfterSeconds: 900,
    });
  });

  it('limits password attempts across different users by IP', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(limiter.consumeChangePassword(`user-${attempt}`, '10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consumeChangePassword('user-31', '10.0.0.1').allowed).toBe(false);
  });

  it('resets windows deterministically and lazily removes expired state', () => {
    limiter.consumeRefresh('10.0.0.1');
    now += 60_000;
    expect(limiter.consumeRefresh('10.0.0.2')).toEqual({ allowed: true });
    const state = limiter as unknown as LimiterState;
    expect(Array.from(state.refreshIpCounters.keys())).toEqual(['10.0.0.2']);
    now += 15 * 60_000;
    limiter.consumeChangePassword('user-2', '10.0.0.3');
    expect(Array.from(state.passwordUserCounters.keys())).toEqual([
      createHash('sha256').update('user-2', 'utf8').digest('hex'),
    ]);
  });

  it('stores hashed user IDs rather than plaintext keys', () => {
    limiter.consumeChangePassword('sensitive-user-id', '10.0.0.1');
    const state = limiter as unknown as LimiterState;
    const key = createHash('sha256').update('sensitive-user-id', 'utf8').digest('hex');
    expect(Array.from(state.passwordUserCounters.keys())).toEqual([key]);
    expect(Array.from(state.passwordUserCounters.keys())).not.toContain('sensitive-user-id');
  });
});
