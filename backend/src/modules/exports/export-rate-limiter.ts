import { Inject, Injectable } from '@nestjs/common';

export const EXPORT_RATE_LIMITER_CLOCK = Symbol('EXPORT_RATE_LIMITER_CLOCK');

const CREATE_WINDOW_MS = 60 * 1000;
const CREATE_USER_LIMIT = 10;
const DOWNLOAD_AUTH_WINDOW_MS = 60 * 1000;
const DOWNLOAD_AUTH_USER_LIMIT = 30;
const DOWNLOAD_BY_IP_WINDOW_MS = 60 * 1000;
const DOWNLOAD_BY_IP_LIMIT = 30;
const CLEANUP_INTERVAL_MS = Math.min(CREATE_WINDOW_MS, DOWNLOAD_AUTH_WINDOW_MS, DOWNLOAD_BY_IP_WINDOW_MS);

interface Counter {
  startedAt: number;
  count: number;
}

export interface ExportRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Backs the 429 responses the frozen contract documents for POST /exports ("Rate limited") and
 * POST /exports/{id}/download-authorizations ("Rate limited"). Same fixed-window,
 * injectable-clock design as AttachmentRateLimiter — no background timers, counters pruned
 * lazily on access.
 */
@Injectable()
export class ExportRateLimiter {
  private readonly createCounters = new Map<string, Counter>();
  private readonly downloadAuthCounters = new Map<string, Counter>();
  private readonly downloadByIpCounters = new Map<string, Counter>();
  private lastCleanupAt = 0;

  constructor(@Inject(EXPORT_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consumeCreate(userId: string): ExportRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.createCounters, userId, now, CREATE_WINDOW_MS);
    return counter.count > CREATE_USER_LIMIT ? this.blocked(counter, now, CREATE_WINDOW_MS) : { allowed: true };
  }

  consumeDownloadAuthorization(userId: string): ExportRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.downloadAuthCounters, userId, now, DOWNLOAD_AUTH_WINDOW_MS);
    return counter.count > DOWNLOAD_AUTH_USER_LIMIT ? this.blocked(counter, now, DOWNLOAD_AUTH_WINDOW_MS) : { allowed: true };
  }

  /** `ip` must be the connection's actual remote address, never a client-supplied header. */
  consumeDownloadByIp(ip: string): ExportRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.downloadByIpCounters, ip, now, DOWNLOAD_BY_IP_WINDOW_MS);
    return counter.count > DOWNLOAD_BY_IP_LIMIT ? this.blocked(counter, now, DOWNLOAD_BY_IP_WINDOW_MS) : { allowed: true };
  }

  private consume(counters: Map<string, Counter>, key: string, now: number, windowMs: number): Counter {
    const previous = counters.get(key);
    const counter = !previous || now - previous.startedAt >= windowMs
      ? { startedAt: now, count: 1 }
      : { startedAt: previous.startedAt, count: previous.count + 1 };
    counters.set(key, counter);
    return counter;
  }

  private blocked(counter: Counter, now: number, windowMs: number): ExportRateLimitResult {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((counter.startedAt + windowMs - now) / 1000)) };
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.removeExpired(this.createCounters, now, CREATE_WINDOW_MS);
    this.removeExpired(this.downloadAuthCounters, now, DOWNLOAD_AUTH_WINDOW_MS);
    this.removeExpired(this.downloadByIpCounters, now, DOWNLOAD_BY_IP_WINDOW_MS);
    this.lastCleanupAt = now;
  }

  private removeExpired(counters: Map<string, Counter>, now: number, windowMs: number): void {
    for (const [key, counter] of counters) {
      if (now - counter.startedAt >= windowMs) counters.delete(key);
    }
  }
}
