import { Inject, Injectable } from '@nestjs/common';

export const ATTACHMENT_RATE_LIMITER_CLOCK = Symbol('ATTACHMENT_RATE_LIMITER_CLOCK');

const UPLOAD_WINDOW_MS = 60 * 1000;
const UPLOAD_USER_LIMIT = 20;
const DOWNLOAD_AUTH_WINDOW_MS = 60 * 1000;
const DOWNLOAD_AUTH_USER_LIMIT = 60;
const DOWNLOAD_BY_IP_WINDOW_MS = 60 * 1000;
const DOWNLOAD_BY_IP_LIMIT = 30;
const CLEANUP_INTERVAL_MS = Math.min(UPLOAD_WINDOW_MS, DOWNLOAD_AUTH_WINDOW_MS, DOWNLOAD_BY_IP_WINDOW_MS);

interface Counter {
  startedAt: number;
  count: number;
}

export interface AttachmentRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/**
 * Deterministic, injectable-clock rate limiter for attachment upload, download-authorization
 * issuance, and download-by-token traffic, following the AuthOperationRateLimiter pattern
 * (Session 6/11): no background timers, fixed windows, counters pruned lazily on access.
 */
@Injectable()
export class AttachmentRateLimiter {
  private readonly uploadCounters = new Map<string, Counter>();
  private readonly downloadAuthCounters = new Map<string, Counter>();
  private readonly downloadByIpCounters = new Map<string, Counter>();
  private lastCleanupAt = 0;

  constructor(@Inject(ATTACHMENT_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consumeUpload(userId: string): AttachmentRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.uploadCounters, userId, now, UPLOAD_WINDOW_MS);
    return counter.count > UPLOAD_USER_LIMIT ? this.blocked(counter, now, UPLOAD_WINDOW_MS) : { allowed: true };
  }

  consumeDownloadAuthorization(userId: string): AttachmentRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.downloadAuthCounters, userId, now, DOWNLOAD_AUTH_WINDOW_MS);
    return counter.count > DOWNLOAD_AUTH_USER_LIMIT
      ? this.blocked(counter, now, DOWNLOAD_AUTH_WINDOW_MS)
      : { allowed: true };
  }

  /**
   * Fixed-window, per-IP limit for the signed download-fetch route. `ip` must be the
   * connection's actual remote address (e.g. `req.socket.remoteAddress`) — callers must never
   * pass a client-supplied header such as X-Forwarded-For, which would let a caller reset
   * their own limit at will.
   */
  consumeDownloadByIp(ip: string): AttachmentRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const counter = this.consume(this.downloadByIpCounters, ip, now, DOWNLOAD_BY_IP_WINDOW_MS);
    return counter.count > DOWNLOAD_BY_IP_LIMIT
      ? this.blocked(counter, now, DOWNLOAD_BY_IP_WINDOW_MS)
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

  private blocked(counter: Counter, now: number, windowMs: number): AttachmentRateLimitResult {
    return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((counter.startedAt + windowMs - now) / 1000)) };
  }

  /** Lazy, bounded cleanup: runs at most once per CLEANUP_INTERVAL_MS, on access, never on a timer. */
  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < CLEANUP_INTERVAL_MS) return;
    this.removeExpired(this.uploadCounters, now, UPLOAD_WINDOW_MS);
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
