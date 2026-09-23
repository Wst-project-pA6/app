import { createHash, randomBytes } from 'node:crypto';

export interface GeneratedVerificationToken {
  /** Random 256-bit token, returned to the caller once and never persisted (see schema.sql). */
  token: string;
  /** SHA-256 hex digest — the only form ever written to the certificates table. */
  tokenHash: string;
}

export function hashVerificationToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/**
 * 256-bit token from a cryptographically secure source, base64url-encoded (43 chars, no
 * padding) — matches the frozen VerificationToken parameter's minLength/pattern exactly.
 * Public verification never compares the raw token: it hashes the presented value the same
 * way and looks up an equality match on verification_token_hash (a unique, indexed column).
 * Because SHA-256 fully diffuses its input, a partial match on the hash leaks nothing about
 * the raw token, so this lookup is safe against timing attacks without an additional
 * byte-for-byte constant-time comparison in application code (contrast with
 * attachments/download-token.util.ts, which verifies an HMAC signature directly in app code
 * and so does apply timingSafeEqual there).
 */
export function generateVerificationToken(): GeneratedVerificationToken {
  const token = randomBytes(32).toString('base64url');
  return { token, tokenHash: hashVerificationToken(token) };
}
