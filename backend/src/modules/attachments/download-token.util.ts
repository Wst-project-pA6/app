import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs/verifies the query-string token bound to a download_authorizations row id AND the
 * user it was issued to. The signature — not the row id — is the actual bearer credential:
 * the id is an unguessable UUID but is never treated as sufficient proof by itself, and the
 * signed payload never contains the attachment's object_storage_key or any filesystem path.
 * Binding issuedTo into the signature (rather than only checking it after signature
 * verification) means a tampered/forged "issuedTo" cannot be substituted without also forging
 * the signature.
 */
export function signDownloadToken(
  authorizationId: string,
  issuedTo: string,
  expiresAtMillis: number,
  secret: string,
): string {
  return createHmac('sha256', secret)
    .update(`${authorizationId}.${issuedTo}.${expiresAtMillis}`)
    .digest('base64url');
}

export function verifyDownloadToken(
  authorizationId: string,
  issuedTo: string,
  expiresAtMillis: number,
  signature: string,
  secret: string,
): boolean {
  if (!Number.isFinite(expiresAtMillis) || typeof signature !== 'string' || signature.length === 0) return false;
  const expected = Buffer.from(signDownloadToken(authorizationId, issuedTo, expiresAtMillis, secret), 'utf8');
  const provided = Buffer.from(signature, 'utf8');
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(expected, provided);
}
