import { createHash } from 'node:crypto';
import { LoginRateLimiter } from './login-rate-limiter';

interface CounterState {
  startedAt: number;
  count: number;
}

interface LimiterState {
  accountCounters: ReadonlyMap<string, CounterState>;
  ipCounters: ReadonlyMap<string, CounterState>;
}

describe('LoginRateLimiter', () => {
  let now: number;
  let limiter: LoginRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new LoginRateLimiter(() => now);
  });

  it('limits an exact, case-sensitive email after five attempts', () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      expect(limiter.consume('User@example.com', '10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consume('User@example.com', '10.0.0.1').allowed).toBe(false);
    expect(limiter.consume('user@example.com', '10.0.0.1').allowed).toBe(true);
  });

  it('limits an IP across different emails', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(limiter.consume(`user${attempt}@example.com`, '10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consume('another@example.com', '10.0.0.1').allowed).toBe(false);
  });

  it('consumes both counters for blocked requests', () => {
    for (let attempt = 0; attempt < 5; attempt++) limiter.consume('user@example.com', '10.0.0.1');
    expect(limiter.consume('user@example.com', '10.0.0.1').allowed).toBe(false);
    for (let attempt = 0; attempt < 24; attempt++) {
      expect(limiter.consume(`other${attempt}@example.com`, '10.0.0.1').allowed).toBe(true);
    }
    expect(limiter.consume('last@example.com', '10.0.0.1').allowed).toBe(false);
  });

  it('resets expired windows and returns integer retry-after seconds', () => {
    for (let attempt = 0; attempt < 5; attempt++) limiter.consume('user@example.com', '10.0.0.1');
    const blocked = limiter.consume('user@example.com', '10.0.0.1');
    expect(blocked.retryAfterSeconds).toBe(900);
    now += 15 * 60 * 1000;
    expect(limiter.consume('user@example.com', '10.0.0.1')).toEqual({ allowed: true });
  });

  it('stores the SHA-256 account key and lazily prunes expired account and IP entries', () => {
    limiter.consume('first@example.com', '10.0.0.1');
    limiter.consume('second@example.com', '10.0.0.2');
    const state = limiter as unknown as LimiterState;
    const accountKey = createHash('sha256').update('first@example.com', 'utf8').digest('hex');

    expect(Array.from(state.accountCounters.keys())).toContain(accountKey);
    expect(Array.from(state.accountCounters.keys())).not.toContain('first@example.com');
    expect(Array.from(state.ipCounters.keys())).toEqual(['10.0.0.1', '10.0.0.2']);

    now += 15 * 60 * 1000;
    limiter.consume('new@example.com', '10.0.0.3');

    expect(Array.from(state.accountCounters.keys())).toEqual([
      createHash('sha256').update('new@example.com', 'utf8').digest('hex'),
    ]);
    expect(Array.from(state.ipCounters.keys())).toEqual(['10.0.0.3']);
  });
});
