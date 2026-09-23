import { CertificateVerificationRateLimiter } from './certificate-verification-rate-limiter';

describe('CertificateVerificationRateLimiter', () => {
  let now: number;
  let limiter: CertificateVerificationRateLimiter;

  beforeEach(() => {
    now = 1_000_000;
    limiter = new CertificateVerificationRateLimiter(() => now);
  });

  it('limits a single IP after 20 requests within the window', () => {
    for (let attempt = 0; attempt < 20; attempt++) {
      expect(limiter.consume('203.0.113.5').allowed).toBe(true);
    }
    expect(limiter.consume('203.0.113.5').allowed).toBe(false);
  });

  it('tracks IPs independently', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consume('203.0.113.5');
    expect(limiter.consume('203.0.113.5').allowed).toBe(false);
    expect(limiter.consume('203.0.113.6').allowed).toBe(true);
  });

  it('resets after the window elapses and returns an integer retry-after', () => {
    for (let attempt = 0; attempt < 20; attempt++) limiter.consume('203.0.113.5');
    const blocked = limiter.consume('203.0.113.5');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
    now += 60 * 1000;
    expect(limiter.consume('203.0.113.5')).toEqual({ allowed: true });
  });
});
