import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

export const LOGIN_RATE_LIMITER_CLOCK = Symbol('LOGIN_RATE_LIMITER_CLOCK');

const WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_INTERVAL_MS = WINDOW_MS;
const ACCOUNT_LIMIT = 5;
const IP_LIMIT = 30;

interface WindowCounter {
  startedAt: number;
  count: number;
}

export interface LoginRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

@Injectable()
export class LoginRateLimiter {
  private readonly accountCounters = new Map<string, WindowCounter>();
  private readonly ipCounters = new Map<string, WindowCounter>();
  private lastCleanupAt = 0;

  constructor(@Inject(LOGIN_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consume(email: string, ip: string): LoginRateLimitResult {
    const now = this.clock();
    this.cleanupExpired(now);
    const accountCounter = this.consumeCounter(this.accountCounters, this.emailKey(email), now);
    const ipCounter = this.consumeCounter(this.ipCounters, ip, now);
    const blocked = accountCounter.count > ACCOUNT_LIMIT || ipCounter.count > IP_LIMIT;

    if (!blocked) return { allowed: true };

    const retryAfterMs = Math.max(
      accountCounter.count > ACCOUNT_LIMIT ? accountCounter.startedAt + WINDOW_MS - now : 0,
      ipCounter.count > IP_LIMIT ? ipCounter.startedAt + WINDOW_MS - now : 0,
    );
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
    };
  }

  private cleanupExpired(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;

    this.removeExpired(this.accountCounters, now);
    this.removeExpired(this.ipCounters, now);
    this.lastCleanupAt = now;
  }

  private removeExpired(counters: Map<string, WindowCounter>, now: number): void {
    for (const [key, counter] of counters) {
      if (now - counter.startedAt >= WINDOW_MS) counters.delete(key);
    }
  }

  private consumeCounter(
    counters: Map<string, WindowCounter>,
    key: string,
    now: number,
  ): WindowCounter {
    const existing = counters.get(key);
    const counter = !existing || now - existing.startedAt >= WINDOW_MS
      ? { startedAt: now, count: 1 }
      : { startedAt: existing.startedAt, count: existing.count + 1 };
    counters.set(key, counter);
    return counter;
  }

  private emailKey(email: string): string {
    return createHash('sha256').update(email, 'utf8').digest('hex');
  }
}
