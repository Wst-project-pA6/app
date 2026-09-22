import { AttachmentRateLimiter } from './attachment-rate-limiter';

describe('AttachmentRateLimiter', () => {
  let now: number;
  let limiter: AttachmentRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new AttachmentRateLimiter(() => now);
  });

  it('allows 20 uploads per user per minute and blocks the 21st with an integer Retry-After', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(limiter.consumeUpload('user-1').allowed).toBe(true);
    }
    const blocked = limiter.consumeUpload('user-1');
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(Number.isInteger(blocked.retryAfterSeconds)).toBe(true);
  });

  it('tracks upload limits independently per user', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consumeUpload('user-1');
    expect(limiter.consumeUpload('user-1').allowed).toBe(false);
    expect(limiter.consumeUpload('user-2').allowed).toBe(true);
  });

  it('resets the upload window after it elapses', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consumeUpload('user-1');
    expect(limiter.consumeUpload('user-1').allowed).toBe(false);
    now += 60 * 1000;
    expect(limiter.consumeUpload('user-1')).toEqual({ allowed: true });
  });

  it('allows 60 download authorizations per user per minute and blocks the 61st', () => {
    for (let attempt = 0; attempt < 60; attempt++) {
      expect(limiter.consumeDownloadAuthorization('user-1').allowed).toBe(true);
    }
    expect(limiter.consumeDownloadAuthorization('user-1')).toEqual({ allowed: false, retryAfterSeconds: 60 });
  });

  it('tracks upload and download-authorization counters independently', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consumeUpload('user-1');
    expect(limiter.consumeUpload('user-1').allowed).toBe(false);
    expect(limiter.consumeDownloadAuthorization('user-1').allowed).toBe(true);
  });

  it('allows 30 downloads per IP per minute and blocks the 31st with an integer Retry-After', () => {
    for (let attempt = 0; attempt < 30; attempt++) {
      expect(limiter.consumeDownloadByIp('203.0.113.9').allowed).toBe(true);
    }
    const blocked = limiter.consumeDownloadByIp('203.0.113.9');
    expect(blocked).toEqual({ allowed: false, retryAfterSeconds: 60 });
    expect(Number.isInteger(blocked.retryAfterSeconds)).toBe(true);
  });

  it('tracks the per-IP download limit independently per IP and resets after the window elapses', () => {
    for (let attempt = 0; attempt < 30; attempt++) limiter.consumeDownloadByIp('203.0.113.9');
    expect(limiter.consumeDownloadByIp('203.0.113.9').allowed).toBe(false);
    expect(limiter.consumeDownloadByIp('198.51.100.4').allowed).toBe(true);
    now += 60 * 1000;
    expect(limiter.consumeDownloadByIp('203.0.113.9')).toEqual({ allowed: true });
  });

  it('tracks the per-IP download limit independently of the per-user upload/authorization limits', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consumeUpload('user-1');
    expect(limiter.consumeUpload('user-1').allowed).toBe(false);
    expect(limiter.consumeDownloadByIp('203.0.113.9').allowed).toBe(true);
  });
});
