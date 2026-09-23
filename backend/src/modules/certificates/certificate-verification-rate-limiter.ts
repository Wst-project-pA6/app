import { Inject, Injectable } from '@nestjs/common';

export const CERTIFICATE_VERIFICATION_RATE_LIMITER_CLOCK = Symbol('CERTIFICATE_VERIFICATION_RATE_LIMITER_CLOCK');

const WINDOW_MS = 60 * 1000;
const IP_LIMIT = 20;
const CLEANUP_INTERVAL_MS = WINDOW_MS;

interface Counter {
  startedAt: number;
  count: number;
}

export interface CertificateVerificationRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Fixed-window, per-IP limiter for the public, unauthenticated certificate-verification
 * endpoint — the same deterministic, injectable-clock shape as AttachmentRateLimiter and
 * LoginRateLimiter. This is the only gate standing between a public token-guessing attempt and
 * the endpoint, so it must never be skippable by a client-supplied header; callers must pass
 * the connection's actual remote address, never X-Forwarded-For.
 */
@Injectable()
export class CertificateVerificationRateLimiter {
  private readonly ipCounters = new Map<string, Counter>();
  private lastCleanupAt = 0;

  constructor(@Inject(CERTIFICATE_VERIFICATION_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consume(ip: string): CertificateVerificationRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consumeCounter(ip, now);
    return counter.count > IP_LIMIT ? this.blocked(counter, now) : { allowed: true };
  }

  private consumeCounter(key: string, now: number): Counter {
    const previous = this.ipCounters.get(key);
    const counter = !previous || now - previous.startedAt >= WINDOW_MS
      ? { startedAt: now, count: 1 }
      : { startedAt: previous.startedAt, count: previous.count + 1 };
    this.ipCounters.set(key, counter);
    return counter;
  }

  private blocked(counter: Counter, now: number): CertificateVerificationRateLimitResult {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((counter.startedAt + WINDOW_MS - now) / 1000)) };
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    for (const [key, counter] of this.ipCounters) {
      if (now - counter.startedAt >= WINDOW_MS) this.ipCounters.delete(key);
    }
    this.lastCleanupAt = now;
  }
}
