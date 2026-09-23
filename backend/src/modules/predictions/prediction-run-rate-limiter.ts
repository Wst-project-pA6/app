import { Inject, Injectable } from '@nestjs/common';

export const PREDICTION_RUN_RATE_LIMITER_CLOCK = Symbol('PREDICTION_RUN_RATE_LIMITER_CLOCK');

const RUN_WINDOW_MS = 60 * 1000;
const RUN_USER_LIMIT = 10;

interface Counter {
  startedAt: number;
  count: number;
}

export interface PredictionRunRateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

/** Backs the 429 the frozen contract documents for POST /prediction-runs. Same fixed-window, injectable-clock design as ExportRateLimiter/AttachmentRateLimiter. */
@Injectable()
export class PredictionRunRateLimiter {
  private readonly counters = new Map<string, Counter>();
  private lastCleanupAt = 0;

  constructor(@Inject(PREDICTION_RUN_RATE_LIMITER_CLOCK) private readonly clock: () => number) {}

  consumeRun(userId: string): PredictionRunRateLimitResult {
    const now = this.clock();
    this.cleanup(now);
    const previous = this.counters.get(userId);
    const counter = !previous || now - previous.startedAt >= RUN_WINDOW_MS
      ? { startedAt: now, count: 1 }
      : { startedAt: previous.startedAt, count: previous.count + 1 };
    this.counters.set(userId, counter);
    if (counter.count > RUN_USER_LIMIT) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((counter.startedAt + RUN_WINDOW_MS - now) / 1000)) };
    }
    return { allowed: true };
  }

  private cleanup(now: number): void {
    if (now - this.lastCleanupAt < RUN_WINDOW_MS) return;
    for (const [key, counter] of this.counters) {
      if (now - counter.startedAt >= RUN_WINDOW_MS) this.counters.delete(key);
    }
    this.lastCleanupAt = now;
  }
}
