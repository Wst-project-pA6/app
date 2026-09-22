import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';

export const AUTH_OPERATION_RATE_LIMITER_CLOCK = Symbol('AUTH_OPERATION_RATE_LIMITER_CLOCK');

const REFRESH_WINDOW_MS = 60 * 1000;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = REFRESH_WINDOW_MS;
const REFRESH_IP_LIMIT = 30;
const PASSWORD_USER_LIMIT = 5;
const PASSWORD_IP_LIMIT = 30;
const REGISTER_IP_LIMIT = 10;

interface Counter {
  startedAt: number;
  count: number;
}

export interface AuthOperationRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

@Injectable()
export class AuthOperationRateLimiter {
  private readonly refreshIpCounters = new Map<string, Counter>();
  private readonly passwordUserCounters = new Map<string, Counter>();
  private readonly passwordIpCounters = new Map<string, Counter>();
  private readonly registerIpCounters = new Map<string, Counter>();
  private lastCleanupAt = 0;

  constructor(@Inject(AUTH_OPERATION_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consumeRefresh(ip: string): AuthOperationRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.refreshIpCounters, ip, now, REFRESH_WINDOW_MS);
    return counter.count > REFRESH_IP_LIMIT
      ? this.blocked(counter, now, REFRESH_WINDOW_MS)
      : { allowed: true };
  }

  consumeChangePassword(userId: string, ip: string): AuthOperationRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const user = this.consume(this.passwordUserCounters, this.key(userId), now, PASSWORD_WINDOW_MS);
    const address = this.consume(this.passwordIpCounters, ip, now, PASSWORD_WINDOW_MS);
    const blocked = user.count > PASSWORD_USER_LIMIT || address.count > PASSWORD_IP_LIMIT;
    if (!blocked) return { allowed: true };
    return {
      allowed: false,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil(Math.max(
          user.count > PASSWORD_USER_LIMIT ? user.startedAt + PASSWORD_WINDOW_MS - now : 0,
          address.count > PASSWORD_IP_LIMIT ? address.startedAt + PASSWORD_WINDOW_MS - now : 0,
        ) / 1000),
      ),
    };
  }

  consumeRegister(ip: string): AuthOperationRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.registerIpCounters, ip, now, REGISTER_WINDOW_MS);
    return counter.count > REGISTER_IP_LIMIT
      ? this.blocked(counter, now, REGISTER_WINDOW_MS)
      : { allowed: true };
  }

  private consume(counters: Map<string, Counter>, key: string, now: number, windowMs: number): Counter {
    const previous = counters.get(key);
    const counter = !previous || now - previous.startedAt >= windowMs
      ? { startedAt: now, count: 1 }
      : { startedAt: previous.startedAt, count: previous.count + 1 };
    counters.set(key, counter);
    return counter;
  }

  private blocked(counter: Counter, now: number, windowMs: number): AuthOperationRateLimitResult {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((counter.startedAt + windowMs - now) / 1000)) };
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.removeExpired(this.refreshIpCounters, now, REFRESH_WINDOW_MS);
    this.removeExpired(this.passwordUserCounters, now, PASSWORD_WINDOW_MS);
    this.removeExpired(this.passwordIpCounters, now, PASSWORD_WINDOW_MS);
    this.removeExpired(this.registerIpCounters, now, REGISTER_WINDOW_MS);
    this.lastCleanupAt = now;
  }

  private removeExpired(counters: Map<string, Counter>, now: number, windowMs: number): void {
    for (const [key, counter] of counters) {
      if (now - counter.startedAt >= windowMs) counters.delete(key);
    }
  }

  private key(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }
}
